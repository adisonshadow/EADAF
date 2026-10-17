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

/** 把某个依赖造成「可达 / 不可达」的探测结果。 */
function depResult(key, reachable) {
  const dep = diagnostics.listDependencies().find((item) => item.key === key);
  return { ...dep, reachable, code: reachable ? null : 'ECONNREFUSED' };
}

function relationError(relation = 'eadaf.storage_upload_sessions') {
  return Object.assign(new Error(`relation "${relation}" does not exist`), {
    name: 'SequelizeDatabaseError',
    code: '42P01',
  });
}

test('表缺失单独归类：不报成依赖不可用', () => {
  diagnostics.resetDependencyState();
  const capture = captureLogs();
  try {
    const error = relationError();
    assert.deepEqual(diagnostics.isMissingDbObjectError(error), {
      code: '42P01',
      object: 'eadaf.storage_upload_sessions',
      message: 'relation "eadaf.storage_upload_sessions" does not exist',
    });
    assert.equal(diagnostics.classifyDependencyError(error), null, '结构错误不是依赖不可用');

    assert.equal(
      diagnostics.reportDependencyError('初始化系统 Storage Bucket 失败', error, { fallbackKey: 'postgres' }),
      true,
      '首次应输出到控制台',
    );
    const record = capture.records.at(-1);
    assert.match(record.message, /数据库结构缺失（eadaf\.storage_upload_sessions 不存在）/);
    assert.equal(record.meta.hint, diagnostics.DB_STRUCTURE_HINT);
    assert.ok(record.meta.stack, '首次应带堆栈');
    assert.ok(!diagnostics.isDependencyMarkedDown('postgres'), '不应把 postgres 标成不可用');

    // 同一个对象重复报：只写文件
    assert.equal(diagnostics.reportDependencyError('初始化系统 Storage Bucket 失败', error), false);
    assert.equal(capture.records.at(-1).meta.suppressConsole, true);
    assert.equal(capture.records.at(-1).meta.occurrences, 2);
  } finally {
    capture.restore();
    diagnostics.resetDependencyState();
  }
});

test('没有 code 的包装错误也能从文本认出结构缺失', () => {
  const wrapped = Object.assign(new Error('查询失败'), {
    name: 'SequelizeDatabaseError',
    parent: new Error('schema "uac" does not exist'),
  });
  assert.deepEqual(diagnostics.isMissingDbObjectError(wrapped), {
    code: null,
    object: 'uac',
    message: 'schema "uac" does not exist',
  });
  assert.equal(diagnostics.isMissingDbObjectError(new Error('磁盘写入失败')), null);
  assert.equal(diagnostics.isMissingDbObjectError(null), null);
});

test('启动自检：开发环境打完整清单，额外项并入同一份输出', () => {
  diagnostics.resetDependencyState();
  const capture = captureLogs();
  const write = process.stdout.write;
  let out = '';
  process.stdout.write = (chunk) => {
    out += chunk;
    return true;
  };
  try {
    const summary = diagnostics.printStartupReport(
      [depResult('postgres', true), depResult('minio', true), depResult('redis', true)],
      {
        extra: [
          { label: '运行环境', status: 'ok', group: 'pre', text: 'node v24.20.0' },
          { label: '库结构', status: 'fail', group: 'post', text: '缺 3/57 张表', hint: '跑 init-db' },
        ],
      },
    );
    assert.equal(summary.ok, false);
    assert.match(out, /启动自检/);
    assert.match(out, /运行环境/);
    assert.match(out, /库结构/);
    assert.match(out, /跑 init-db/);
    assert.match(out, /4\/5 通过 · 1 项需处理/);
    // 顺序：额外 pre 项 → 连接项 → 额外 post 项
    assert.ok(out.indexOf('运行环境') < out.indexOf('PostgreSQL'));
    assert.ok(out.indexOf('PostgreSQL') < out.indexOf('库结构'));
  } finally {
    process.stdout.write = write;
    capture.restore();
    diagnostics.resetDependencyState();
  }
});

test('生产环境全通且无告警时仍然只打一行', () => {
  diagnostics.resetDependencyState();
  const capture = captureLogs();
  const write = process.stdout.write;
  let out = '';
  process.stdout.write = (chunk) => {
    out += chunk;
    return true;
  };
  try {
    const summary = diagnostics.printStartupReport(
      [depResult('postgres', true), depResult('minio', true), depResult('redis', true)],
      {
        verbose: false,
        extra: [{ label: '库结构', status: 'ok', text: 'eadaf · 57/57 张表' }],
      },
    );
    assert.equal(summary.ok, true);
    assert.match(out, /✅ 启动自检通过/);
    assert.doesNotMatch(out, /── \d+\/\d+ 通过/);
  } finally {
    process.stdout.write = write;
    capture.restore();
    diagnostics.resetDependencyState();
  }
});
