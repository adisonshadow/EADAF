'use strict';

/**
 * 启动时的库结构「自愈」：只做加法。
 *
 * 为什么需要这一层：模型的列一旦比库里多（典型场景是代码更新了、库还是旧的），
 * 受影响的不只是某个写法特殊的接口，而是**所有**读写这张表的接口。真实例子：
 * `aibase.api_request_logs` 缺 `turn_id` 时，AI 请求日志列表直接 500、日志写入静默失败，
 * 用户侧只看到「莫名其妙坏了」，排查要从 500 一路翻到 information_schema 才能定位。
 *
 * 因此这里在启动自检之前，按模型声明把「模型有、库里缺」的列补上：
 *   - 只用 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`，
 *     **绝不**删列、改类型、删表；
 *   - 缺表不自动建：表结构以 `scripts/*.sql` 为准，凭模型建表会和规范结构分叉，
 *     交给启动自检报告，并指向非破坏性的 `pnpm db:migrate`；
 *   - 任何一条失败只告警、不阻塞启动：生产库可能不给应用账号 DDL 权限；
 *   - 幂等：重复启动无副作用，多实例同时启动也只是多几次 IF NOT EXISTS。
 *
 * 只在启动时调用一次（`src/app.js` 的 `bootstrap()`），不参与请求路径。
 */
const { QueryTypes } = require('sequelize');

const logger = require('./logger');

/**
 * 补列之后的配套索引：与 `scripts/migrate-api-request-log-tool-audit.sql` 对齐。
 * 索引不建不会报错，但会让日志查询走全表扫，所以和列一起补。
 */
const FOLLOW_UP_DDL = [
  'CREATE INDEX IF NOT EXISTS idx_api_request_logs_turn_id'
    + ' ON aibase.api_request_logs (turn_id)',
  `CREATE TABLE IF NOT EXISTS eadaf.three_member_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_type VARCHAR(64) NOT NULL,
    summary VARCHAR(500) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    requester_id UUID NOT NULL,
    requester_name VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    comment TEXT,
    reviewer_id UUID,
    reviewer_name VARCHAR(100),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,
];

/** 这些类型的列不能直接用 toSql() 内联进 DDL（需要先建类型 / 无对应列类型）。 */
const UNSUPPORTED_TYPE_KEYS = new Set(['VIRTUAL', 'ENUM', 'GEOMETRY', 'GEOGRAPHY']);

/** 驼峰转下划线：与 Sequelize 全局 `underscored: true` 一致。 */
function underscore(name) {
  return String(name).replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

function quoteIdent(ident) {
  return `"${String(ident).replace(/"/g, '""')}"`;
}

/** 模型属性 -> 实际列名（尊重 attr.field 与全局 underscored）。 */
function columnNameOf(name, attribute, underscored) {
  return String(attribute.field || attribute.fieldName || (underscored ? underscore(name) : name));
}

/** 能否把该属性的类型直接写成 DDL 片段；不能返回 null（交给人工迁移）。 */
function typeSqlOf(attribute) {
  const type = attribute && attribute.type;
  if (!type || UNSUPPORTED_TYPE_KEYS.has(type.key)) return null;
  if (typeof type.toSql !== 'function') return null;
  try {
    const sql = type.toSql();
    return typeof sql === 'string' && sql.trim() ? sql.trim() : null;
  } catch {
    return null;
  }
}

/**
 * 汇总「模型期望的列」：`schema.table` -> { schema, table, columns: [{ name, attribute }] }。
 * 同一张表被多个模型引用时合并去重（models/index.js 里有别名导出）。
 */
