/**
 * 导入时源物理表 schema 与本地连接物化 schema 不一致的处置。
 *
 * 物化按本地连接的 target_schema 建表,写数按包内每个实体的 targetSchema 找表。
 * 包内出现多个 schema,或与本地 schema 不同时,预览列出本地 schema;
 * 用户确认 forceTargetSchema 后,全部表建到该 schema,行数据也写入该 schema。
 */
const connectionRunner = require('../businessData/materialization/connectionRunner');

const SCHEMA_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SYSTEM_SCHEMAS = new Set([
  'information_schema',
  'pg_catalog',
  'pg_toast',
  'mysql',
  'performance_schema',
  'sys',
]);

function isSelectableSchema(name) {
  const schema = String(name || '').trim();
  if (!SCHEMA_NAME_RE.test(schema) || schema.length > 63) return false;
  if (schema.startsWith('pg_')) return false;
  if (SYSTEM_SCHEMAS.has(schema.toLowerCase())) return false;
  return true;
}

/** 空值返回 null;非法或系统 schema 抛 400 */
function assertForceTargetSchema(value) {
  if (value == null || String(value).trim() === '') return null;
  const schema = String(value).trim();
  if (!isSelectableSchema(schema)) {
    throw Object.assign(
      new Error(`forceTargetSchema「${schema}」不是可选用的 schema 名`),
      { status: 400 },
    );
  }
  return schema;
}

/** 按包内 targetSchema 汇总实体数与行数(无 schema 的跳过项不计入) */
function summarizeFileSchemas(entityData) {
  const map = new Map();
  for (const item of entityData || []) {
    const schema = String(item?.targetSchema || '').trim();
    if (!schema) continue;
    const dbType = item.dbType || null;
    if (dbType && dbType !== 'postgresql' && dbType !== 'mysql') continue;
    const current = map.get(schema) || { schema, entityCount: 0, rowCount: 0 };
    current.entityCount += 1;
    current.rowCount += Number(item.rowCount) || 0;
    map.set(schema, current);
  }
  return [...map.values()].sort(
    (a, b) => b.rowCount - a.rowCount || a.schema.localeCompare(b.schema),
  );
}

/**
 * 需要用户确认改写 schema:
 * 包内不止一个 schema,或唯一 schema 与本地连接物化 schema 不同。
 */
function relocationNeeded(fileSchemas, localSchema) {
  if (!fileSchemas?.length) return false;
  if (fileSchemas.length > 1) return true;
  return fileSchemas[0].schema !== String(localSchema || '').trim();
}

function buildRelocationReason({ fileSchemas, localSchema, connectionName, connectionCount }) {
  const detail = fileSchemas
    .map((item) => `${item.schema}（${item.entityCount} 个实体，${item.rowCount} 行）`)
    .join('、');
  const localText = localSchema
    ? `本地连接「${connectionName || '未命名'}」的物化 schema 为 ${localSchema}`
    : `本地连接「${connectionName || '未命名'}」未配置物化 schema`;
  const multi = connectionCount > 1
    ? '本次行数据涉及多个源连接，所选 schema 会用于全部物化与写数。'
    : '';
  return `导出包中的物理表分布在 ${detail}。${localText}。物化按本地连接 schema 建表，写数按包内 schema 找表，两边不一致时会出现 relation does not exist。请从下面的本地 schema 中选择一个并确认，导入会把全部物理表建到该 schema，并把行数据写入该 schema。${multi}`;
}

