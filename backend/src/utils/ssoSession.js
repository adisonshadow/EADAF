/**
 * SSO 会话（sid）存储：会话的创建 / 撤销 / 列举。
 *
 * 为什么放 Redis：撤销要「立刻生效」，而 `eadaf.refresh_tokens` 只有 token 维度，
 * 加 `sid`/设备信息这些列需要 DDL（升级包不跑表结构迁移）。Redis 在项目里已有
 * 带降级的封装（`utils/redisClient`）。
 *
 * 键设计：
 *   sso:sess:<sid>            hash  会话详情（user_id / application_id / ip / ua / 时间）
 *   sso:user:<uid>:sids       set   该用户的会话集合（列举、全量撤销）
 *   sso:rt:<refresh token>    str   刷新令牌 → 会话（刷新/登出时不必依赖 access token）
 *   sso:revoked:<sid>         str   撤销标记（中间件**只查这个键**，天然 fail-open）
 *
 * 一个浏览器 = 一个 sid：管理台登录与各业务的 SSO 登录都由管理台前端发起，
 * 它把 localStorage 里的 `eadaf_sid` 带进登录请求，因此该设备上所有应用共用同一会话，
 * 登出时一次撤销即可级联。
 *
 * 降级（Redis 不可用）：所有写操作静默失败并记日志，撤销查不到就不拦截 ——
 * 「登出立即失效」的强度依赖 Redis；Redis 挂时退化为「等 access 过期」。
 */
const crypto = require('crypto');
const config = require('../config');
const logger = require('./logger');
const { withRedis, isRedisAvailable } = require('./redisOps');

const SESSION_PREFIX = 'sso:sess:';
const USER_SIDS_PREFIX = 'sso:user:';
const REFRESH_PREFIX = 'sso:rt:';
const REVOKED_PREFIX = 'sso:revoked:';
const USER_SIDS_SUFFIX = ':sids';
const SESSION_APPS_SUFFIX = ':apps';

/**
 * 解析 '15m' / '24h' / '7d' / 纯秒数 → 秒
 * @param {string|number} value
 * @param {number} fallbackSeconds
 * @returns {number}
 */
function parseDurationToSeconds(value, fallbackSeconds) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value);
  const text = String(value || '').trim();
  if (!text) return fallbackSeconds;
  const matched = text.match(/^(\d+)\s*(ms|s|m|h|d)?$/i);
  if (!matched) return fallbackSeconds;
  const amount = Number(matched[1]);
  if (!Number.isFinite(amount) || amount <= 0) return fallbackSeconds;
  switch ((matched[2] || 's').toLowerCase()) {
    case 'ms': return Math.max(1, Math.floor(amount / 1000));
    case 'm': return amount * 60;
    case 'h': return amount * 3600;
    case 'd': return amount * 86400;
    default: return amount;
  }
}

/** access / refresh 的有效期（秒），用于给 Redis 键设 TTL */
const ACCESS_TTL_SECONDS = parseDurationToSeconds(
  config.api?.sso?.accessTokenTtl || config.api?.security?.jwtExpiresIn,
  24 * 3600,
);
const REFRESH_TTL_SECONDS = parseDurationToSeconds(
  config.jwt?.refreshExpiresIn || config.api?.security?.jwtRefreshExpiresIn,
  7 * 24 * 3600,
);

const userSidsKey = (userId) => `${USER_SIDS_PREFIX}${userId}${USER_SIDS_SUFFIX}`;
const sessionAppsKey = (sid) => `${SESSION_PREFIX}${sid}${SESSION_APPS_SUFFIX}`;

function newSessionId() {
  return crypto.randomUUID();
}

/**
 * 生成刷新令牌：**不透明随机串**，不再用 JWT。
 *
 * 原因：① `eadaf.refresh_tokens.token` 是 VARCHAR(255)，JWT 加 `sid` 就顶到上限；
 * ② JWT 的 `iat` 只到秒 —— 同一秒内轮换会签出**完全相同**的字符串，新记录与已撤销
 * 记录同串，刷新时按串查回旧行 → 刚刷新就"令牌无效"。随机串两个问题都没有。
 *
 * 客户端按不透明字符串处理即可（只回传、不解码）；旧 JWT 刷新令牌仍按串查库，继续可用。
 */
function newRefreshToken() {
  return `rt_${crypto.randomBytes(32).toString('base64url')}`;
}

/**
 * 建会话
 * @param {{ userId: string, applicationId?: string|null, platform?: boolean, req?: object }} params
 * @returns {Promise<string>} sid（Redis 不可用时也返回，只是记不下来）
 */
async function createSession({ userId, applicationId = null, platform = false, req = {} } = {}) {
  const sid = newSessionId();
  const now = new Date().toISOString();

  await withRedis('createSession', async (client) => {
    const key = SESSION_PREFIX + sid;
    await client.hSet(key, {
      sid,
      user_id: userId || '',
      application_id: applicationId || '',
      platform: platform ? '1' : '0',
      ip: String(req.ip || ''),
      user_agent: String(req.headers?.['user-agent'] || '').slice(0, 200),
      created_at: now,
      last_seen_at: now,
    });
    await client.expire(key, REFRESH_TTL_SECONDS);
    if (userId) {
      const setKey = userSidsKey(userId);
      await client.sAdd(setKey, sid);
      await client.expire(setKey, REFRESH_TTL_SECONDS);
    }
  });

  return sid;
}

/**
 * 复用已有会话（同一浏览器换应用登录时不新建）：
 * 只有会话存在且属于同一用户时才复用，否则新建 —— 避免别人传一个 sid 就能把你的登录并进去。
 * @returns {Promise<string>} sid
 */