function collectModelColumns(modelsMap) {
  const tables = new Map();

  for (const model of Object.values(modelsMap || {})) {
    if (!model || typeof model.getTableName !== 'function' || !model.rawAttributes) continue;

    let tableName;
    try {
      tableName = model.getTableName();
    } catch {
      continue;
    }
    if (!tableName) continue;

    const table = typeof tableName === 'string' ? tableName : tableName.tableName;
    const schema = (typeof tableName === 'object' && tableName.schema)
      || model._schema
      || (model.options && model.options.schema);
    if (!table || !schema) continue;

    const key = `${schema}.${table}`;
    if (!tables.has(key)) tables.set(key, { schema, table, columns: [] });
    const entry = tables.get(key);
    const underscored = !(model.options && model.options.underscored === false);

    for (const [name, attribute] of Object.entries(model.rawAttributes)) {
      const column = columnNameOf(name, attribute, underscored);
      if (entry.columns.some((item) => item.name === column)) continue;
      entry.columns.push({ name: column, attribute });
    }
  }

  return tables;
}

/** 生成一条「补列」语句；类型不可内联时返回 null。 */
function buildAddColumnStatement(table, column) {
  const typeSql = typeSqlOf(column.attribute);
  if (!typeSql) return null;
  return `ALTER TABLE ${quoteIdent(table.schema)}.${quoteIdent(table.table)}`
    + ` ADD COLUMN IF NOT EXISTS ${quoteIdent(column.name)} ${typeSql}`;
}

async function queryExistingColumns(client, schemas) {
  const rows = await client.query(
    `select table_schema, table_name, column_name
       from information_schema.columns
      where table_schema = any($1::text[])`,
    { bind: [schemas], type: QueryTypes.SELECT },
  );
  return rows || [];
}

/**
 * 补齐「模型有、库里缺」的列。
 *
 * 返回 { checkedTables, added, skipped, failed }：
 * - added：本次补上的 `schema.table.column`
 * - skipped：表不存在 / 类型不能自动补列的项（由启动自检或 db:migrate 兜）
 * - failed：执行失败的项（只告警，不影响启动）
 */
async function alignSchema({ sequelize = null, modelsMap = null, log = logger } = {}) {
  const models = modelsMap || require('../models');
  const client = sequelize || require('../config/database');
  const tables = collectModelColumns(models);
  const result = { checkedTables: tables.size, added: [], skipped: [], failed: [] };
  if (!tables.size) return result;

  const schemas = [...new Set([...tables.values()].map((table) => table.schema))];

  let existing;
  try {
    existing = await queryExistingColumns(client, schemas);
  } catch (error) {
    // 连不上库 / 没权限看 information_schema：交给启动自检去说结论
    result.failed.push({ target: schemas.join(','), error: error.message });
    return result;
  }

  const existingColumns = new Set(
    existing.map((row) => `${row.table_schema}.${row.table_name}.${row.column_name}`),
  );
  const existingTables = new Set(
    existing.map((row) => `${row.table_schema}.${row.table_name}`),
  );

  let addedAnything = false;

  for (const [tableKey, table] of tables) {
    if (!existingTables.has(tableKey)) {
      result.skipped.push(tableKey);
      continue;
    }
    for (const column of table.columns) {
      const target = `${tableKey}.${column.name}`;
      if (existingColumns.has(target)) continue;

      const statement = buildAddColumnStatement(table, column);
      if (!statement) {
        result.skipped.push(target);
        continue;
      }
      try {
        await client.query(statement);
        result.added.push(target);
        addedAnything = true;
      } catch (error) {
        result.failed.push({ target, error: error.message });
      }
    }
  }

  if (addedAnything) {
    for (const statement of FOLLOW_UP_DDL) {
      try {
        await client.query(statement);
      } catch (error) {
        // 表不存在或账号无 DDL 权限：索引缺失不影响正确性，只记一笔
        result.failed.push({ target: 'index', error: error.message });
      }
    }
  }

  if (result.added.length) {
    log.warn('库结构自愈：已补上模型有、库里缺的列（只加不删）', { added: result.added });
  }
  if (result.failed.length) {
    log.warn('库结构自愈：有项没能自动处理（服务继续启动）', { failed: result.failed });
  }

  return result;
}

module.exports = {
  FOLLOW_UP_DDL,
  UNSUPPORTED_TYPE_KEYS,
  underscore,
  quoteIdent,
  columnNameOf,
  typeSqlOf,
  collectModelColumns,
  buildAddColumnStatement,
  alignSchema,
};
