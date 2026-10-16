const test = require('node:test');
const assert = require('node:assert/strict');

const logger = require('./logger');
const diagnostics = require('./dependencyDiagnostics');

// 这些用例只测纯逻辑：把 logger 打成假实现，避免往控制台/日志文件写东西
function captureLogs() {
  const records = [];
  const original = { error: logger.error, warn: logger.warn, info: logger.info };
  for (const level of Object.keys(original)) {
    logger[level] = (message, meta) => records.push({ level, message, meta });
  }
  return {
    records,
    restore() {
      Object.assign(logger, original);
    },
  };
}

function connectionError(port, code = 'ECONNREFUSED') {
  return Object.assign(new Error(`connect ${code} 127.0.0.1:${port}`), {
    code,
    address: '127.0.0.1',
    port,
  });
}

function dependencyPort(key) {
  const dep = diagnostics.listDependencies().find((item) => item.key === key);
  return dep && dep.port ? dep.port : null;
}

test('把 node 连接错误归类到对应依赖端口', () => {
  for (const dep of diagnostics.listDependencies()) {
    if (!dep.port) continue; // 未配置的依赖（如没写 MINIO_ENDPOINT）无处可归
    assert.equal(diagnostics.classifyDependencyError(connectionError(dep.port)), dep.key, dep.label);
  }
});

test('Sequelize / redis 的包装错误也能归类', () => {
  const sequelizeError = Object.assign(new Error('connect ECONNREFUSED'), {
    name: 'SequelizeConnectionRefusedError',
  });
  assert.equal(diagnostics.classifyDependencyError(sequelizeError), 'postgres');

  const redisError = Object.assign(new Error('socket closed'), { name: 'SocketClosedUnexpectedlyError' });
  assert.equal(diagnostics.classifyDependencyError(redisError), 'redis');

  // wrapStoreError 会把原始错误挂到 cause 上
  const minioPort = dependencyPort('minio');
  if (minioPort) {
    const wrapped = Object.assign(new Error('对象存储不可用'), {
      status: 503,
      cause: connectionError(minioPort),
    });
    assert.equal(diagnostics.classifyDependencyError(wrapped), 'minio');
  }
});

test('业务错误不参与依赖折叠', () => {
  const bizError = Object.assign(new Error('column "foo" does not exist'), {
    name: 'SequelizeDatabaseError',
  });
  assert.equal(diagnostics.classifyDependencyError(bizError), null);
  assert.equal(diagnostics.classifyDependencyError(null), null);
  assert.equal(diagnostics.classifyDependencyError(new Error('非法对象键')), null);
});

test('错误原因提炼成一行可读文本', () => {
  assert.equal(diagnostics.describeError(connectionError(25432)), 'ECONNREFUSED 127.0.0.1:25432');
  assert.equal(
    diagnostics.describeError(new Error('connect ECONNREFUSED 127.0.0.1:9000')),
    'ECONNREFUSED',
  );
});

test('依赖不可用：首次报结论，后续只写文件', () => {
  diagnostics.resetDependencyState();
  const capture = captureLogs();
  try {
    const first = diagnostics.noteDependencyDown('postgres', connectionError(25432));
    assert.equal(first, true, '首次应输出到控制台');
    assert.equal(capture.records.length, 1);
    assert.match(capture.records[0].message, /PostgreSQL localhost:25432 不可用（ECONNREFUSED 127\.0\.0\.1:25432）/);
    assert.ok(capture.records[0].meta.hint, '首次应带修复建议');
    assert.ok(!capture.records[0].meta.suppressConsole);

    const second = diagnostics.noteDependencyDown('postgres', connectionError(25432));
    assert.equal(second, false, '第二次不应再刷控制台');
    assert.equal(capture.records.length, 2, '仍需写文件');
    assert.equal(capture.records[1].meta.suppressConsole, true);
    assert.equal(capture.records[1].meta.occurrences, 2);
    assert.ok(capture.records[1].meta.stack, '同类原因第一次仍保留堆栈');

    diagnostics.noteDependencyDown('postgres', connectionError(25432));
    assert.equal(capture.records[2].meta.stack, undefined, '同原因重复时不再重复堆栈');
  } finally {
    capture.restore();
    diagnostics.resetDependencyState();
  }
});

test('启动自检已报过的依赖，调用点不再重复输出', () => {
  diagnostics.resetDependencyState();
  const capture = captureLogs();
  const write = process.stdout.write;
  process.stdout.write = () => true; // 自检报告直接写 stdout，测试里吞掉
  try {
    diagnostics.printStartupReport([
      { key: 'postgres', label: 'PostgreSQL', host: 'localhost', port: 25432, required: true, configured: true, reachable: false, code: 'ECONNREFUSED' },
    ]);
    const printed = capture.records.length;
    assert.equal(diagnostics.noteDependencyDown('postgres', connectionError(25432)), false);
    assert.equal(capture.records.length, printed + 1);
    assert.equal(capture.records.at(-1).meta.suppressConsole, true);
  } finally {
    process.stdout.write = write;
    capture.restore();
    diagnostics.resetDependencyState();
  }
});

test('依赖恢复后解除折叠，再次故障会重新提示', () => {
  diagnostics.resetDependencyState();
  const capture = captureLogs();
  try {
    diagnostics.noteDependencyDown('redis', Object.assign(new Error('socket closed'), { name: 'SocketClosedUnexpectedlyError' }));
    assert.ok(diagnostics.isDependencyMarkedDown('redis'));
    assert.equal(diagnostics.noteDependencyUp('redis'), true, '恢复应解除折叠');
    assert.equal(diagnostics.isDependencyMarkedDown('redis'), false);
    assert.equal(diagnostics.noteDependencyDown('redis', Object.assign(new Error('socket closed'), { name: 'SocketClosedUnexpectedlyError' })), true);
  } finally {
    capture.restore();
    diagnostics.resetDependencyState();
  }
});

test('reportDependencyError 对非依赖错误保持完整堆栈', () => {
  diagnostics.resetDependencyState();
  const capture = captureLogs();
  try {
    diagnostics.reportDependencyError('tus 清理任务失败', new Error('磁盘写入失败'));
    const record = capture.records.at(-1);
    assert.equal(record.message, 'tus 清理任务失败');
    assert.equal(record.meta.message, '磁盘写入失败');
    assert.ok(record.meta.stack);
    assert.ok(!record.meta.suppressConsole);
  } finally {
    capture.restore();
    diagnostics.resetDependencyState();
  }
});

test('修复建议按本地 / 远端 / 未配置区分', () => {
  for (const key of ['postgres', 'minio', 'redis']) {
    assert.match(diagnostics.repairHint(key), /docker compose up -d|\.env/);
  }
  assert.match(diagnostics.repairHint('postgres'), /docker compose up -d/);
});
