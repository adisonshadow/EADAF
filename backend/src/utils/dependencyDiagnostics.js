/**
 * 启动依赖自检 + 连接类报错降噪。
 *
 * 背景：本机 Docker 没启动时，PostgreSQL / MinIO / Redis 会同时 ECONNREFUSED。
 * 旧行为是每个调用点各抛一段全栈，Redis 客户端还会无限重连、每 500ms 刷一条
 * "Redis client error"，满屏噪音反而盖住了唯一有用的信息：「Docker 没起」。
 *
 * 这里统一成两件事：
 *   1. 启动前并行探一次 TCP 端口，打一张结论表 + 修复命令（一眼定位）；
 *   2. 某个依赖被判为不可用后，后续同类报错只写日志文件（完整堆栈仍在
 *      logs/error-*.log），控制台不再重复刷屏；依赖恢复后自动解除折叠。
 *
 * 另外两类「看着像依赖挂了、其实是别的问题」的报错在这里单独归类，不再兜到
 * 「PostgreSQL 不可用」上：
 *   · 表 / schema 不存在（42P01 / 3F000）—— 库是通的，是结构没建或名字不对；
 *   · 启动时的非连接项（运行环境、env、库结构、系统桶）由 startupSelfCheck 探测，
 *     通过 printStartupReport(results, { extra }) 并进同一张表输出。
 */
const net = require('net');
const config = require('../config');
const logger = require('./logger');

/** 连接类错误码：这些才判为「依赖不可用」，业务错误不折叠。 */
const CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN',
  'EPIPE',
]);

/** Sequelize 连接层错误名自带方言信息，直接归到 PostgreSQL。 */
const SEQUELIZE_CONNECTION_NAME = /^Sequelize(Connection|Host|Access|Timeout)/;

/** redis v4 在重连/关闭时抛出的错误名。 */
const REDIS_ERROR_NAMES = new Set([
  'MaxRetriesPerRequestError',
  'ReconnectStrategyError',
  'ClientClosedError',
  'SocketClosedUnexpectedlyError',
]);

const CONNECTION_CODE_RE = new RegExp(`\\b(${[...CONNECTION_CODES].join('|')})\\b`);

/** 结构类错误码：undefined_table / invalid_schema_name —— 库通，缺的是对象。 */
const MISSING_OBJECT_CODES = new Set(['42P01', '3F000']);

/** 从 Postgres 的报错文本里抠出对象名（relation "eadaf.users" does not exist）。 */
const MISSING_OBJECT_RE = /(?:relation|table|schema) "([^"]+)" does not exist/i;

/** 结构缺失时的修复建议：只有两条正路 —— 建库或迁移。 */
const DB_STRUCTURE_HINT =
  '表 / schema 没建或名字不对：pnpm --filter ./backend init-db（重建 POSTGRES_SCHEMA，会清空数据）'
  + '；改名过的库先跑 pnpm --filter ./backend migrate-uac-to-eadaf';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '::']);

/* ------------------------------------------------------------------ *
 * 服务清单
 * ------------------------------------------------------------------ */

function isLocalHost(host) {
  return LOCAL_HOSTS.has(String(host || '').toLowerCase());
}

function minioTarget() {
  const endpoint = String(config.storage.minio.endpoint || '').trim();
  if (!endpoint) return { host: null, port: null, configured: false };
  try {
    const url = new URL(endpoint);
    const useSSL = url.protocol === 'https:';
    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : (useSSL ? 443 : 80),
      configured: true,
    };
  } catch {
    return { host: null, port: null, configured: false, invalid: endpoint };
  }
}

function listDependencies() {
  const minio = minioTarget();
  return [
    {
      key: 'postgres',
      label: 'PostgreSQL',
      host: config.postgresql.host,
      port: config.postgresql.port,
      required: true,
      configured: true,
      impact: '数据库不可用，几乎所有接口都会失败',
    },
    {
      key: 'minio',
      label: 'MinIO',
      host: minio.host,
      port: minio.port,
      required: true,
      configured: minio.configured,
      impact: '上传 / 预览 / 导出不可用',
    },
    {
      key: 'redis',
      label: 'Redis',
      host: config.redis.host,
      port: config.redis.port,
      required: false,
      configured: true,
      impact: '指标与上传进度降级，功能仍可用',
    },
  ];
}

