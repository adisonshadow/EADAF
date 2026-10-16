const { createClient } = require('redis');
const config = require('../config');
const logger = require('./logger');
const {
  noteDependencyDown,
  noteDependencyUp,
  isDependencyMarkedDown,
} = require('./dependencyDiagnostics');

/** 单次连接最多重试 1 次，避免 redis v4 默认的无限重连刷屏。 */
const MAX_RECONNECT_ATTEMPTS = 1;
/** 重试间隔：本机端口拒绝是毫秒级，这里只是给瞬时抖动一次机会。 */
const RECONNECT_DELAY_MS = 250;
/** 放弃后隔多久允许再试一次（本机 Docker 后启动时不必重启后端）。 */
const RETRY_COOLDOWN_MS = 30000;

let client = null;
let connectPromise = null;
let disabledUntil = 0;

function buildRedisUrl() {
  const { host, port, password } = config.redis;
  const auth = password
    ? `${encodeURIComponent('default')}:${encodeURIComponent(password)}@`
    : '';
  return `redis://${auth}${host}:${port}`;
}

function redisTarget() {
  const { host, port } = config.redis;
  return `${host}:${port}`;
}

function isDisabled() {
  return Date.now() < disabledUntil;
}

async function connectRedis() {
  if (isDisabled()) return null;
  if (client?.isOpen) return client;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    try {
      client = createClient({
        url: buildRedisUrl(),
        socket: {
          // 返回 false 会让 connect() 以错误结束，我们才能进 catch 并降级
          reconnectStrategy: (retries) => {
            if (retries >= MAX_RECONNECT_ATTEMPTS) return false;
            return RECONNECT_DELAY_MS;
          },
        },
      });
      client.on('error', (err) => {
        // 每次重连失败都会触发：首次一条结论，之后只写文件（见 dependencyDiagnostics）
        noteDependencyDown('redis', err);
      });
      await client.connect();
      disabledUntil = 0;
      noteDependencyUp('redis');
      logger.info(`Redis connected for metrics module (${redisTarget()})`);
      return client;
    } catch (err) {
      disabledUntil = Date.now() + RETRY_COOLDOWN_MS;
      if (!isDependencyMarkedDown('redis')) {
        logger.warn('Redis unavailable, metrics will degrade to PostgreSQL only', {
          message: err.message,
          target: redisTarget(),
          retryInMs: RETRY_COOLDOWN_MS,
        });
      }
      // 彻底停掉客户端的重连定时器，否则它会一直重试
      try {
        client?.destroy?.();
      } catch {
        /* 已经关闭 */
      }
      client = null;
      return null;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

async function getRedisClient() {
  if (client?.isOpen) return client;
  return connectRedis();
}

async function pingRedis() {
  const c = await getRedisClient();
  if (!c) return false;
  try {
    const pong = await c.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

module.exports = {
  connectRedis,
  getRedisClient,
  pingRedis,
};