/** 已有 schema 与连接配置 schema 合并;配置项排在前面,库中还没有的也会列出(确认后创建) */
function mergeSchemaOptions(existingNames, configuredSchema) {
  const existing = new Set();
  const map = new Map();
  for (const raw of existingNames || []) {
    const name = String(raw || '').trim();
    if (!isSelectableSchema(name)) continue;
    existing.add(name);
    map.set(name, { name, configured: false, exists: true });
  }
  const configured = String(configuredSchema || '').trim();
  if (isSelectableSchema(configured)) {
    map.set(configured, {
      name: configured,
      configured: true,
      exists: existing.has(configured),
    });
  }
  return [...map.values()].sort((a, b) => {
    if (a.configured !== b.configured) return a.configured ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

async function listDatabaseSchemas(runtime) {
  if (runtime.dbType === 'postgresql') {
    return connectionRunner.withPgClient(runtime, async (client) => {
      const res = await client.query(
        `SELECT schema_name AS name
         FROM information_schema.schemata
         WHERE schema_name <> 'information_schema'
           AND schema_name NOT LIKE 'pg\\_%' ESCAPE '\\'
         ORDER BY schema_name`,
      );
      return res.rows.map((row) => row.name).filter(Boolean);
    });
  }
  if (runtime.dbType === 'mysql') {
    return connectionRunner.withMysqlClient(runtime, async (conn) => {
      const [rows] = await conn.query(
        `SELECT SCHEMA_NAME AS name
         FROM information_schema.SCHEMATA
         WHERE SCHEMA_NAME NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
         ORDER BY SCHEMA_NAME`,
      );
      return rows.map((row) => row.name || row.NAME).filter(Boolean);
    });
  }
  return [];
}

function countSourceConnections(entityData) {
  const ids = new Set();
  for (const item of entityData || []) {
    if (item?.targetSchema && item.connectionSourceId) ids.add(item.connectionSourceId);
  }
  return ids.size;
}

function pickPrimarySourceId(entityData) {
  const counts = new Map();
  for (const item of entityData || []) {
    if (!item?.targetSchema || !item.connectionSourceId) continue;
    counts.set(item.connectionSourceId, (counts.get(item.connectionSourceId) || 0) + 1);
  }
  let picked = null;
  let best = -1;
  for (const [sourceId, count] of counts) {
    if (count > best) {
      best = count;
      picked = sourceId;
    }
  }
  return picked;
}

/**
 * @param {object} args
 * @param {object[]} args.entityData
 * @param {object[]} args.connectionMatches
 * @param {object[]} args.hints
 * @param {object[]} args.targetConnections 含 password_enc 的连接行
 * @param {Function} args.findCredentialTemplate
 */
async function buildSchemaRelocation({
  entityData,
  connectionMatches,
  hints,
  targetConnections,
  findCredentialTemplate,
}) {
  const fileSchemas = summarizeFileSchemas(entityData);
  const sourceId = pickPrimarySourceId(entityData);
  const match = sourceId
    ? (connectionMatches || []).find((item) => item.sourceId === sourceId)
    : null;
  const hint = sourceId ? (hints || []).find((item) => item.sourceId === sourceId) : null;
  const usable = Boolean(match && (match.matched || match.willCreate));
  const connection = usable && match.matched
    ? (targetConnections || []).find((row) => row.id === match.targetId)
    : null;
  const template = usable && !connection && hint
    ? findCredentialTemplate(hint, targetConnections || [])
    : null;
  const probe = connection || template || null;
  const localSchema = connection
    ? (connection.target_schema || null)
    : (hint?.targetSchema || template?.target_schema || (usable ? 'bizdata_mat' : null));
  const connectionName = connection?.name || template?.name || hint?.name || match?.targetName || null;
  const dbType = connection?.db_type || template?.db_type || hint?.dbType || match?.dbType || null;

  const base = {
    needed: false,
    reason: '',
    fileSchemas,
    localSchema: localSchema || null,
    connectionName,
    sourceId: sourceId || null,
    dbType,
    localSchemas: [],
    listError: null,
  };
  if (!usable || !relocationNeeded(fileSchemas, localSchema)) return base;

  let existing = [];
  if (probe && (dbType === 'postgresql' || dbType === 'mysql')) {
    try {
      const { buildRuntimeConfig } = require('../businessData/databaseConnectionService');
      existing = await listDatabaseSchemas(buildRuntimeConfig(probe));
    } catch (error) {
      base.listError = error instanceof Error ? error.message : String(error);
    }
  } else {
    base.listError = '该连接类型无法列出 schema';
  }
  base.needed = true;
  base.localSchemas = mergeSchemaOptions(existing, localSchema);
  base.reason = buildRelocationReason({
    fileSchemas,
    localSchema,
    connectionName,
    connectionCount: countSourceConnections(entityData),
  });
  return base;
}

module.exports = {
  isSelectableSchema,
  assertForceTargetSchema,
  summarizeFileSchemas,
  relocationNeeded,
  buildRelocationReason,
  mergeSchemaOptions,
  listDatabaseSchemas,
  buildSchemaRelocation,
};
