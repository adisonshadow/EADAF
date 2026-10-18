'use strict';

/**
 * 启动项自检：服务起来之前该确认的事，一次说清。
 *
 * 为什么要补这一层：2026-10-17 的事故里，PostgreSQL 连接完全正常，但 20 张核心表都在
 * 改名前的 `uac` schema 里，代码按 `eadaf` 找表 —— 每条 SQL 都报 relation ... does not exist。
 * 旧的「依赖自检」只探 TCP 端口，端口通就算通过，于是结论写成了「PostgreSQL 不可用」，
 * 把人往「Docker 没起」的方向带了一整轮。
 *
 * 这里补上端口之外的三件事：运行环境、env 配置、库结构（schema + 模型声明的表），
 * 外加系统内置 Storage Bucket 是否就绪（原先 fire-and-forget，失败只有一句「初始化失败」）。
 *
 * 只负责「探测 + 给结论」，渲染统一交给 dependencyDiagnostics.printStartupReport，
 * 保证启动时只有一份自检输出。检查项互不阻塞：任何一项失败都不影响服务继续启动。
 */
const fs = require('node:fs');
const path = require('node:path');
const { QueryTypes } = require('sequelize');

const config = require('../config');
const { envFileCandidates } = require('../config/envFiles');

const BACKEND_ROOT = path.join(__dirname, '../..');

/** backend/package.json engines 要求 >= 22.13。 */
const MIN_NODE = { major: 22, minor: 13 };

/** 缺了会静默退到 config 默认值的连接类键：列出来才能看出「其实用的是默认值」。 */
const ENV_KEYS = [
  'POSTGRES_HOST',
  'POSTGRES_PORT',
  'POSTGRES_DATABASE',
  'POSTGRES_USER',
  'POSTGRES_SCHEMA',
  'MINIO_ENDPOINT',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
  'MINIO_BUCKET',
  'JWT_SECRET',
];

/** 改名前的 schema：还在，说明这个库没跑过 uac → eadaf 迁移。 */
const LEGACY_SCHEMAS = ['uac', 'uac2'];

const JWT_DEFAULT_SECRET = 'my-jwt-secret-key';

/* ------------------------------------------------------------------ *
 * 结果项
 * ------------------------------------------------------------------ */

function ok(label, text) {
  return { label, status: 'ok', text, hint: null };
}

function warn(label, text, hint = null) {
  return { label, status: 'warn', text, hint };
}

function fail(label, text, hint = null) {
  return { label, status: 'fail', text, hint };
}

function skip(label, text) {
  return { label, status: 'skip', text, hint: null };
}

/** 错误信息的第一行 + 截断：自检是给人看的，不要吐整段堆栈。 */
function firstLine(message) {
  const text = String(message || '未知错误').split('\n')[0].trim();
  return text.length > 100 ? `${text.slice(0, 97)}...` : text;
}

/* ------------------------------------------------------------------ *
 * 运行环境
 * ------------------------------------------------------------------ */

function checkRuntime({
  nodeVersion = process.versions.node,
  nodeEnv = process.env.NODE_ENV,
  port = config.api.port,
} = {}) {
  const [major, minor] = String(nodeVersion).split('.').map((part) => Number(part) || 0);
  const versionOk = major > MIN_NODE.major || (major === MIN_NODE.major && minor >= MIN_NODE.minor);
  const text = `node v${nodeVersion} · ${nodeEnv || '未设置'} · :${port}`;
  if (versionOk) return ok('运行环境', text);
  return fail(
    '运行环境',
    `${text}（需要 >= ${MIN_NODE.major}.${MIN_NODE.minor}）`,
    ['backend/package.json 的 engines 是硬要求：Node 版本过低会在运行时随机炸'],
  );
}

/* ------------------------------------------------------------------ *
 * env 配置
 * ------------------------------------------------------------------ */

function checkEnvConfig({ env = process.env, nodeEnv = process.env.NODE_ENV, backendRoot = BACKEND_ROOT } = {}) {
  const files = envFileCandidates({ backendRoot, nodeEnv })
    .filter((file) => fs.existsSync(file))
    .map((file) => path.basename(file));
  const where = files.length ? files.join(' → ') : '未找到 env 文件';
  const missing = ENV_KEYS.filter((key) => !String(env[key] ?? '').trim());
  const set = ENV_KEYS.length - missing.length;
  const usesDefaultJwt = String(env.JWT_SECRET || '').trim() === JWT_DEFAULT_SECRET;
  const production = nodeEnv === 'production';

  if (missing.length) {
    return production
      ? fail('env 配置', `${where} · 关键键 ${set}/${ENV_KEYS.length}（缺 ${missing.join('、')}）`, [
        '生产环境不能靠默认值：这些键会退到 config 里的 localhost / eadaf 默认值',
        '骨架见 backend/.env.example',
      ])
      : warn('env 配置', `${where} · 关键键 ${set}/${ENV_KEYS.length}（缺 ${missing.join('、')}）`, [
        '这些键会退到 config 里的默认值，确认与你本机 Docker 的端口 / 账号一致',
      ]);
  }

  if (usesDefaultJwt) {
    return production
      ? fail('env 配置', `${where} · JWT_SECRET 仍是示例默认值`, [
        '生产环境必须换成随机密钥：openssl rand -hex 32',
      ])
      : ok('env 配置', `${where} · 关键键 ${set}/${ENV_KEYS.length}（JWT_SECRET 为示例值，仅限本机）`);
  }

  return ok('env 配置', `${where} · 关键键 ${set}/${ENV_KEYS.length}`);
}

/* ------------------------------------------------------------------ *
 * 库结构：schema + 模型声明的表
 * ------------------------------------------------------------------ */

