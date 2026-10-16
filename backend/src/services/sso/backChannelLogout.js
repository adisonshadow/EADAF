/**
 * Back-Channel Logout：撤销会话时主动通知各应用 BFF。
 *
 * 为什么需要：前端的 sid 撤销只是"令牌立刻失效"，应用**下次请求**才会发现；
 * 有了 back-channel，EADAF 直接 POST 一个签名的 logout token，应用立刻清自己的会话。
 *
 * 应用侧怎么配：在应用的 SSO 配置里填 `backchannel_logout_uri`（https 建议，本机 http 亦可）。
 * 应用收到 `POST application/x-www-form-urlencoded` 的 `logout_token` 后：
 *   1. 用 EADAF 的 JWKS 公钥验签（RS256）、校验 `iss`/`aud`(=自己 application_id)/`exp`；
 *   2. 必须带 `events` 且不含 `nonce`（防止把 ID Token 当 logout token 重放）；
 *   3. 按 `sid`（+ `sub`）清掉本应用对应会话，返回 200。
 *
 * 这里一律"尽力而为"：超时/失败只记日志，绝不影响撤销本身，也不阻塞登出响应。
 */
const logger = require('../../utils/logger');
const Application = require('../../models/application');
const ssoSession = require('../../utils/ssoSession');
const oauthService = require('./oauthService');

/** 单次投递超时（毫秒）：应用没响应也不能拖住平台 */
const DELIVERY_TIMEOUT_MS = 5000;

async function deliverLogoutToken(uri, logoutToken) {
  const response = await fetch(uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ logout_token: logoutToken }).toString(),
    signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`应用返回 HTTP ${response.status}`);
  }
}

/**
 * 通知该会话涉及过的所有应用（异步、best-effort）
 * @param {{ sid: string, userId?: string|null, issuer?: string|null, reason?: string }} params
 * @returns {Promise<{ notified: number, failed: number, skipped: number }>}
 */
async function notifyBackChannelLogout({ sid, userId = null, issuer = null, reason = 'logout' }) {
  const summary = { notified: 0, failed: 0, skipped: 0 };
  if (!sid) return summary;

  let applicationIds = [];
  try {
    applicationIds = await ssoSession.listSessionApplications(sid);
  } catch (error) {
    logger.warn('读取会话关联应用失败，跳过 back-channel 通知', { sid, error: error.message });
    return summary;
  }
  if (!applicationIds.length) return summary;

  const applications = await Application.findAll({
    where: { application_id: applicationIds, status: 'ACTIVE' },
  });

  const effectiveIssuer = String(issuer || process.env.SSO_ISSUER || '').replace(/\/+$/, '');

  await Promise.all(applications.map(async (application) => {
    const uri = application.sso_config?.backchannel_logout_uri;
    if (!uri) {
      summary.skipped += 1;
      return;
    }
    if (!effectiveIssuer) {
      // logout token 必须有 iss；没有配置 SSO_ISSUER 且调用方没传 origin 时只能跳过并告警
      logger.warn('未确定 issuer，跳过 back-channel 通知（可配置 SSO_ISSUER）', {
        application_id: application.application_id,
      });
      summary.skipped += 1;
      return;
    }
    try {
      const logoutToken = oauthService.signLogoutToken({
        userId,
        sid,
        applicationId: application.application_id,
        issuer: effectiveIssuer,
      });
      await deliverLogoutToken(uri, logoutToken);
      summary.notified += 1;
      logger.debug('back-channel logout 已投递', {
        application_id: application.application_id,
        sid,
        reason,
      });
    } catch (error) {
      summary.failed += 1;
      logger.warn('back-channel logout 投递失败（不影响撤销）', {
        application_id: application.application_id,
        uri,
        error: error.message,
      });
    }
  }));

  return summary;
}

module.exports = {
  notifyBackChannelLogout,
  deliverLogoutToken,
  DELIVERY_TIMEOUT_MS,
};
