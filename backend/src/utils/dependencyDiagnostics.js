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

/**
 * 打印启动依赖自检结论。全通时只打一行；有不可用时打一张表 + 修复命令。
 * 返回 { ok, down, requiredDown, optionalDown } 便于调用方/测试判断。
 */
function printStartupReport(results) {
  const down = results.filter((item) => !item.reachable);
  const requiredDown = down.filter((item) => item.required);
  const optionalDown = down.filter((item) => !item.required);
  const summary = { ok: down.length === 0, down, requiredDown, optionalDown };

  // 自检已经说过的依赖，后续调用点不再重复刷控制台（细节仍写文件）
  setDependencyDownFromStartup(results);

  if (!down.length) {
    process.stdout.write(
      `${paint('32', '✅ 依赖自检通过')}：${results.map((item) => `${item.label} ${addressOf(item)}`).join('、')}\n`,
    );
    logger.info('启动依赖自检通过', {
      suppressConsole: true,
      dependencies: results.map((item) => `${item.label} ${addressOf(item)}`),
    });
    return summary;
  }

  const width = Math.max(...results.map((item) => item.label.length));
  line([paint('90', '──────────────'), paint('36', ' 启动依赖自检 '), paint('90', '──────────────')]);
  for (const item of results) {
    line([
      `  ${markOf(item)} `,
      item.label.padEnd(width, ' '),
      '  ',
      addressOf(item).padEnd(16, ' '),
      '  ',
      statusText(item).padEnd(13, ' '),
      '  ',
      item.required ? paint('31', roleText(item)) : paint('90', roleText(item)),
    ]);
  }

  const requiredNames = requiredDown.map((item) => item.label).join('、');
  const optionalNames = optionalDown.map((item) => item.label).join('、');
  if (requiredDown.length) {
    line([
      paint('31', `  ⚠️  ${requiredDown.length} 项必需依赖不可用（${requiredNames}）`),
      `：服务仍会启动，但${requiredDown.map((item) => item.impact).join('；')}。`,
    ]);
  }
  if (optionalNames) {
    line([paint('33', `  ℹ️  ${optionalNames} 不可用`), `：${optionalDown[0].impact}。`]);
  }

  const localDown = down.filter((item) => isLocalHost(item.host) || item.code === 'NOT_CONFIGURED');
  if (localDown.length) {
    const unconfigured = down.some((item) => item.code === 'NOT_CONFIGURED');
    line([paint('36', '  🔧 修复：'), unconfigured
      ? 'cp backend/.env.example backend/.env.development（补齐连接配置）'
      : 'cd backend && docker compose up -d   （本机 Docker 似乎没启动）']);
    if (!unconfigured) {
      line([paint('90', '           起来后按 rs 让 nodemon 重启，或在仓库根目录跑 pnpm dev')]);
    }
  }
  for (const item of down) {
    const hint = repairHint(item.key);
    if (item.configured && !isLocalHost(item.host)) {
      line([paint('36', `  🔧 ${item.label}：`), hint]);
    }
  }
  line([paint('90', '  🔇 依赖不可用期间的同类报错只写入 logs/error-*.log，控制台不再重复刷屏')]);
  line([paint('90', '────────────────────────────────────────────────────────────')]);

  logger.warn('启动依赖自检未通过', {
    suppressConsole: true,
    dependencies: results.map((item) => ({
      key: item.key,
      label: item.label,
      address: addressOf(item),
      reachable: item.reachable,
      code: item.code,
      required: item.required,
    })),
    hint: requiredDown.length ? repairHint(requiredDown[0].key) : null,
    console: 'human readable report already printed to stdout',
  });

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
 * 启动/后台任务里统一的失败上报：能归类到依赖就走折叠逻辑，
 * 归类不到（真正的代码错误）保持完整堆栈，方便排查。
 */
function reportDependencyError(context, error, { fallbackKey = null } = {}) {
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
  describeError,
  noteDependencyDown,
  noteDependencyUp,
  isDependencyMarkedDown,
  resetDependencyState,
  reportDependencyError,
  repairHint,
};