function dependencyByKey(key) {
  const normalized = String(key || '').toLowerCase();
  return listDependencies().find((dep) => dep.key === normalized) || null;
}

function addressOf(dep) {
  if (!dep || !dep.host || !dep.port) return '未配置';
  return `${dep.host}:${dep.port}`;
}

/** 修复建议：本机依赖指向 docker compose，远端依赖提示改 .env。 */
function repairHint(key) {
  const dep = dependencyByKey(key);
  if (!dep) return '检查 backend/.env.development 中的连接配置';
  if (key === 'minio' && !dep.configured) {
    return 'MINIO_ENDPOINT 未配置：cp backend/.env.example backend/.env.development';
  }
  if (isLocalHost(dep.host)) return 'cd backend && docker compose up -d';
  return `确认 ${dep.label} 在 ${addressOf(dep)} 可用，或改 backend/.env.development`;
}

/* ------------------------------------------------------------------ *
 * 探活
 * ------------------------------------------------------------------ */

/** 只探 TCP 端口，不发协议包：毫秒级、无副作用，用来回答「容器起来了吗」。 */
function probePort(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    if (!host || !port) {
      resolve({ reachable: false, code: 'NOT_CONFIGURED' });
      return;
    }
    const socket = net.connect({ host, port });
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ reachable: true, code: null }));
    socket.once('timeout', () => finish({ reachable: false, code: 'ETIMEDOUT' }));
    socket.once('error', (error) => finish({ reachable: false, code: error.code || error.name || 'ERROR' }));
  });
}

async function probeDependencies({ timeoutMs = 800 } = {}) {
  const deps = listDependencies();
  const results = await Promise.all(
    deps.map(async (dep) => ({ ...dep, ...(await probePort(dep.host, dep.port, timeoutMs)) })),
  );
  return results;
}

/* ------------------------------------------------------------------ *
 * 输出
 * ------------------------------------------------------------------ */

function paint(code, text) {
  const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
  return useColor ? `\u001b[${code}m${text}\u001b[0m` : text;
}

function markOf(result) {
  if (result.reachable) return paint('32', '✓');
  return result.code === 'NOT_CONFIGURED' ? paint('33', '!') : paint('31', '✗');
}

function statusText(result) {
  if (result.reachable) return '可用';
  if (result.code === 'NOT_CONFIGURED') return '未配置';
  return result.code || '不可达';
}

function roleText(result) {
  if (result.required) return '必需';
  return '可选（降级）';
}

function line(parts) {
  process.stdout.write(`${parts.join('')}\n`);
}

/** 全角字符按两列算：否则 padEnd 出来的表格在终端里是歪的。 */
function displayWidth(text) {
  let width = 0;
  for (const char of String(text)) {
    const code = char.codePointAt(0);
    const wide = (code >= 0x1100 && code <= 0x115f)
      || (code >= 0x2e80 && code <= 0xa4cf)
      || (code >= 0xac00 && code <= 0xd7a3)
      || (code >= 0xf900 && code <= 0xfaff)
      || (code >= 0xfe30 && code <= 0xfe6f)
      || (code >= 0xff00 && code <= 0xff60)
      || (code >= 0xffe0 && code <= 0xffe6);
    width += wide ? 2 : 1;
  }
  return width;
}

function padDisplay(text, width) {
  const padding = width - displayWidth(text);
  return padding > 0 ? `${text}${' '.repeat(padding)}` : String(text);
}

/** 自检项（运行环境 / env / 库结构 / 系统桶）的状态标记。 */
const EXTRA_MARKS = {
  ok: ['32', '✓'],
  warn: ['33', '!'],
  fail: ['31', '✗'],
  skip: ['90', '·'],
};

function extraMark(status) {
  const [color, mark] = EXTRA_MARKS[status] || EXTRA_MARKS.skip;
  return paint(color, mark);
}

/**
 * 把连接项与额外自检项拼成一张表：额外项里 group 为 'pre' 的排前面，
 * 其余排在连接项之后，读起来是「环境 → 连接 → 结构」的顺序。
 */
