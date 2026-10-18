const test = require('node:test');
const assert = require('node:assert/strict');

const alignment = require('./schemaAlignment');

/** 只关心「补列」这一层，因此不依赖真库：模型与 sequelize 都用最小替身。 */
function column(typeSql, extra = {}) {
  return { type: { key: extra.key || 'STRING', toSql: () => typeSql } };
}

function model({ schema = 'eadaf', table, attributes, underscored = true }) {
  return {
    getTableName: () => ({ schema, tableName: table }),
    options: { schema, underscored },
    rawAttributes: attributes,
  };
}

function fakeSequelize({ columns = [], failOn = null } = {}) {
  const statements = [];
  return {
    statements,
    async query(sql) {
      const text = String(sql);
      if (failOn && text.includes(failOn)) throw new Error('boom');
      if (text.includes('information_schema.columns')) return columns;
      statements.push(text);
      return [];
    },
  };
}

const quietLog = { warn() {}, info() {}, error() {} };

test('模型列表 -> 列清单：跨模型去重、驼峰转下划线、尊重 field', () => {
  const tables = alignment.collectModelColumns({
    User: model({
      table: 'users',
      attributes: {
        id: column('UUID'),
        displayName: column('VARCHAR(64)'),
        legacyCode: { field: 'legacy_code_col', ...column('VARCHAR(10)') },
      },
    }),
    UserAlias: model({ table: 'users', attributes: { id: column('UUID') } }),
    // 非模型对象（models/index.js 里有别名与辅助导出）不该炸
    notAModel: null,
    helper: { getTableName: undefined },
  });

  assert.deepEqual([...tables.keys()], ['eadaf.users']);
  const names = tables.get('eadaf.users').columns.map((item) => item.name);
  assert.deepEqual(names, ['id', 'display_name', 'legacy_code_col']);
});

test('underscored: false 的模型保持原列名', () => {
  const tables = alignment.collectModelColumns({
    Legacy: model({
      schema: 'bizdata',
      table: 'legacy',
      underscored: false,
      attributes: { displayName: column('VARCHAR(64)') },
    }),
  });
  assert.deepEqual(tables.get('bizdata.legacy').columns.map((item) => item.name), ['displayName']);
});

test('补列语句：标识符加引号 + IF NOT EXISTS', () => {
  const statement = alignment.buildAddColumnStatement(
    { schema: 'aibase', table: 'api_request_logs' },
    { name: 'turn_id', attribute: column('VARCHAR(64)') },
  );
  assert.equal(
    statement,
    'ALTER TABLE "aibase"."api_request_logs" ADD COLUMN IF NOT EXISTS "turn_id" VARCHAR(64)',
  );
});

test('不能内联成列的属性跳过：虚拟字段、ENUM', () => {
  const virtual = alignment.buildAddColumnStatement(
    { schema: 'eadaf', table: 'users' },
    { name: 'full_name', attribute: { type: { key: 'VIRTUAL', toSql: () => 'VIRTUAL' } } },
  );
  assert.equal(virtual, null);

  const enumColumn = alignment.buildAddColumnStatement(
    { schema: 'eadaf', table: 'users' },
    { name: 'status', attribute: column("ENUM('A','B')", { key: 'ENUM' }) },
  );
  assert.equal(enumColumn, null);
});

test('库里缺列：补上缺的那一列，已有列不动，且从不删改', async () => {
  const client = fakeSequelize({
    columns: [
      { table_schema: 'eadaf', table_name: 'users', column_name: 'id' },
    ],
  });
  const result = await alignment.alignSchema({
    sequelize: client,
    modelsMap: {
      User: model({
        table: 'users',
        attributes: {
          id: column('UUID'),
          displayName: column('VARCHAR(64)'),
        },
      }),
    },
    log: quietLog,
  });

  assert.deepEqual(result.added, ['eadaf.users.display_name']);
  assert.deepEqual(result.failed, []);
  assert.equal(client.statements.length, 2, '一条补列 + 一条配套索引');
  assert.match(client.statements[0], /ADD COLUMN IF NOT EXISTS "display_name"/);
  for (const statement of client.statements) {
    assert.doesNotMatch(statement, /\b(DROP|TRUNCATE|DELETE|ALTER COLUMN)\b/i);
  }
});

test('表都不在：不建表、不瞎补列（交给启动自检与 db:migrate）', async () => {
  const client = fakeSequelize({ columns: [] });
  const result = await alignment.alignSchema({
    sequelize: client,
    modelsMap: { User: model({ table: 'users', attributes: { id: column('UUID') } }) },
    log: quietLog,
  });

  assert.deepEqual(result.added, []);
  assert.deepEqual(result.skipped, ['eadaf.users']);
  assert.equal(client.statements.length, 0);
});

test('幂等：结构已对齐时不再发任何 DDL', async () => {
  const client = fakeSequelize({
    columns: [
      { table_schema: 'eadaf', table_name: 'users', column_name: 'id' },
      { table_schema: 'eadaf', table_name: 'users', column_name: 'display_name' },
    ],
  });
  const result = await alignment.alignSchema({
    sequelize: client,
    modelsMap: {
      User: model({ table: 'users', attributes: { id: column('UUID'), displayName: column('VARCHAR(64)') } }),
    },
    log: quietLog,
  });

  assert.deepEqual(result.added, []);
  assert.equal(client.statements.length, 0);
});

test('查不到 information_schema（无权限 / 连接问题）：只记失败，不抛', async () => {
  const client = fakeSequelize({ failOn: 'information_schema' });
  const result = await alignment.alignSchema({
    sequelize: client,
    modelsMap: { User: model({ table: 'users', attributes: { id: column('UUID') } }) },
    log: quietLog,
  });

  assert.equal(result.added.length, 0);
  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0].error, /boom/);
});
