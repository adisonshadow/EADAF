#!/usr/bin/env node
/**
 * 从开发库导出某个应用的 bizdata 模型定义，写成幂等 upsert SQL。
 * 不导出用户、口令、物化历史、物化后的业务行。
 *
 *   node scripts/deploy/export-bizdata.cjs --application EADAF --out /tmp/bizdata-patch.sql
 *
 * 暂时停用：数据包补丁不再从开发库导出。配置与业务数据改走管理端「系统设置」。
 */
'use strict';

console.error('数据补丁已暂时停用。请用管理端「系统设置」的 EADAF / 应用数据包导出、导入。');
process.exit(1);

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const repoRoot = path.resolve(__dirname, '../..');
const requireFromBackend = createRequire(path.join(repoRoot, 'backend/package.json'));
const { Client } = requireFromBackend('pg');

const DEFAULT_CONN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function arg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1 || !process.argv[i + 1]) {
    console.error(`缺少参数 ${name}`);
    process.exit(1);
  }
  return process.argv[i + 1];
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function sqlIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (Buffer.isBuffer(value)) return `'\\x${value.toString('hex')}'`;
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function likePrefix(prefix) {
  return prefix.replace(/[\\%_]/g, (ch) => '\\' + ch);
}

function parseScopes(raw) {
  if (raw == null) return [];
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (Array.isArray(value)) {
    return value.map((s) => String(s || '').trim()).filter(Boolean);
  }
  return [];
}

function parseDomainCodes(raw) {
  if (!raw || typeof raw !== 'object') return [];
  if (Array.isArray(raw.domainCodes)) {
    return raw.domainCodes.map((s) => String(s || '').trim()).filter(Boolean);
  }
  return [];
}

