/**
 * Phase 2：OAuth 2.1 授权码 + PKCE 端点（EADAF 作为 OP）。
 *
 * - `POST /api/v1/oauth/authorize`：**管理台前端**已登录后调用（`auth` 中间件），
 *   校验客户端与回调地址、登记一次性授权码，返回给前端去 302 到 BFF。
 *   之所以由前端发起：本平台没有 IdP Cookie（会话在 localStorage 的 sid 里），
 *   浏览器直接 GET 后端授权端点时无法证明"当前是谁"。
 * - `POST /api/v1/oauth/token`：BFF 服务端调用，`authorization_code`（+ PKCE）/ `refresh_token`。
 *   返回标准 OAuth 扁平结构（`access_token`/`token_type`/`expires_in`/`refresh_token`/`id_token`），
 *   不套 `{code,message,data}` 信封 —— 这是给标准客户端消费的接口。
 * - `GET /.well-known/jwks.json`、`/.well-known/openid-configuration`：公开。
 */
const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../utils/logger');
const Application = require('../models/application');
const User = require('../models/user');
const RefreshToken = require('../models/refreshToken');
const {
  requestHostInfo,
  resolveAllowedRedirectUris,
  normalizeRedirectUriForMatch,
} = require('../utils/ssoRedirectUri');
const { resolveSsoSigningSecret, hasSsoSigningSecret } = require('../utils/ssoSecret');
const ssoSession = require('../utils/ssoSession');
const oauthService = require('../services/sso/oauthService');
const refreshRotation = require('../services/sso/refreshRotation');
const { issuerFromContext } = require('../utils/ssoIssuer');

function oauthError(ctx, status, error, description) {
  ctx.status = status;
  ctx.body = { error, ...(description ? { error_description: description } : {}) };
}

/** 从 body 或 HTTP Basic 里取客户端凭据（client_secret_basic / client_secret_post） */
function extractClientCredentials(ctx) {
  const body = ctx.request.body || {};
  let clientId = body.client_id ? String(body.client_id) : '';
  let clientSecret = body.client_secret ? String(body.client_secret) : '';

  const header = String(ctx.headers.authorization || '');
  if (header.toLowerCase().startsWith('basic ')) {
    try {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const index = decoded.indexOf(':');
      if (index >= 0) {
        clientId = clientId || decoded.slice(0, index);
        clientSecret = clientSecret || decodeURIComponent(decoded.slice(index + 1));
      }
    } catch {
      /* 解析失败按未提供处理 */
    }
  }

  return { clientId, clientSecret };
}

/** 校验客户端密钥（应用统一密钥：client_secret → app_secret → 旧 salt） */
function isClientSecretValid(application, providedSecret) {
  if (!providedSecret) return false;
  const expected = resolveSsoSigningSecret(application);
  return !!expected && expected === providedSecret;
}

class OAuthController {
  /**
   * 登记授权码（管理台前端在用户已登录后调用）
   */
  static async authorize(ctx) {
    try {
      const body = ctx.request.body || {};
      const clientId = String(body.client_id || '').trim();
      const redirectUri = String(body.redirect_uri || '').trim();
      const responseType = String(body.response_type || 'code').trim();
      const codeChallenge = body.code_challenge ? String(body.code_challenge) : '';
      const codeChallengeMethod = body.code_challenge_method
        ? String(body.code_challenge_method).toUpperCase()
        : (codeChallenge ? 'PLAIN' : '');
      const scope = String(body.scope || 'openid profile').trim();
      const nonce = body.nonce ? String(body.nonce) : '';
      const state = body.state ? String(body.state) : '';

      if (!clientId) return oauthError(ctx, 400, 'invalid_client', '缺少 client_id');
      if (responseType !== 'code') {
        return oauthError(ctx, 400, 'unsupported_response_type', '仅支持 response_type=code');
      }
      if (!redirectUri) return oauthError(ctx, 400, 'invalid_request', '缺少 redirect_uri');
      if (codeChallengeMethod && !['S256', 'PLAIN'].includes(codeChallengeMethod)) {
        return oauthError(ctx, 400, 'invalid_request', 'code_challenge_method 仅支持 S256 / plain');
      }

      const application = await Application.findOne({
        where: { application_id: clientId, status: 'ACTIVE', sso_enabled: true },
      });
      if (!application || !hasSsoSigningSecret(application)) {
        return oauthError(ctx, 400, 'invalid_client', '应用不存在、未启用 SSO 或未生成统一密钥');
      }

      const allowed = resolveAllowedRedirectUris(application.sso_config, requestHostInfo(ctx));
      if (!allowed.includes(normalizeRedirectUriForMatch(redirectUri))) {
        logger.warn('授权请求的 redirect_uri 未登记', { client_id: clientId, redirect_uri: redirectUri });
        return oauthError(ctx, 400, 'invalid_request', 'redirect_uri 未在该应用中登记');
      }

      const user = ctx.state.user || {};
      const code = await oauthService.saveAuthorizationCode({
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        scope,
        nonce,
        user_id: user.user_id,
        username: user.username || '',
        sid: user.sid || null,
        created_at: new Date().toISOString(),
      });

      if (!code) {
        return oauthError(
          ctx,
          503,
          'temporarily_unavailable',
          '授权码存储不可用（Redis），请稍后重试',
        );
      }

      ctx.body = {
        code: 200,
        message: 'success',
        data: {
          code,
          redirect_uri: redirectUri,
          state,
          expires_in: oauthService.CODE_TTL_SECONDS,
        },
      };
    } catch (error) {
      logger.error('登记授权码失败', { error: error.message });
      return oauthError(ctx, 500, 'server_error', '登记授权码失败');
    }
  }

