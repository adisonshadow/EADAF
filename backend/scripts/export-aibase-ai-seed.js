#!/usr/bin/env node
/**
 * 从当前库导出 aibase scopes/tools/skills/skill_tools/skill_applications
 * 以及 eadaf.applications.top_level_skill_markdown，生成权威种子 SQL。
 *
 * 用法（在 backend 目录）:
 *   node scripts/export-aibase-ai-seed.js > scripts/aibase-ai-seed.sql
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..');
const NODE_ENV = process.env.NODE_ENV || 'development';
const envFile = path.join(ROOT, `.env.${NODE_ENV}`);
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (Buffer.isBuffer(value)) return `'\\x${value.toString('hex')}'`;
  if (typeof value === 'object') {
    return `${sqlString(JSON.stringify(value))}::jsonb`;
  }
  return sqlString(String(value));
}

function sqlString(s) {
  return `'${s.replace(/'/g, "''")}'`;
}

function insertRows(table, columns, rows) {
  if (!rows.length) {
    return `-- (no rows for ${table})\n`;
  }
  const lines = [`-- ${table}: ${rows.length} rows`];
  for (const row of rows) {
    const vals = columns.map((c) => sqlLiteral(row[c]));
    lines.push(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${vals.join(', ')});`,
    );
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const client = new Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '25432', 10),
    database: process.env.POSTGRES_DATABASE || 'eadaf_db',
    user: process.env.POSTGRES_USER || 'my_name',
    password: process.env.POSTGRES_PASSWORD || '123456',
  });
  await client.connect();

  const scopes = (
    await client.query(
      `SELECT id, name, slug, description, is_active, created_at, updated_at
       FROM aibase.scopes ORDER BY slug`,
    )
  ).rows;
  const tools = (
    await client.query(
      `SELECT id, scope_id, name, slug, function_name, description, execution_type,
              parameters_schema, review_markdown, server_config, is_active, created_at, updated_at
       FROM aibase.tools ORDER BY function_name`,
    )
  ).rows;
  const skills = (
    await client.query(
      `SELECT id, scope_id, name, slug, description, content_markdown, is_active,
              is_global, is_dedicated, completion_strategy, created_at, updated_at
       FROM aibase.skills ORDER BY slug`,
    )
  ).rows;
  const skillTools = (
    await client.query(
      `SELECT id, skill_id, tool_id, sort_order
       FROM aibase.skill_tools ORDER BY skill_id, sort_order, tool_id`,
    )
  ).rows;
  const skillApps = (
    await client.query(
      `SELECT id, skill_id, application_id, created_at
       FROM aibase.skill_applications ORDER BY skill_id, application_id`,
    )
  ).rows;
  const topLevel = (
    await client.query(
      `SELECT application_id, code, name, top_level_skill_markdown
       FROM eadaf.applications
       WHERE top_level_skill_markdown IS NOT NULL AND btrim(top_level_skill_markdown) <> ''
       ORDER BY code`,
    )
  ).rows;

  await client.end();

  const out = [];
  out.push(`-- aibase-ai-seed.sql`);
  out.push(`-- 权威 AI 元数据种子：scopes / tools / skills / skill_tools / skill_applications`);
  out.push(`-- 由 scripts/export-aibase-ai-seed.js 从现库导出；initdb --with-aibase-seed 只跑本文件（+ aibase-seed providers）。`);
  out.push(`-- 生成时间: ${new Date().toISOString()}`);
  out.push(`-- scopes=${scopes.length} tools=${tools.length} skills=${skills.length} skill_tools=${skillTools.length} skill_apps=${skillApps.length}`);
  out.push(``);
  out.push(`BEGIN;`);
  out.push(``);
  out.push(`-- 清空 AI Skill/Tool 元数据（保留 providers/models）`);
  out.push(`TRUNCATE TABLE`);
  out.push(`  aibase.skill_tools,`);
  out.push(`  aibase.skill_applications,`);
  out.push(`  aibase.skills,`);
  out.push(`  aibase.tools,`);
  out.push(`  aibase.scopes`);
  out.push(`RESTART IDENTITY CASCADE;`);
  out.push(``);

  out.push(
    insertRows('aibase.scopes', [
      'id',
      'name',
      'slug',
      'description',
      'is_active',
      'created_at',
      'updated_at',
    ], scopes),
  );
  out.push(
    insertRows(
      'aibase.tools',
      [
        'id',
        'scope_id',
        'name',
        'slug',
        'function_name',
        'description',
        'execution_type',
        'parameters_schema',
        'review_markdown',
        'server_config',
        'is_active',
        'created_at',
        'updated_at',
      ],
      tools,
    ),
  );
  out.push(
    insertRows(
      'aibase.skills',
      [
        'id',
        'scope_id',
        'name',
        'slug',
        'description',
        'content_markdown',
        'is_active',
        'is_global',
        'is_dedicated',
        'completion_strategy',
        'created_at',
        'updated_at',
      ],
      skills,
    ),
  );
  out.push(
    insertRows('aibase.skill_tools', ['id', 'skill_id', 'tool_id', 'sort_order'], skillTools),
  );
  out.push(
    insertRows(
      'aibase.skill_applications',
      ['id', 'skill_id', 'application_id', 'created_at'],
      skillApps,
    ),
  );

  if (topLevel.length) {
    out.push(`-- 应用顶层 Skill Markdown`);
    for (const row of topLevel) {
      out.push(
        `UPDATE eadaf.applications SET top_level_skill_markdown = ${sqlLiteral(row.top_level_skill_markdown)}, updated_at = CURRENT_TIMESTAMP WHERE application_id = ${sqlLiteral(row.application_id)};`,
      );
    }
    out.push(``);
  }

  out.push(`COMMIT;`);
  out.push(``);

  process.stdout.write(out.join('\n'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
