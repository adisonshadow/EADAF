#!/usr/bin/env node
/**
 * 打包安装包时，把开发库里的默认业务连接「本地 PostgreSQL（应用库）」写进目标 .env。
 *
 * 容器里不能用开发机的 localhost:映射端口。本机地址会改成服务名 postgres:5432，
 * 宿主机映射端口、账号、库名、schema 仍沿用这条连接；外部地址则原样写入。
 *
 *   node scripts/deploy/export-default-db-connection.cjs --env <安装包>/.env
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const repoRoot = path.resolve(__dirname, '../..');
const requireFromBackend = createRequire(path.join(repoRoot, 'backend/package.json'));
const { Client } = requireFromBackend('pg');

const DEFAULT_NAME = '本地 PostgreSQL（应用库）';

function arg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1 || !process.argv[i + 1]) {
    console.error(`缺少参数 ${name}`);
    process.exit(1);
  }
  return process.argv[i + 1];
}

function loadEnvFile(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  const text = fs.readFileSync(file, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function isLocalHost(host) {
  const value = String(host || '').trim().toLowerCase();
  return value === 'localhost' || value === '127.0.0.1' || value === '::1' || value === 'host.docker.internal';
}

function escapeEnv(value) {
  const text = String(value ?? '');
  if (/[\s#"'\\]/.test(text)) return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return text;
}

function upsertEnv(text, key, value) {
  const line = `${key}=${escapeEnv(value)}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(text)) return text.replace(pattern, line);
  return `${text.replace(/\s*$/, '')}\n${line}\n`;
}

function decryptPassword(passwordEnc) {
  if (!passwordEnc) return '';
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';
  const { decryptApiKey } = requireFromBackend('./src/utils/encryption');
  return decryptApiKey(passwordEnc) || '';
}

async function readDefaultConnection(env) {
  const client = new Client({
    host: env.POSTGRES_HOST || 'localhost',
    port: Number(env.POSTGRES_PORT || 25432),
    user: env.POSTGRES_USER || 'my_name',
    password: env.POSTGRES_PASSWORD || '123456',
    database: env.POSTGRES_DATABASE || 'eadaf_db',
  });
  await client.connect();
  try {
    const named = await client.query(
      `SELECT id, name, db_type, host, port, username, password_enc, database_name, target_schema, is_default
         FROM bizdata.database_connections
        WHERE name = $1
        ORDER BY is_default DESC
        LIMIT 1`,
      [DEFAULT_NAME],
    );
    if (named.rows[0]) return named.rows[0];
    const fallback = await client.query(
      `SELECT id, name, db_type, host, port, username, password_enc, database_name, target_schema, is_default
         FROM bizdata.database_connections
        WHERE is_default = true AND db_type = 'postgresql'
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1`,
    );
    return fallback.rows[0] || null;
  } finally {
    await client.end();
  }
}

async function main() {
  const envPath = path.resolve(arg('--env'));
  if (!fs.existsSync(envPath)) {
    console.error(`找不到安装包环境文件: ${envPath}`);
    process.exit(1);
  }
  const devEnv = loadEnvFile(path.join(repoRoot, 'backend/.env.development'));
  const row = await readDefaultConnection(devEnv);
  if (!row) {
    console.error(`开发库里没有「${DEFAULT_NAME}」或默认 PostgreSQL 连接，已停止打包`);
    process.exit(1);
  }

  const local = isLocalHost(row.host);
  const password = decryptPassword(row.password_enc) || devEnv.POSTGRES_PASSWORD || '123456';
  const schema = row.target_schema || 'bizdata_mat';
  const bizHost = local ? 'postgres' : row.host;
  const bizPort = local ? 5432 : row.port;

  let text = fs.readFileSync(envPath, 'utf8');
  const pairs = {
    BIZDATA_CONN_HOST: bizHost,
    BIZDATA_CONN_PORT: String(bizPort),
    BIZDATA_CONN_DATABASE: row.database_name,
    BIZDATA_CONN_USER: row.username,
    BIZDATA_CONN_PASSWORD: password,
    BIZDATA_CONN_SCHEMA: schema,
  };
  if (local) {
    pairs.POSTGRES_HOST_PORT = String(row.port);
    pairs.POSTGRES_DATABASE = row.database_name;
    pairs.POSTGRES_USER = row.username;
    pairs.POSTGRES_PASSWORD = password;
  }
  for (const [key, value] of Object.entries(pairs)) {
    text = upsertEnv(text, key, value);
  }
  fs.writeFileSync(envPath, text.endsWith('\n') ? text : `${text}\n`);

  console.log(
    `[pack] 默认业务库「${row.name}」已写入安装包：`
    + `${row.host}:${row.port}/${row.database_name} schema=${schema}`
    + (local ? ` → 容器内 ${bizHost}:${bizPort}，宿主机端口 ${row.port}` : '（外部地址，原样使用）'),
  );
}

main().catch((error) => {
  console.error(`[pack] 读取默认业务库连接失败: ${error.message}`);
  process.exit(1);
});