  /**
   * 换票：authorization_code / refresh_token
   */
  static async token(ctx) {
    try {
      const body = ctx.request.body || {};
      const grantType = String(body.grant_type || '').trim();
      const { clientId, clientSecret } = extractClientCredentials(ctx);
      const issuer = issuerFromContext(ctx);

      if (grantType === 'authorization_code') {
        return await OAuthController.exchangeAuthorizationCode(ctx, {
          code: body.code ? String(body.code) : '',
          redirectUri: body.redirect_uri ? String(body.redirect_uri) : '',
          codeVerifier: body.code_verifier ? String(body.code_verifier) : '',
          clientId,
          clientSecret,
          issuer,
        });
      }

      if (grantType === 'refresh_token') {
        return await OAuthController.exchangeRefreshToken(ctx, {
          refreshToken: body.refresh_token ? String(body.refresh_token) : '',
          clientId,
          clientSecret,
          issuer,
        });
      }

      return oauthError(
        ctx,
        400,
        'unsupported_grant_type',
        '仅支持 authorization_code 与 refresh_token',
      );
    } catch (error) {
      logger.error('OAuth 换票失败', { error: error.message });
      return oauthError(ctx, 500, 'server_error', '换票失败');
    }
  }

  /**
   * authorization_code 换票（含 PKCE 校验）
   */
  static async exchangeAuthorizationCode(ctx, { code, redirectUri, codeVerifier, clientId, clientSecret, issuer }) {
    if (!code) return oauthError(ctx, 400, 'invalid_request', '缺少 code');

    // 一次性消费：无论后续校验是否通过，这个码都不能再用
    const record = await oauthService.consumeAuthorizationCode(code);
    if (!record) {
      return oauthError(ctx, 400, 'invalid_grant', '授权码无效、已使用或已过期');
    }

    if (!clientId || clientId !== record.client_id) {
      return oauthError(ctx, 400, 'invalid_client', 'client_id 与授权码不匹配');
    }
    if (redirectUri && normalizeRedirectUriForMatch(redirectUri) !== normalizeRedirectUriForMatch(record.redirect_uri)) {
      return oauthError(ctx, 400, 'invalid_grant', 'redirect_uri 与授权请求不一致');
    }
    if (!oauthService.verifyPkce({
      codeChallenge: record.code_challenge,
      method: record.code_challenge_method,
      verifier: codeVerifier,
    })) {
      return oauthError(ctx, 400, 'invalid_grant', 'PKCE 校验失败');
    }

    const application = await Application.findOne({
      where: { application_id: clientId, status: 'ACTIVE', sso_enabled: true },
    });
    if (!application || !hasSsoSigningSecret(application)) {
      return oauthError(ctx, 400, 'invalid_client', '应用不存在、未启用 SSO 或未生成统一密钥');
    }
    // 新接入一律是 BFF（机密客户端）：必须校验密钥
    if (!isClientSecretValid(application, clientSecret)) {
      return oauthError(ctx, 401, 'invalid_client', 'client_secret 无效');
    }

    if (record.sid && await ssoSession.isSessionRevoked(record.sid)) {
      return oauthError(ctx, 400, 'invalid_grant', '会话已退出，请重新登录');
    }

    const user = await User.findOne({
      where: { user_id: record.user_id, status: 'ACTIVE' },
      attributes: ['user_id', 'username', 'status'],
    });
    if (!user) return oauthError(ctx, 400, 'invalid_grant', '用户不存在或已被禁用');

    const accessToken = oauthService.signUserAccessToken({
      userId: user.user_id,
      username: user.username,
      sid: record.sid,
      applicationId: application.application_id,
      scope: record.scope,
      issuer,
    });

    const refreshToken = await OAuthController.issueRefreshToken({
      userId: user.user_id,
      sid: record.sid,
      applicationId: application.application_id,
    });

    const idToken = oauthService.signIdToken({
      userId: user.user_id,
      sid: record.sid,
      applicationId: application.application_id,
      issuer,
      nonce: record.nonce,
    });

    logger.debug('授权码换票成功', {
      client_id: clientId,
      user_id: user.user_id,
      sid: record.sid,
    });

    ctx.status = 200;
    ctx.body = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: oauthService.accessTokenTtlSeconds(),
      refresh_token: refreshToken,
      id_token: idToken,
      scope: record.scope || 'openid profile',
      ...(record.sid ? { sid: record.sid } : {}),
    };
  }

  /**
   * refresh_token 换票（与老流程共用轮换/重放检测实现，只是令牌形态不同）
   */
  static async exchangeRefreshToken(ctx, { refreshToken, clientId, clientSecret, issuer }) {
    if (!refreshToken) return oauthError(ctx, 400, 'invalid_request', '缺少 refresh_token');

    const bound = await ssoSession.resolveRefreshToken(refreshToken);
    const appId = clientId || bound?.application_id || '';

    let application = null;
    if (appId) {
      application = await Application.findOne({
        where: { application_id: appId, status: 'ACTIVE', sso_enabled: true },
      });
      if (!application || !hasSsoSigningSecret(application)) {
        return oauthError(ctx, 400, 'invalid_client', '应用不存在、未启用 SSO 或未生成统一密钥');
      }
      if (!isClientSecretValid(application, clientSecret)) {
        return oauthError(ctx, 401, 'invalid_client', 'client_secret 无效');
      }
    }

    const rotation = await refreshRotation.rotateRefreshToken({
      presentedToken: refreshToken,
      applicationIdHint: application?.application_id || null,
      issuer,
    });

    if (!rotation.ok) {
      // 420/401 之外，OAuth 客户端只认 invalid_grant；把会话撤销也归到这里并带上描述
      const description = rotation.error_code === 'SESSION_REVOKED'
        ? '会话已退出，请重新登录'
        : rotation.message;
      return oauthError(ctx, 400, 'invalid_grant', description);
    }

    const accessToken = oauthService.signUserAccessToken({
      userId: rotation.user.user_id,
      username: rotation.user.username,
      sid: rotation.sid,
      applicationId: rotation.applicationId,
      scope: 'openid profile',
      issuer,
    });

    ctx.status = 200;
    ctx.body = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: oauthService.accessTokenTtlSeconds(),
      refresh_token: rotation.newRefreshToken,
      ...(rotation.sid ? { sid: rotation.sid } : {}),
    };
  }

  /** 建一条刷新令牌记录（不透明串）并绑定到会话 */
  static async issueRefreshToken({ userId, sid, applicationId }) {
    const refreshToken = ssoSession.newRefreshToken();
    await RefreshToken.create({
      user_id: userId,
      token: refreshToken,
      expires_at: new Date(Date.now() + refreshRotation.REFRESH_TTL_MS),
      status: 'ACTIVE',
    });
    await ssoSession.bindRefreshToken(refreshToken, { sid, userId, applicationId });
    return refreshToken;
  }

  /** JWKS（公开） */
  static async jwks(ctx) {
    const { getJwks } = require('../utils/ssoKeys');
    ctx.set('Cache-Control', 'public, max-age=300');
    ctx.body = getJwks();
  }

  /** OIDC 发现文档（公开） */
  static async discovery(ctx) {
    ctx.set('Cache-Control', 'public, max-age=300');
    ctx.body = oauthService.buildDiscoveryDocument(issuerFromContext(ctx));
  }
}

module.exports = OAuthController;
