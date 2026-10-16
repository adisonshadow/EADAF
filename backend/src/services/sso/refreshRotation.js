/**
 * 刷新令牌轮换（RFC 9700 的 refresh token rotation + 重放检测）。
 *
 * 单一实现点：老流程 `POST /api/v1/auth/refresh` 与 Phase 2 的 `POST /api/v1/oauth/token`
 * （grant_type=refresh_token）都走这里，只有"签什么形态的访问令牌"不同（前者 HMAC、后者 RS256）。
 *
 * 轮换：旧记录置 REVOKED、新记录另起一行，这样旧串被再次出示时能查出来 → 判定重放。
 * 宽限：`REUSE_GRACE_MS` 内的重复提交按并发处理（前端 StrictMode 双跑、网络重试），
 *       只有超过宽限的重放才撤销整条会话。
 */
const { Op } = require('sequelize');
const logger = require('../../utils/logger');
const ssoSession = require('../../utils/ssoSession');
const RefreshToken = require('../../models/refreshToken');
const User = require('../../models/user');

/** 同一次轮换的并发重复提交宽限（毫秒） */
const REUSE_GRACE_MS = 60 * 1000;

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7d

/**
 * @param {{ presentedToken: string, applicationIdHint?: string|null }} params
 * @returns {Promise<
 *   { ok: true, user: object, sid: string|null, applicationId: string|null, newRefreshToken: string }
 *   | { ok: false, status: number, error_code: string, message: string }
 * >}
 */
async function rotateRefreshToken({ presentedToken, applicationIdHint = null }) {
  const tokenRecord = await RefreshToken.findOne({
    where: {
      token: presentedToken,
      expires_at: { [Op.gt]: new Date() },
    },
  });

  if (!tokenRecord) {
    return { ok: false, status: 401, error_code: 'TOKEN_INVALID', message: '刷新令牌无效或已过期' };
  }

  const bound = await ssoSession.resolveRefreshToken(presentedToken);
  const sid = bound?.sid || null;
  const applicationId = applicationIdHint || bound?.application_id || null;

  if (tokenRecord.status !== 'ACTIVE') {
    const rotatedAt = bound?.rotated_at ? Date.parse(bound.rotated_at) : NaN;
    const reusedAfterGrace = Number.isFinite(rotatedAt) && Date.now() - rotatedAt > REUSE_GRACE_MS;

    if (reusedAfterGrace) {
      if (sid) await ssoSession.revokeSession(sid, 'refresh-token-reuse');
      logger.warn('检测到刷新令牌重放，已撤销该会话', { user_id: tokenRecord.user_id, sid });
      return {
        ok: false,
        status: 401,
        error_code: 'SESSION_REVOKED',
        message: '刷新令牌已被使用过，会话已退出，请重新登录',
      };
    }

    return { ok: false, status: 401, error_code: 'TOKEN_INVALID', message: '刷新令牌无效或已过期' };
  }

  if (sid && await ssoSession.isSessionRevoked(sid)) {
    return { ok: false, status: 401, error_code: 'SESSION_REVOKED', message: '会话已退出，请重新登录' };
  }

  const user = await User.findOne({
    where: { user_id: tokenRecord.user_id },
    attributes: ['user_id', 'username', 'status'],
  });
  if (!user || user.status !== 'ACTIVE') {
    return { ok: false, status: 401, error_code: 'TOKEN_INVALID', message: '用户不存在或已被禁用' };
  }

  const newRefreshToken = ssoSession.newRefreshToken();
  await tokenRecord.update({ status: 'REVOKED' });
  await RefreshToken.create({
    user_id: user.user_id,
    token: newRefreshToken,
    expires_at: new Date(Date.now() + REFRESH_TTL_MS),
    status: 'ACTIVE',
  });

  await ssoSession.markRefreshTokenRotated(presentedToken, { rotatedTo: newRefreshToken, sid });
  await ssoSession.bindRefreshToken(newRefreshToken, {
    sid,
    userId: user.user_id,
    applicationId,
  });
  await ssoSession.touchSession(sid);

  return { ok: true, user, sid, applicationId, newRefreshToken };
}

module.exports = { rotateRefreshToken, REUSE_GRACE_MS, REFRESH_TTL_MS };
