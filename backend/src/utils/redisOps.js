/**
 * Redis 通用包装：SSO 相关模块（会话、授权码）都用它。
 *
 * 统一约定：**Redis 不可用时 fail-open** —— 记一条限流日志后返回 null，
 * 由调用方决定降级行为（会话撤销查不到就放行；授权码存不下就明确报错）。
 */
const logger = require('./logger');
const { getRedisClient } = require('./redisClient');

/** 降级日志冷却（避免 Redis 长期不可用时刷日志） */
const DEGRADE_LOG_COOLDOWN_MS = 60000;
let lastDegradeLogAt = 0;

function noteDegrade(operation, error) {
  const now = Date.now();
  if (now - lastDegradeLogAt < DEGRADE_LOG_COOLDOWN_MS) return;
  lastDegradeLogAt = now;
  logger.warn('SSO 存储降级：Redis 不可用', {
    operation,
    error: error?.message || 'redis unavailable',
  });
}

/**
 * @template T
 * @param {string} operation 日志用（哪个操作降级了）
 * @param {(client: import('redis').RedisClientType) => Promise<T>} fn
 * @returns {Promise<T|null>} Redis 不可用或报错时返回 null
 */
async function withRedis(operation, fn) {
  try {
    const client = await getRedisClient();
    if (!client) {
      noteDegrade(operation, null);
      return null;
    }
    return await fn(client);
  } catch (error) {
    noteDegrade(operation, error);
    return null;
  }
}

/** 会话/授权码存储是否可用（Redis 连通） */
async function isRedisAvailable() {
  const client = await getRedisClient();
  return !!client;
}

module.exports = { withRedis, isRedisAvailable, noteDegrade };
