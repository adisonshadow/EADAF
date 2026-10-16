/**
 * 撤销 SSO 会话的**统一入口**。
 *
 * 撤销要立刻生效（写 Redis 撤销标记 → 中间件下一次请求就拦），
 * 同时"尽力而为"地通过 back-channel logout 通知该设备上用过的每个应用，
 * 让它们不用等下一次请求就清掉自己的会话。
 *
 * 所有撤销场景都走这里：用户点退出、管理台"登录设备"撤销单台/全部、
 * RP-Initiated Logout（`id_token_hint`）、刷新令牌重放检测。
 */
const logger = require('../../utils/logger');
const ssoSession = require('../../utils/ssoSession');
const { notifyBackChannelLogout } = require('./backChannelLogout');

/**
 * @param {{ sid?: string|null, userId?: string|null, issuer?: string|null, reason?: string }} params
 * @returns {Promise<boolean>} 会话是否撤销成功（Redis 不可用时为 false，属 fail-open 降级）
 */
async function revokeSession({ sid, userId = null, issuer = null, reason = 'logout' }) {
  if (!sid) return false;

  const revoked = await ssoSession.revokeSession(sid, reason);

  // 通知放最后且不 await：撤销必须快，应用没响应不能拖住登出
  notifyBackChannelLogout({ sid, userId, issuer, reason }).catch((error) => {
    logger.warn('back-channel logout 通知异常（不影响撤销）', { sid, error: error.message });
  });

  return revoked;
}

/**
 * 撤销某用户的全部会话（退出所有设备），逐个通知
 * @param {{ userId?: string|null, issuer?: string|null, reason?: string }} params
 * @returns {Promise<number>} 实际撤销的会话数
 */
async function revokeAllSessions({ userId, issuer = null, reason = 'logout-all' }) {
  if (!userId) return 0;

  const sessions = await ssoSession.listSessions(userId);
  let revoked = 0;
  for (const session of sessions) {
    if (await revokeSession({ sid: session.sid, userId, issuer, reason })) revoked += 1;
  }
  return revoked;
}

module.exports = { revokeSession, revokeAllSessions };
