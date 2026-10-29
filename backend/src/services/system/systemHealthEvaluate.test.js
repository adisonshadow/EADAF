const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateSystemHealth,
  skippedDbFacts,
  BIZDATA_CONNECTIONS_HREF,
} = require('./systemHealthEvaluate');

function dep(partial) {
  return {
    key: 'postgres',
    label: 'PostgreSQL',
    host: '127.0.0.1',
    port: 5432,
    required: true,
    configured: true,
    reachable: true,
    code: null,
    impact: '数据库不可用，几乎所有接口都会失败',
    ...partial,
  };
}

function healthyFacts(overrides = {}) {
  return {
    dependencies: [
      dep({ key: 'postgres', label: 'PostgreSQL' }),
      dep({
        key: 'minio',
        label: 'MinIO',
        port: 9000,
        impact: '上传 / 预览 / 导出不可用',
      }),
      dep({
        key: 'redis',
        label: 'Redis',
        port: 6379,
        required: false,
        impact: '指标与上传进度降级，功能仍可用',
      }),
    ],
    runtime: { status: 'ok', text: 'node v22.13.0', hint: null },
    env: { status: 'ok', text: '关键键齐全', hint: null },
    structure: { status: 'ok', text: 'eadaf · 20/20 张表', hint: null },
    systemBucket: { status: 'ok', text: 'eadaf-system 已就绪', hint: null },
    connections: {
      state: 'rows',
      rows: [{ name: '主库', isDefault: true, lastTestStatus: 'success' }],
    },
    aiModels: { state: 'count', count: 2 },
    ...overrides,
  };
}

function itemByKey(report, key) {
  const found = report.items.find((row) => row.key === key);
  assert.ok(found, `缺少健康项 ${key}`);
  return found;
}

test('全部正常：整体 ok，错误和警告都是 0', () => {
  const report = evaluateSystemHealth(healthyFacts());
  assert.equal(report.status, 'ok');
  assert.equal(report.errorCount, 0);
  assert.equal(report.warningCount, 0);
  assert.equal(itemByKey(report, 'bizdataConnections').status, 'ok');
  assert.match(itemByKey(report, 'bizdataConnections').summary, /主库/);
});

test('没有业务数据库连接：严重错误，并指向数据库连接页', () => {
  const report = evaluateSystemHealth(healthyFacts({
    connections: { state: 'rows', rows: [] },
  }));
  const row = itemByKey(report, 'bizdataConnections');
  assert.equal(row.status, 'error');
  assert.match(row.summary, /未配置任何数据库连接/);
  assert.equal(row.href, BIZDATA_CONNECTIONS_HREF);
  assert.equal(report.status, 'error');
  assert.equal(report.errorCount, 1);
});

test('有连接但没有默认连接：严重错误', () => {
  const report = evaluateSystemHealth(healthyFacts({
    connections: {
      state: 'rows',
      rows: [
        { name: '备库', isDefault: false, lastTestStatus: 'success' },
        { name: '从库', isDefault: false, lastTestStatus: null },
      ],
    },
  }));
  const row = itemByKey(report, 'bizdataConnections');
  assert.equal(row.status, 'error');
  assert.match(row.summary, /没有默认连接/);
  assert.match(row.summary, /2 条/);
});

test('默认连接上次测试失败：严重错误', () => {
  const report = evaluateSystemHealth(healthyFacts({
    connections: {
      state: 'rows',
      rows: [{ name: '主库', isDefault: true, lastTestStatus: 'failed' }],
    },
  }));
  const row = itemByKey(report, 'bizdataConnections');
  assert.equal(row.status, 'error');
  assert.match(row.summary, /主库/);
  assert.match(row.summary, /上次测试失败/);
});

test('默认连接尚未测试：警告，不算严重错误', () => {
  const report = evaluateSystemHealth(healthyFacts({
    connections: {
      state: 'rows',
      rows: [{ name: '主库', isDefault: true, lastTestStatus: null }],
    },
  }));
  const row = itemByKey(report, 'bizdataConnections');
  assert.equal(row.status, 'warning');
  assert.equal(report.status, 'warning');
  assert.equal(report.errorCount, 0);
  assert.equal(report.warningCount, 1);
});

test('平台库不可达：业务连接等项跳过，不误报成没配连接', () => {
  const report = evaluateSystemHealth(healthyFacts({
    dependencies: [
      dep({ key: 'postgres', label: 'PostgreSQL', reachable: false, code: 'ECONNREFUSED' }),
      dep({ key: 'minio', label: 'MinIO', port: 9000, impact: '上传不可用' }),
      dep({ key: 'redis', label: 'Redis', port: 6379, required: false, impact: '降级' }),
    ],
    ...skippedDbFacts('平台数据库不可达，跳过'),
  }));
  assert.equal(itemByKey(report, 'postgres').status, 'error');
  assert.equal(itemByKey(report, 'bizdataConnections').status, 'skip');
  assert.equal(itemByKey(report, 'dbStructure').status, 'skip');
  assert.equal(itemByKey(report, 'systemBucket').status, 'skip');
  assert.equal(itemByKey(report, 'aiModels').status, 'skip');
  assert.equal(report.errorCount, 1);
  assert.doesNotMatch(itemByKey(report, 'bizdataConnections').summary, /未配置任何数据库连接/);
});

test('MinIO 未配置是严重错误，Redis 不可达只是警告', () => {
  const report = evaluateSystemHealth(healthyFacts({
    dependencies: [
      dep({ key: 'postgres', label: 'PostgreSQL' }),
      dep({
        key: 'minio',
        label: 'MinIO',
        host: null,
        port: null,
        configured: false,
        reachable: false,
        code: 'NOT_CONFIGURED',
        impact: '上传 / 预览 / 导出不可用',
      }),
      dep({
        key: 'redis',
        label: 'Redis',
        port: 6379,
        required: false,
        reachable: false,
        code: 'ECONNREFUSED',
        impact: '指标与上传进度降级，功能仍可用',
      }),
    ],
  }));
  assert.equal(itemByKey(report, 'minio').status, 'error');
  assert.match(itemByKey(report, 'minio').summary, /未配置/);
  assert.equal(itemByKey(report, 'redis').status, 'warning');
  assert.equal(report.status, 'error');
  assert.equal(report.errorCount, 1);
  assert.equal(report.warningCount, 1);
});

test('没有启用中的 AI 模型：警告', () => {
  const report = evaluateSystemHealth(healthyFacts({
    aiModels: { state: 'count', count: 0 },
  }));
  const row = itemByKey(report, 'aiModels');
  assert.equal(row.status, 'warning');
  assert.equal(row.href, '/ai_management/models');
});

test('生产环境关键配置缺失映射为严重错误，并排在正常项前面', () => {
  const report = evaluateSystemHealth(healthyFacts({
    env: { status: 'fail', text: '缺 MINIO_ENDPOINT', hint: ['骨架见 backend/.env.example'] },
  }));
  const row = itemByKey(report, 'env');
  assert.equal(row.status, 'error');
  assert.match(row.hint, /backend\/.env.example/);
  assert.equal(report.items[0].status, 'error');
});