function buildStartupRows(results, extra) {
  const dependencyRows = results.map((item) => ({
    mark: markOf(item),
    label: item.label,
    text: item.reachable
      ? `${addressOf(item)} · 可用 · ${roleText(item)}`
      : `${addressOf(item)} · ${statusText(item)}｜影响：${item.impact}`,
    hints: item.reachable ? [] : [repairHint(item.key)],
  }));

  const extraRows = extra.map((item) => ({
    group: item.group || 'post',
    mark: extraMark(item.status),
    label: item.label,
    text: item.text,
    hints: item.hint ? [].concat(item.hint) : [],
  }));

  return [
    ...extraRows.filter((row) => row.group === 'pre'),
    ...dependencyRows,
    ...extraRows.filter((row) => row.group !== 'pre'),
  ];
}

/**
 * 打印启动自检结论（连接项 + 额外自检项）。
 *
 * - 开发环境：始终打完整清单，能看见每一项查了什么；
 * - 生产环境：全通且无告警时只留一行，避免刷启动日志；有错才打表 + 修复命令。
 *
 * 返回 { ok, down, requiredDown, optionalDown, extra } 便于调用方/测试判断。
 */
function printStartupReport(results, { extra = [], verbose = process.env.NODE_ENV !== 'production' } = {}) {
  const down = results.filter((item) => !item.reachable);
  const requiredDown = down.filter((item) => item.required);
  const optionalDown = down.filter((item) => !item.required);
  const failed = extra.filter((item) => item.status === 'fail');
  const warned = extra.filter((item) => item.status === 'warn');
  const summary = { ok: down.length === 0 && failed.length === 0, down, requiredDown, optionalDown, extra };

  // 自检已经说过的依赖，后续调用点不再重复刷控制台（细节仍写文件）
  setDependencyDownFromStartup(results);

  if (summary.ok && !warned.length && !verbose) {
    const detail = results.map((item) => `${item.label} ${addressOf(item)}`).join('、');
    process.stdout.write(`${paint('32', '✅ 启动自检通过')}：${detail}\n`);
    logger.info('启动自检通过', {
      suppressConsole: true,
      dependencies: detail.split('、'),
      checks: extra.map((item) => ({ label: item.label, status: item.status })),
    });
    return summary;
  }

  const rows = buildStartupRows(results, extra);
  const labelWidth = Math.max(...rows.map((row) => displayWidth(row.label)), 10);
  const total = rows.length;
  const passed = results.filter((item) => item.reachable).length
    + extra.filter((item) => item.status === 'ok').length;
  const needFix = total - passed;
  const textIndent = ' '.repeat(labelWidth + 6);

  line([paint('90', '──────────────'), paint('36', ' 启动自检 '), paint('90', '──────────────')]);
  for (const row of rows) {
    line([`  ${row.mark} `, padDisplay(row.label, labelWidth), '  ', row.text]);
    row.hints.forEach((hint, index) => {
      // 第一条带 🔧，后续对齐到提示文本下方，避免一排小扳手
      line([textIndent, index === 0 ? paint('36', '🔧 ') : '   ', hint]);
    });
  }
  line([paint(needFix ? '33' : '32', `  ── ${passed}/${total} 通过${needFix ? ` · ${needFix} 项需处理` : ''} ──`)]);

  if (down.length) {
    line([paint('90', '  🔇 依赖不可用期间的同类报错只写入 logs/error-*.log，控制台不再重复刷屏')]);
  }
  line([paint('90', '────────────────────────────────────────────────────────────')]);

  const meta = {
    suppressConsole: true,
    dependencies: results.map((item) => ({
      key: item.key,
      label: item.label,
      address: addressOf(item),
      reachable: item.reachable,
      code: item.code,
      required: item.required,
    })),
    checks: extra.map((item) => ({ label: item.label, status: item.status, text: item.text })),
    console: 'human readable report already printed to stdout',
  };

  if (summary.ok && !warned.length) {
    logger.info('启动自检通过', meta);
  } else {
    logger.warn('启动自检需要关注', {
      ...meta,
      hint: requiredDown.length
        ? repairHint(requiredDown[0].key)
        : (failed[0] ? failed[0].hint : null),
    });
  }

  return summary;
}

