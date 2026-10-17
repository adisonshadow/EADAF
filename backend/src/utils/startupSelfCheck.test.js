const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../config');
const selfCheck = require('./startupSelfCheck');

function model(schema, tableName) {
  return { getTableName: () => ({ schema, tableName }) };
}

function fullEnv(overrides = {}) {
  const env = Object.fromEntries(selfCheck.ENV_KEYS.map((key) => [key, `value-for-${key}`]));
  env.JWT_SECRET = 'unit-test-secret';
  return { ...env, ...overrides };
}

test('表清单以模型为准：跨 schema 汇总并去重', () => {
  const tables = selfCheck.expectedTables({
    User: model('eadaf', 'users'),
    Role: model('eadaf', 'roles'),
    Scope: model('aibase', 'scopes'),
    DuplicatedUser: model('eadaf', 'users'),
    // 非模型对象（models/index.js 里还有导出别名之类）不应炸
    notAModel: null,
    associationHelper: { getTableName: undefined },
  });
  assert.deepEqual(
    tables.map((item) => `${item.schema}.${item.table}`).sort(),
    ['aibase.scopes', 'eadaf.roles', 'eadaf.users'],
  );
});

test('库结构齐全：通过，并报出表数量', () => {
  const item = selfCheck.evaluateStructure({
    expected: [{ schema: 'eadaf', table: 'users' }, { schema: 'aibase', table: 'scopes' }],
    found: [
      { table_schema: 'eadaf', table_name: 'users' },
      { table_schema: 'aibase', table_name: 'scopes' },
      { table_schema: 'bizdata_mat', table_name: 'FPCU_case' },
    ],
  });
  assert.equal(item.status, 'ok');
  assert.match(item.text, /eadaf \/ aibase/);
  assert.match(item.text, /2\/2 张表/);
});

test('库结构缺表：报出缺多少、缺哪些，并给 init-db 修复', () => {
  const item = selfCheck.evaluateStructure({
    expected: [
      { schema: 'eadaf', table: 'users' },
      { schema: 'eadaf', table: 'storage_upload_sessions' },
    ],
    found: [],
    schemaName: 'eadaf',
  });
  assert.equal(item.status, 'fail');
  assert.match(item.text, /缺 2\/2 张表/);
  assert.match(item.text, /eadaf\.users/);
  assert.match(item.hint.join('\n'), /init-db/);
  assert.doesNotMatch(item.hint.join('\n'), /migrate-uac-to-eadaf/, '没有遗留 schema 时不该提迁移');
});

test('库里还留着 uac schema：直接指向迁移脚本，而不是重建', () => {
  const item = selfCheck.evaluateStructure({
    expected: [{ schema: 'eadaf', table: 'users' }],
    found: [],
    legacySchemas: ['uac'],
    schemaName: 'eadaf',
  });
  assert.equal(item.status, 'fail');
  assert.match(item.hint.join('\n'), /migrate-uac-to-eadaf/);
  assert.doesNotMatch(item.hint.join('\n'), /init-db/);
});

test('Node 版本低于 22.13 判失败', () => {
  const opts = { nodeEnv: 'development', port: 29526 };
  assert.equal(selfCheck.checkRuntime({ ...opts, nodeVersion: '22.12.0' }).status, 'fail');
  assert.equal(selfCheck.checkRuntime({ ...opts, nodeVersion: '22.13.0' }).status, 'ok');
  assert.equal(selfCheck.checkRuntime({ ...opts, nodeVersion: '24.20.0' }).status, 'ok');
  assert.equal(selfCheck.checkRuntime({ ...opts, nodeVersion: '20.11.1' }).status, 'fail');
});

test('env 关键键：开发环境告警、生产环境失败', () => {
  const empty = selfCheck.checkEnvConfig({ env: {}, nodeEnv: 'development' });
  assert.equal(empty.status, 'warn');
  assert.match(empty.text, /关键键 0\//);
  assert.match(empty.text, /缺 /);

  assert.equal(selfCheck.checkEnvConfig({ env: {}, nodeEnv: 'production' }).status, 'fail');

  assert.equal(selfCheck.checkEnvConfig({ env: fullEnv(), nodeEnv: 'development' }).status, 'ok');
  assert.equal(selfCheck.checkEnvConfig({ env: fullEnv(), nodeEnv: 'production' }).status, 'ok');
});

test('JWT_SECRET 用示例默认值：开发环境放过、生产环境失败', () => {
  const dev = selfCheck.checkEnvConfig({
    env: fullEnv({ JWT_SECRET: 'my-jwt-secret-key' }),
    nodeEnv: 'development',
  });
  assert.equal(dev.status, 'ok');
  assert.match(dev.text, /示例值/);

  const prod = selfCheck.checkEnvConfig({
    env: fullEnv({ JWT_SECRET: 'my-jwt-secret-key' }),
    nodeEnv: 'production',
  });
  assert.equal(prod.status, 'fail');
});

test('PostgreSQL 不可达：跳过库结构 / 系统桶，且不连库', async () => {
  let touched = false;
  const rows = await selfCheck.runStartupChecks({
    dependencies: [{ key: 'postgres', label: 'PostgreSQL', reachable: false }],
    sequelize: { query: () => { touched = true; throw new Error('不应连库'); } },
    modelsMap: {},
  });
  assert.equal(touched, false, 'PG 不可达时不该再发查询');
  const byLabel = Object.fromEntries(rows.map((row) => [row.label, row.status]));
  assert.equal(byLabel['库结构'], 'skip');
  assert.equal(byLabel['系统存储桶'], 'skip');
});

test('库结构失败：系统桶跳过，不重复报同一件事', async () => {
  const rows = await selfCheck.runStartupChecks({
    dependencies: [{ key: 'postgres', label: 'PostgreSQL', reachable: true }],
    modelsMap: { User: model('eadaf', 'users') },
    sequelize: { query: async () => [] },
  });
  const byLabel = Object.fromEntries(rows.map((row) => [row.label, row.status]));
  assert.equal(byLabel['库结构'], 'fail');
  assert.equal(byLabel['系统存储桶'], 'skip');
  assert.equal(byLabel['运行环境'], 'ok');
});

test('库结构齐全：系统桶跟着检查，顺序为 环境 → 连接 → 结构', async () => {
  const rows = await selfCheck.runStartupChecks({
    dependencies: [{ key: 'postgres', label: 'PostgreSQL', reachable: true }],
    modelsMap: { User: model(config.postgresql.schema, 'users') },
    ensureBucketRecord: async () => ({ bucket_id: 'test' }),
    sequelize: {
      query: async (sql) => (sql.includes('information_schema')
        ? [{ table_schema: config.postgresql.schema, table_name: 'users' }]
        : []),
    },
  });
  const labels = rows.map((row) => row.label);
  assert.deepEqual(labels, ['运行环境', 'env 配置', '库结构', '系统存储桶']);
  assert.equal(rows[2].status, 'ok');
  assert.equal(rows[3].status, 'ok');
  assert.equal(rows[0].group, 'pre');
  assert.equal(rows[2].group, 'post');
});