/**
 * 事实来源是 Sequelize 模型本身：模型声明了哪些 schema.table，库里就该有这些表。
 * 这样新增模型时自检自动跟上，不用维护第二份表清单。
 */
function expectedTables(modelsMap) {
  const tables = new Map();
  for (const model of Object.values(modelsMap || {})) {
    if (!model || typeof model.getTableName !== 'function') continue;
    const table = model.getTableName();
    const schema = typeof table === 'string' ? config.postgresql.schema : table.schema;
    const name = typeof table === 'string' ? table : table.tableName;
    if (!schema || !name) continue;
    tables.set(`${schema}.${name}`, { schema, table: name });
  }
  return [...tables.values()];
}

/** 纯函数：拿「期望的表」和「库里实际有的表」比一次，产出结论项。 */
function evaluateStructure({ expected, found = [], legacySchemas = [], schemaName = config.postgresql.schema }) {
  const schemas = [...new Set(expected.map((item) => item.schema))];
  const foundSet = new Set(found.map((row) => `${row.table_schema}.${row.table_name}`));
  const missing = expected.filter((item) => !foundSet.has(`${item.schema}.${item.table}`));

  if (!missing.length) {
    return ok('库结构', `${schemas.join(' / ')} · ${expected.length}/${expected.length} 张表`);
  }

  const legacy = legacySchemas.filter((name) => LEGACY_SCHEMAS.includes(name));
  const sample = missing.slice(0, 3).map((item) => `${item.schema}.${item.table}`).join('、');
  const more = missing.length > 3 ? ' 等' : '';
  const hint = legacy.length
    ? [`库里还留着旧 schema ${legacy.join('、')}：pnpm --filter ./backend migrate-uac-to-eadaf`]
    : [
      '已有库升级：pnpm --filter ./backend db:migrate（只补缺表/缺列/索引，不动数据）',
      `全新库：pnpm --filter ./backend init-db（重建 ${schemaName}，会清空数据）`,
    ];

  return fail('库结构', `缺 ${missing.length}/${expected.length} 张表（${sample}${more}）`, hint);
}

async function checkDbStructure({ sequelize = null, modelsMap = null } = {}) {
  const models = modelsMap || require('../models');
  const expected = expectedTables(models);
  if (!expected.length) return skip('库结构', '没有加载到模型，跳过表检查');

  const schemas = [...new Set(expected.map((item) => item.schema))];
  const client = sequelize || require('../config/database');

  try {
    const found = await client.query(
      "select table_schema, table_name from information_schema.tables where table_type = 'BASE TABLE' and table_schema = any($1::text[])",
      { bind: [schemas], type: QueryTypes.SELECT },
    );
    const legacy = await client.query(
      'select nspname from pg_namespace where nspname = any($1::text[])',
      { bind: [LEGACY_SCHEMAS], type: QueryTypes.SELECT },
    );
    return evaluateStructure({
      expected,
      found,
      legacySchemas: legacy.map((row) => row.nspname),
    });
  } catch (error) {
    return fail('库结构', `查询 information_schema 失败：${firstLine(error.message)}`, [
      '连接可用但查询失败时，多半是权限或 schema 不存在，见上面的连接项',
    ]);
  }
}

/* ------------------------------------------------------------------ *
 * 系统内置 Storage Bucket
 * ------------------------------------------------------------------ */

async function checkSystemBucket({ ensure = null } = {}) {
  const ensureBucketRecord = ensure || require('../services/storage/systemBucketService').ensureSystemBucket;
  const code = config.storage.systemBucket.code;
  try {
    await ensureBucketRecord();
    return ok('系统存储桶', `${code}（eadaf.storage_buckets 已就绪）`);
  } catch (error) {
    return fail('系统存储桶', `${code} 初始化失败：${firstLine(error.message)}`, [
      '它只是 eadaf.storage_buckets 里的一行记录，库结构恢复后会自动补建，不需要手工插',
    ]);
  }
}

/* ------------------------------------------------------------------ *
 * 汇总
 * ------------------------------------------------------------------ */

function withGroup(rows) {
  return rows.map((row, index) => ({ group: index < 2 ? 'pre' : 'post', ...row }));
}

/**
 * 跑一遍自检，返回要并进启动报告的额外项。
 * 连接三项不在这里探：由调用方把 probeDependencies() 的结果传进来，避免重复探端口。
 * `ensureBucketRecord` 只给测试注入用，生产走 systemBucketService.ensureSystemBucket。
 */
async function runStartupChecks({
  dependencies = [],
  sequelize = null,
  modelsMap = null,
  ensureBucketRecord = null,
} = {}) {
  const rows = [checkRuntime(), checkEnvConfig()];
  const postgres = dependencies.find((dep) => dep.key === 'postgres');

  if (postgres && !postgres.reachable) {
    rows.push(skip('库结构', 'PostgreSQL 不可达，跳过表检查'));
    rows.push(skip('系统存储桶', 'PostgreSQL 不可达，跳过'));
    return withGroup(rows);
  }

  const structure = await checkDbStructure({ sequelize, modelsMap });
  rows.push(structure);
  rows.push(
    structure.status === 'fail'
      ? skip('系统存储桶', '库结构未就绪，跳过')
      : await checkSystemBucket({ ensure: ensureBucketRecord }),
  );
  return withGroup(rows);
}

module.exports = {
  ENV_KEYS,
  LEGACY_SCHEMAS,
  MIN_NODE,
  checkRuntime,
  checkEnvConfig,
  expectedTables,
  evaluateStructure,
  checkDbStructure,
  checkSystemBucket,
  runStartupChecks,
};