/* ------------------------------------------------------------------ *
 * 报错归类 + 折叠
 * ------------------------------------------------------------------ */

/** 沿 parent / cause / original / errors 收集错误链（Sequelize 与 MinIO 都会包一层）。 */
function collectErrorChain(error, depth = 0, acc = []) {
  if (!error || typeof error !== 'object' || depth > 4 || acc.includes(error)) return acc;
  acc.push(error);
  collectErrorChain(error.parent, depth + 1, acc);
  collectErrorChain(error.cause, depth + 1, acc);
  collectErrorChain(error.original, depth + 1, acc);
  if (Array.isArray(error.errors)) {
    for (const nested of error.errors) collectErrorChain(nested, depth + 1, acc);
  }
  return acc;
}

/**
 * 把错误归类到具体依赖（postgres / minio / redis），无法归类返回 null。
 * 业务错误（SQL 语法、对象不存在等）不会命中，仍按普通错误完整打堆栈。
 */
function classifyDependencyError(error) {
  const chain = collectErrorChain(error);
  if (!chain.length) return null;

  for (const item of chain) {
    const name = String(item.name || '');
    if (SEQUELIZE_CONNECTION_NAME.test(name)) return 'postgres';
    if (REDIS_ERROR_NAMES.has(name)) return 'redis';
  }

  // node 的 net 错误自带 port，比解析 message 可靠
  for (const item of chain) {
    const port = Number(item.port);
    const code = String(item.code || '');
    if (port && CONNECTION_CODES.has(code)) {
      const hit = listDependencies().find((dep) => dep.port === port);
      if (hit) return hit.key;
    }
  }

  for (const item of chain) {
    const text = `${item.code || ''} ${item.message || ''}`;
    for (const dep of listDependencies()) {
      if (!dep.host || !dep.port) continue;
      if (text.includes(`${dep.host}:${dep.port}`) || text.includes(`:${dep.port}`)) return dep.key;
    }
    if (/redis/i.test(text) && CONNECTION_CODE_RE.test(text)) return 'redis';
  }

  return null;
}

/**
 * 判断是不是「表 / schema 不存在」的结构类错误。
 * 这类错误的连接是通的，报成「依赖不可用」会把排查方向带偏。
 * 返回 { code, object, message }，不是结构错误返回 null。
 */
function isMissingDbObjectError(error) {
  const chain = collectErrorChain(error);
  if (!chain.length) return null;

  for (const item of chain) {
    const code = String(item.code || '');
    if (!MISSING_OBJECT_CODES.has(code)) continue;
    const match = MISSING_OBJECT_RE.exec(String(item.message || ''));
    return { code, object: match ? match[1] : null, message: String(item.message || '') };
  }

  // 有些包装层（Sequelize / 业务层）会把 code 吃掉，只能看报错文本
  for (const item of chain) {
    const message = String(item.message || '');
    const match = MISSING_OBJECT_RE.exec(message);
    if (match) return { code: null, object: match[1], message };
  }

  return null;
}

/** 从错误链里提炼人类可读的一句话原因，例如 ECONNREFUSED 127.0.0.1:25432。 */
function describeError(error) {
  const chain = collectErrorChain(error);
  for (const item of chain) {
    const code = String(item.code || '');
    if (CONNECTION_CODES.has(code)) {
      const where = item.port ? `${item.address || ''}:${item.port}`.replace(/^:/, '') : '';
      return where ? `${code} ${where}` : code;
    }
  }
  for (const item of chain) {
    const match = CONNECTION_CODE_RE.exec(String(item.message || ''));
    if (match) return match[0];
    if (String(item.name || '').startsWith('Sequelize')) return String(item.name);
  }
  const first = chain[0];
  const message = String(first.message || first.name || '未知错误');
  return message.length > 90 ? `${message.slice(0, 87)}...` : message;
}

/** key -> { count, reported, startup }；reported 表示「已在控制台说过一次」。 */
const failureState = new Map();

/** 缺失对象 -> { count, reported }：结构缺失按「缺的是哪张表」各自折叠。 */
const structureState = new Map();

function failureEntry(key) {
  return failureState.get(key) || { count: 0, reported: false, startup: false };
}