async function reuseOrCreateSession({ requestedSid, userId, applicationId = null, platform = false, req = {} } = {}) {
  if (requestedSid) {
    const info = await withRedis('readSession', (client) => client.hGetAll(SESSION_PREFIX + requestedSid));
    if (info && info.sid && (!info.user_id || info.user_id === String(userId || ''))) {
      await touchSession(requestedSid);
      return requestedSid;
    }
  }
  return createSession({ userId, applicationId, platform, req });
}

/** 刷新活跃时间（best-effort；失败不影响请求） */
async function touchSession(sid) {
  if (!sid) return null;
  return withRedis('touchSession', async (client) => {
    const key = SESSION_PREFIX + sid;
    const exists = await client.exists(key);
    if (!exists) return null;
    await client.hSet(key, { last_seen_at: new Date().toISOString() });
    return true;
  });
}

/**
 * 把刷新令牌绑定到会话（刷新/登出时靠它找回 sid，不必依赖 access token）。
 *
 * 顺带把"这个应用用过这条会话"记进集合 —— Phase 3 的 back-channel logout 要据此
 * 找出"该设备上还有哪些应用需要被通知退出"。
 */
async function bindRefreshToken(token, { sid, userId, applicationId = null } = {}) {
  if (!token || !sid) return null;
  return withRedis('bindRefreshToken', async (client) => {
    const stored = await client.set(
      REFRESH_PREFIX + token,
      JSON.stringify({ sid, user_id: userId || '', application_id: applicationId || '' }),
      { EX: REFRESH_TTL_SECONDS },
    );
    if (applicationId) {
      const appsKey = sessionAppsKey(sid);
      await client.sAdd(appsKey, applicationId);
      await client.expire(appsKey, REFRESH_TTL_SECONDS);
    }
    return stored;
  });
}

/** 该会话涉及过哪些应用（用于 back-channel logout 通知） */
async function listSessionApplications(sid) {
  if (!sid) return [];
  const apps = await withRedis('listSessionApplications', (client) => client.sMembers(sessionAppsKey(sid)));
  return apps || [];
}

/** 由刷新令牌反查会话 */
async function resolveRefreshToken(token) {
  if (!token) return null;
  return withRedis('resolveRefreshToken', async (client) => {
    const raw = await client.get(REFRESH_PREFIX + token);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });
}

/** 标记刷新令牌已轮换（重放检测用；graceSeconds 内的重复提交按正常并发处理） */
async function markRefreshTokenRotated(token, { rotatedTo, sid } = {}) {
  if (!token) return null;
  return withRedis('markRefreshTokenRotated', async (client) => {
    const payload = { sid: sid || '', rotated_to: rotatedTo || '', rotated_at: new Date().toISOString() };
    await client.set(REFRESH_PREFIX + token, JSON.stringify(payload), { EX: REFRESH_TTL_SECONDS });
    return true;
  });
}

/**
 * 撤销会话：写撤销标记（中间件据此拦截）+ 删会话详情
 * @param {string} sid
 * @param {string} [reason]
 * @returns {Promise<boolean>}
 */
async function revokeSession(sid, reason = 'logout') {
  if (!sid) return false;
  const done = await withRedis('revokeSession', async (client) => {
    await client.set(REVOKED_PREFIX + sid, reason, {
      EX: Math.max(ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS),
    });
    const info = await client.hGetAll(SESSION_PREFIX + sid);
    await client.del(SESSION_PREFIX + sid);
    // 注意：apps 集合故意**不删** —— 撤销时调用方还要用它找 back-channel 通知对象
    if (info?.user_id) await client.sRem(userSidsKey(info.user_id), sid);
    return true;
  });
  return done === true;
}

/** 会话是否已被撤销（Redis 不可用 → false，fail-open，不让全站被拒） */
async function isSessionRevoked(sid) {
  if (!sid) return false;
  const exists = await withRedis('isSessionRevoked', (client) => client.exists(REVOKED_PREFIX + sid));
  return exists === 1;
}

/** 列出用户的活跃会话（按最近活跃倒序） */
async function listSessions(userId) {
  if (!userId) return [];
  const sessions = await withRedis('listSessions', async (client) => {
    const sids = await client.sMembers(userSidsKey(userId));
    if (!sids.length) return [];
    const rows = await Promise.all(sids.map(async (sid) => {
      const info = await client.hGetAll(SESSION_PREFIX + sid);
      return info && info.sid ? info : null;
    }));
    return rows.filter(Boolean);
  });

  return (sessions || []).sort((a, b) => String(b.last_seen_at || '').localeCompare(String(a.last_seen_at || '')));
}

/** 撤销该用户的全部会话（退出所有设备） */
async function revokeAllSessions(userId, reason = 'logout-all') {
  if (!userId) return 0;
  const sids = await withRedis('listSidsForRevokeAll', (client) => client.sMembers(userSidsKey(userId)));
  if (!sids || !sids.length) return 0;
  let revoked = 0;
  for (const sid of sids) {
    if (await revokeSession(sid, reason)) revoked += 1;
  }
  return revoked;
}

/** 会话存储是否可用（Redis 连通）：列表接口据此区分"没有会话"与"查不到" */
async function isSessionStoreAvailable() {
  return isRedisAvailable();
}

module.exports = {
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  parseDurationToSeconds,
  newSessionId,
  newRefreshToken,
  createSession,
  reuseOrCreateSession,
  bindRefreshToken,
  resolveRefreshToken,
  markRefreshTokenRotated,
  touchSession,
  revokeSession,
  revokeAllSessions,
  isSessionRevoked,
  isSessionStoreAvailable,
  listSessions,
  listSessionApplications,
};