async function main() {
  const applicationCode = arg('--application');
  const outFile = arg('--out');

  loadEnvFile(path.join(repoRoot, 'backend/.env.development'));
  loadEnvFile(path.join(repoRoot, 'backend/.env.development.local'));

  const client = new Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT || 35432),
    database: process.env.POSTGRES_DATABASE || 'eadaf_db',
    user: process.env.POSTGRES_USER || 'my_name',
    password: process.env.POSTGRES_PASSWORD || '123456',
  });
  await client.connect();

  const appRes = await client.query(
    `SELECT code, bizdata_scope_codes, api_data_scope
     FROM eadaf.applications
     WHERE code = $1
     LIMIT 1`,
    [applicationCode]
  );
  if (appRes.rowCount === 0) {
    console.error(`开发库中没有应用 ${applicationCode}，无法导出 bizdata`);
    process.exit(1);
  }
  const app = appRes.rows[0];
  let scopes = parseScopes(app.bizdata_scope_codes);
  if (scopes.length === 0) scopes = parseDomainCodes(app.api_data_scope);
  if (scopes.length === 0) {
    console.error(
      `应用 ${applicationCode} 没有 bizdata_scope_codes（也没有 api_data_scope.domainCodes）。` +
        '拒绝导出，避免把整张 bizdata 表打进补丁。'
    );
    process.exit(1);
  }

  const prefixParams = scopes.map(likePrefix);
  const entityRes = await client.query(
    `SELECT * FROM bizdata.entities e
     WHERE EXISTS (
       SELECT 1 FROM unnest($1::text[]) AS p(prefix)
       WHERE e.code = p.prefix OR e.code LIKE p.prefix || ':%' ESCAPE '\\'
     )
     ORDER BY code`,
    [prefixParams]
  );
  if (entityRes.rowCount === 0) {
    console.error(
      `应用 ${applicationCode} 的 scope（${scopes.join(', ')}）下没有 bizdata 实体，拒绝打空包。`
    );
    process.exit(1);
  }

  const entityIds = entityRes.rows.map((row) => row.id);
  const lines = [];
  lines.push('-- EADAF bizdata 模型补丁。幂等 upsert，不删除 schema，不含物化业务行。');
  lines.push(`-- application=${applicationCode} scopes=${scopes.join(',')}`);
  lines.push('BEGIN;');
  lines.push(
    `UPDATE eadaf.applications SET bizdata_scope_codes = ${sqlLiteral(scopes)}::jsonb, updated_at = CURRENT_TIMESTAMP WHERE code = ${sqlLiteral(applicationCode)};`
  );

  async function tableExists(name) {
    const r = await client.query('SELECT to_regclass($1) AS rel', [`bizdata.${name}`]);
    return Boolean(r.rows[0] && r.rows[0].rel);
  }

  async function primaryKey(name) {
    const r = await client.query(
      `SELECT a.attname
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
       WHERE i.indrelid = $1::regclass AND i.indisprimary
       ORDER BY array_position(i.indkey, a.attnum)`,
      [`bizdata.${name}`]
    );
    return r.rows.map((row) => row.attname);
  }

  function emitRows(table, rows, pk) {
    if (!rows.length || !pk.length) return;
    for (const row of rows) {
      const cols = Object.keys(row).filter((col) => col !== 'password_enc');
      const values = cols.map((col) => {
        if (col === 'connection_id' && row[col]) return sqlLiteral(DEFAULT_CONN);
        return sqlLiteral(row[col]);
      });
      const updates = cols
        .filter((col) => !pk.includes(col))
        .map((col) => `${sqlIdent(col)} = EXCLUDED.${sqlIdent(col)}`);
      const conflict = pk.map(sqlIdent).join(', ');
      const updateSql = updates.length ? `DO UPDATE SET ${updates.join(', ')}` : 'DO NOTHING';
      lines.push(
        `INSERT INTO bizdata.${sqlIdent(table)} (${cols.map(sqlIdent).join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT (${conflict}) ${updateSql};`
      );
    }
  }

  async function dump(table, sql, params) {
    if (!(await tableExists(table))) return;
    const pk = await primaryKey(table);
    if (!pk.length) return;
    const result = await client.query(sql, params);
    emitRows(table, result.rows, pk);
  }

  await dump('enums',
    `SELECT * FROM bizdata.enums e
     WHERE EXISTS (
       SELECT 1 FROM unnest($1::text[]) AS p(prefix)
       WHERE e.code = p.prefix OR e.code LIKE p.prefix || ':%' ESCAPE '\\'
     )`,
    [prefixParams]);

  emitRows('entities', entityRes.rows, await primaryKey('entities'));

  await dump('entity_fields',
    'SELECT * FROM bizdata.entity_fields WHERE entity_id = ANY($1::uuid[])',
    [entityIds]);
  await dump('relations',
    `SELECT * FROM bizdata.relations
     WHERE from_entity_id = ANY($1::uuid[]) OR to_entity_id = ANY($1::uuid[])`,
    [entityIds]);
  await dump('scope_docs',
    `SELECT * FROM bizdata.scope_docs d
     WHERE EXISTS (
       SELECT 1 FROM unnest($1::text[]) AS p(prefix)
       WHERE d.code = p.prefix OR d.code LIKE p.prefix || ':%' ESCAPE '\\'
     )`,
    [prefixParams]);
  await dump('data_standards',
    `SELECT * FROM bizdata.data_standards d
     WHERE EXISTS (
       SELECT 1 FROM unnest($1::text[]) AS p(prefix)
       WHERE d.code = p.prefix OR d.code LIKE p.prefix || ':%' ESCAPE '\\'
     )`,
    [prefixParams]);
  await dump('api_services',
    `SELECT * FROM bizdata.api_services s
     WHERE s.entity_id = ANY($1::uuid[])
        OR EXISTS (
          SELECT 1 FROM unnest($2::text[]) AS p(prefix)
          WHERE s.code = p.prefix OR s.code LIKE p.prefix || ':%' ESCAPE '\\'
             OR s.scope_code = p.prefix OR s.scope_code LIKE p.prefix || ':%' ESCAPE '\\'
        )`,
    [entityIds, prefixParams]);

  const serviceIds = (await client.query(
    `SELECT id FROM bizdata.api_services s
     WHERE s.entity_id = ANY($1::uuid[])
        OR EXISTS (
          SELECT 1 FROM unnest($2::text[]) AS p(prefix)
          WHERE s.code = p.prefix OR s.code LIKE p.prefix || ':%' ESCAPE '\\'
             OR s.scope_code = p.prefix OR s.scope_code LIKE p.prefix || ':%' ESCAPE '\\'
        )`,
    [entityIds, prefixParams]
  )).rows.map((row) => row.id);

  if (serviceIds.length) {
    await dump('api_service_operations',
      'SELECT * FROM bizdata.api_service_operations WHERE api_service_id = ANY($1::uuid[])',
      [serviceIds]);
  }

  await dump('metrics',
    `SELECT * FROM bizdata.metrics m
     WHERE EXISTS (
       SELECT 1 FROM unnest($1::text[]) AS pref(prefix)
       WHERE m.scope_code = pref.prefix OR m.scope_code LIKE pref.prefix || ':%' ESCAPE '\\'
          OR m.code = pref.prefix OR m.code LIKE pref.prefix || ':%' ESCAPE '\\'
     )`,
    [prefixParams]);

  const metricIds = (await client.query(
    `SELECT id FROM bizdata.metrics m
     WHERE EXISTS (
       SELECT 1 FROM unnest($1::text[]) AS pref(prefix)
       WHERE m.scope_code = pref.prefix OR m.scope_code LIKE pref.prefix || ':%' ESCAPE '\\'
          OR m.code = pref.prefix OR m.code LIKE pref.prefix || ':%' ESCAPE '\\'
     )`,
    [prefixParams]
  )).rows.map((row) => row.id);
  if (metricIds.length) {
    await dump('metric_cards',
      'SELECT * FROM bizdata.metric_cards WHERE metric_id = ANY($1::uuid[])',
      [metricIds]);
  }

  await dump('collection_pipelines',
    `SELECT * FROM bizdata.collection_pipelines p
     WHERE p.entity_id = ANY($1::uuid[])
        OR EXISTS (
          SELECT 1 FROM unnest($2::text[]) AS pref(prefix)
          WHERE p.code = pref.prefix OR p.code LIKE pref.prefix || ':%' ESCAPE '\\'
        )`,
    [entityIds, prefixParams]);

  await dump('metadata_tables',
    `SELECT * FROM bizdata.metadata_tables t
     WHERE t.target_id = ANY($1::uuid[])
        OR EXISTS (
          SELECT 1 FROM unnest($2::text[]) AS p(prefix)
          WHERE t.code = p.prefix OR t.code LIKE p.prefix || ':%' ESCAPE '\\'
        )`,
    [entityIds, prefixParams]);

  const metaIds = (await client.query(
    `SELECT id FROM bizdata.metadata_tables t
     WHERE t.target_id = ANY($1::uuid[])`,
    [entityIds]
  )).rows.map((row) => row.id);
  if (metaIds.length) {
    await dump('metadata_fields',
      'SELECT * FROM bizdata.metadata_fields WHERE metadata_table_id = ANY($1::uuid[])',
      [metaIds]);
  }

  lines.push('COMMIT;');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, lines.join('\n') + '\n');
  console.log(`已导出 ${entityRes.rowCount} 个实体 -> ${outFile}`);
  await client.end();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