function isDependencyMarkedDown(key) {
  return failureEntry(String(key || '').toLowerCase()).reported;
}

function setDependencyDownFromStartup(results) {
  for (const item of results) {
    if (item.reachable) continue;
    failureState.set(item.key, { count: 0, reported: true, startup: true });
  }
}

function resetDependencyState() {
  failureState.clear();
  structureState.clear();
}

/**
 * 依赖不可用时的统一入口。首次（且启动自检没报过）打一条干净的结论，
 * 之后同类报错只写文件；返回 false 表示这次没有输出到控制台。
 */
function noteDependencyDown(key, error, { context = '' } = {}) {
  const dep = dependencyByKey(key);
  if (!dep) return false;

  const entry = failureEntry(dep.key);
  entry.count += 1;
  const first = !entry.reported;
  entry.reported = true;
  failureState.set(dep.key, entry);

  const reason = describeError(error);
  const headline = `${context ? `${context}：` : ''}${dep.label} ${addressOf(dep)} 不可用（${reason}）`;

  if (first) {
    logger.error(headline, {
      dependency: dep.key,
      required: dep.required,
      hint: entry.startup ? null : repairHint(dep.key),
    });
  } else {
    // 依赖已在控制台说明过：细节只进文件，且同一种原因最多留一份堆栈，
    // 避免健康检查之类的轮询把 error-*.log 写爆。
    const withStack = entry.stackReason !== reason;
    entry.stackReason = reason;
    logger.error(headline, {
      dependency: dep.key,
      occurrences: entry.count,
      suppressed: true,
      ...(withStack ? { stack: error && error.stack } : {}),
      suppressConsole: true,
    });
  }
  return first;
}

/** 依赖恢复：解除折叠，并在之前报过不可用时提示一次。 */
function noteDependencyUp(key) {
  const dep = dependencyByKey(key);
  if (!dep) return false;
  const entry = failureState.get(dep.key);
  failureState.delete(dep.key);
  if (!entry || !entry.reported || entry.startup) return false;
  logger.info(`依赖已恢复：${dep.label} ${addressOf(dep)}`, { dependency: dep.key });
  return true;
}

/**
 * 「表 / schema 不存在」的统一入口：说清缺的是哪个对象、怎么补，并按对象折叠。
 * 首次输出到控制台（带完整堆栈），之后同类只写文件。
 */
function noteMissingDbObject(context, missing, error) {
  const key = missing.object || 'unknown';
  const entry = structureState.get(key) || { count: 0, reported: false };
  entry.count += 1;
  const first = !entry.reported;
  entry.reported = true;
  structureState.set(key, entry);

  const headline = `${context ? `${context}：` : ''}数据库结构缺失（${key} 不存在）`;
  if (first) {
    logger.error(headline, {
      databaseStructure: key,
      hint: DB_STRUCTURE_HINT,
      stack: error && error.stack,
    });
  } else {
    logger.error(headline, {
      databaseStructure: key,
      occurrences: entry.count,
      suppressed: true,
      suppressConsole: true,
    });
  }
  return first;
}

/**
 * 启动/后台任务里统一的失败上报：结构缺失 / 依赖不可用各自走各自的折叠逻辑，
 * 归类不到（真正的代码错误）保持完整堆栈，方便排查。
 */
function reportDependencyError(context, error, { fallbackKey = null } = {}) {
  const missing = isMissingDbObjectError(error);
  if (missing) return noteMissingDbObject(context, missing, error);

  const key = classifyDependencyError(error) || fallbackKey;
  if (key) return noteDependencyDown(key, error, { context });
  logger.error(context, {
    message: error && error.message,
    stack: error && error.stack,
  });
  return false;
}

module.exports = {
  listDependencies,
  probeDependencies,
  probePort,
  printStartupReport,
  setDependencyDownFromStartup,
  classifyDependencyError,
  isMissingDbObjectError,
  noteMissingDbObject,
  describeError,
  noteDependencyDown,
  noteDependencyUp,
  isDependencyMarkedDown,
  resetDependencyState,
  reportDependencyError,
  repairHint,
  DB_STRUCTURE_HINT,
};
