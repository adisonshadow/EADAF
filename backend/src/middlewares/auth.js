const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../utils/logger');
const Application = require('../models/application');
const { resolveSsoSigningSecret, hasSsoSigningSecret } = require('../utils/ssoSecret');
const ssoSession = require('../utils/ssoSession');
const { getPublicKey } = require('../utils/ssoKeys');

/**
 * 查一个可用于验签的 SSO 应用。
 * 应用必须 ACTIVE + 启用 SSO + 有统一密钥（client_secret / app_secret / 旧 salt）。
 * @returns {Promise<{application: object, secret: string}|null>}
 */
async function findSsoSigningApp(applicationId) {
  if (!applicationId) return null;

  const application = await Application.findOne({
    where: {
      application_id: applicationId,
      status: 'ACTIVE',
      sso_enabled: true,
    },
  });

  if (!application || !hasSsoSigningSecret(application)) return null;

  return { application, secret: resolveSsoSigningSecret(application) };
}

/**
 * 候选验签密钥顺序（纯函数，自检见 scripts/verify-auth-secret-candidates.js）。
 *
 * 顺序决定「哪类令牌能被接受」，因此不能只按 `?app=` 判断：
 *   1. 带 `?app=`：应用密钥优先（老流程的 SSO 用户 JWT），平台密钥兜底
 *      （应用 Token 是平台密钥签发的，客户端多带了个 app 也不该 401）
 *   2. 应用 Token（`type=application`，平台密钥签发）：平台密钥优先
 *   3. 其余（SSO 用户 JWT / Phase 2 授权码换来的平台签发令牌）：令牌自述 application_id 优先
 *
 * 平台候选有两把：HS256 的平台密钥（平台会话 JWT、应用 Token）与 RS256 的公钥
 * （Phase 2 起由 `/oauth/token` 签发的用户令牌）。
 *
 * @param {object} input
 * @param {{application: object|null, secret: string}|null} [input.queryApp] `?app=` 解析出的应用
 * @param {{application: object|null, secret: string}|null} [input.claimedApp] 令牌自述 application_id 解析出的应用
 * @param {string} input.platformSecret 平台 JWT 对称密钥
 * @param {string} [input.platformPublicKey] 平台 RS256 公钥（PEM）
 * @param {boolean} [input.isApplicationToken] 令牌为应用 Token（type=application）
 * @returns {Array<{key: string, algorithms: string[], application: object|null, source: 'app'|'platform'}>}
 */
function buildSecretCandidates({
  queryApp,
  claimedApp,
  platformSecret,
  platformPublicKey,
  isApplicationToken,
}) {
  const HMAC_ALGS = ['HS256', 'HS384', 'HS512'];

  const platformCandidates = [
    {
      key: platformSecret,
      algorithms: HMAC_ALGS,
      application: null,
      source: 'platform',
    },
    ...(platformPublicKey
      ? [{
          key: platformPublicKey,
          algorithms: ['RS256'],
          application: null,
          source: 'platform',
        }]
      : []),
  ];

  /** 应用密钥签发的令牌（老流程，HMAC） */
  const appCandidate = (entry) => (entry && entry.secret
    ? {
        key: entry.secret,
        algorithms: HMAC_ALGS,
        application: entry.application || null,
        source: 'app',
      }
    : null);

  const candidates = [];
  const add = (candidate) => {
    if (!candidate || !candidate.key) return;
    if (candidates.some((item) => item.key === candidate.key)) return;
    candidates.push(candidate);
  };

  if (queryApp) {
    add(appCandidate(queryApp));
    platformCandidates.forEach(add);
  } else if (isApplicationToken) {
    platformCandidates.forEach(add);
    add(appCandidate(claimedApp));
  } else {
    add(appCandidate(claimedApp));
    platformCandidates.forEach(add);
  }

  return candidates;
}

/** 旧流程使用情况的限流日志（避免每个请求一条） */
const LEGACY_LOG_COOLDOWN_MS = 60 * 1000;
let lastLegacyLogAt = 0;
function noteLegacyUsage(ctx) {
  const now = Date.now();
  if (now - lastLegacyLogAt < LEGACY_LOG_COOLDOWN_MS) return;
  lastLegacyLogAt = now;
  logger.warn('仍在使用 SSO 旧流程（?app= + 应用密钥签发的用户 JWT）；该路径保留 2 个版本后停用，请迁移到授权码 + PKCE', {
    method: ctx.method,
    url: ctx.url,
    application_id: ctx.query?.app || null,
  });
}

/**
 * Bearer Token 认证中间件
 * 支持标准 JWT 认证和第三方应用 SSO 认证
 *
 * 密钥选择：过去只看 URL 上有没有 `?app=`，而两类令牌正好用两把密钥签发
 * （SSO 用户 JWT 用应用密钥、应用 Token 用平台密钥），客户端漏带 / 多带 `?app=`
 * 都必然 401（现象：业务应用一发 EADAF 请求就掉登录）。现在改为按令牌自身的
 * 线索挑密钥：令牌里的 application_id 声明 + `?app=` 显式声明 + 平台密钥兜底。
 */
module.exports = async (ctx, next) => {
  const authHeader = ctx.headers.authorization;
  
  if (!authHeader) {
    logger.warn('认证失败：未提供 Authorization 头', {
      method: ctx.method,
      url: ctx.url,
      ip: ctx.ip
    });
    
    ctx.status = 401;
    ctx.body = {
      code: 401,
      message: '未提供认证令牌',
      error_code: 'AUTH_MISSING',
      data: null
    };
    return;
  }

  // 检查 Authorization 头格式
  if (!authHeader.startsWith('Bearer ')) {
    logger.warn('认证失败：Authorization 头格式错误', {
      method: ctx.method,
      url: ctx.url,
      ip: ctx.ip,
      authHeader: authHeader.substring(0, 20) + '...'
    });
    
    ctx.status = 401;
    ctx.body = {
      code: 401,
      message: '认证令牌格式错误，请使用 Bearer 格式',
      error_code: 'AUTH_MALFORMED',
      data: null
    };
    return;
  }

  const token = authHeader.replace('Bearer ', '');
  
  if (!token) {
    logger.warn('认证失败：令牌为空', {
      method: ctx.method,
      url: ctx.url,
      ip: ctx.ip
    });
    
    ctx.status = 401;
    ctx.body = {
      code: 401,
      message: '认证令牌不能为空',
      error_code: 'AUTH_MISSING',
      data: null
    };
    return;
  }
  
  try {
    // 先不验签解一层：只用来判断「该用哪把密钥」，是否可信仍由下面的 jwt.verify 决定
    const { app } = ctx.query;
    const unverified = jwt.decode(token) || {};
    const claimedAppId = typeof unverified === 'object' ? unverified.application_id : null;
    const isApplicationToken = typeof unverified === 'object' && unverified.type === 'application';

    const platformSecret = config.api.security.jwtSecret;

    // ?app= 是显式声明：指定的应用必须存在且启用 SSO，否则保持原语义直接 401
    let queryApp = null;
    if (app) {
      queryApp = await findSsoSigningApp(app);
      if (!queryApp) {
        logger.warn('SSO 认证失败：应用不存在或未启用 SSO', {
          method: ctx.method,
          url: ctx.url,
          app: app
        });

        ctx.status = 401;
        ctx.body = {
          code: 401,
          message: '无效的第三方应用认证',
          error_code: 'APP_CONTEXT_INVALID',
          data: null
        };
        return;
      }
      logger.debug('使用 SSO 认证', {
        application_id: app,
        application_name: queryApp.application.name
      });
    }

    // 候选密钥顺序：
    //   - 带 ?app=：应用密钥优先，平台密钥兜底（应用 Token 是平台密钥签的，多带 app 也要能用）
    //   - 应用 Token（type=application，平台密钥签发）：平台密钥优先
    //   - 其余（SSO 用户 JWT）：令牌自述的 application_id 优先
    const claimedApp = !queryApp && !isApplicationToken && claimedAppId
      ? await findSsoSigningApp(claimedAppId)
      : null;
    if (claimedApp) {
      logger.debug('使用 SSO 认证（令牌自述 application_id）', {
        application_id: claimedApp.application.application_id,
        application_name: claimedApp.application.name
      });
    }

    const secretCandidates = buildSecretCandidates({
      queryApp,
      claimedApp,
      platformSecret,
      platformPublicKey: getPublicKey(),
      isApplicationToken,
    });

    let payload = null;
    let matchedCandidate = null;
    let lastError = null;
    let expiredError = null;
    for (const candidate of secretCandidates) {
      try {
        payload = jwt.verify(token, candidate.key, { algorithms: candidate.algorithms });
        matchedCandidate = candidate;
        break;
      } catch (error) {
        if (error.name === 'TokenExpiredError') expiredError = error;
        lastError = error;
      }
    }
    if (!matchedCandidate) throw expiredError || lastError || new Error('invalid token');

    // 用应用密钥验过的用户令牌即 SSO 认证（平台签发/平台会话/应用 Token 都不算）。
    // 这条路径已弃用（保留 2 个版本）：通过响应头暴露给接入方/运维，便于观测存量并排期迁移。
    const isSsoAuth = matchedCandidate.source === 'app';
    if (isSsoAuth) {
      // 注意：HTTP 头只能是 ASCII（中文会让 Node 抛 Invalid character in header content）
      ctx.set('Deprecation', 'true');
      ctx.set(
        'Warning',
        '299 - "EADAF SSO: legacy flow (?app= + app-secret-signed user JWT) is deprecated; migrate to /oauth/authorize + PKCE (docs/sso-integration-guide.md section 13)"',
      );
      ctx.set('Link', '<https://github.com/adisonshadow/EADAF/blob/main/docs/sso-integration-guide.md>; rel="deprecation"');
      noteLegacyUsage(ctx);
    }

    // 应用令牌（type=application）：外部系统通过 app_secret 换取的 JWT，用于调用内置 API。
    // 校验应用启用 API 且状态为 ACTIVE，设置 ctx.state.application（不设 user），
    // 后续由 requireBuiltinApiPermission 中间件按 builtin_api_scope 鉴权。
    if (payload && payload.type === 'application' && payload.application_id) {
      const application = await Application.findOne({
        where: { application_id: payload.application_id, status: 'ACTIVE' },
      });
      if (!application || !application.api_enabled) {
        logger.warn('应用令牌认证失败：应用不存在、已停用或未启用 API', {
          method: ctx.method,
          url: ctx.url,
          application_id: payload.application_id,
        });
        ctx.status = 401;
        ctx.body = { code: 401, message: '无效的应用令牌', error_code: 'TOKEN_INVALID', data: null };
        return;
      }
      ctx.state.application = application;
      ctx.state.isApplicationToken = true;
      ctx.state.isSsoAuth = false;
      logger.debug('应用令牌认证成功', {
        method: ctx.method,
        url: ctx.url,
        application_id: application.application_id,
        application_code: application.code,
      });
      await next();
      return;
    }

    // 用户令牌：确保 payload 包含必要的用户信息。
    // Phase 2 的平台签发令牌用 OIDC 的 `sub`，这里统一映射成 `user_id` 供下游使用。
    if (payload && !payload.user_id && payload.sub) {
      payload.user_id = payload.sub;
    }

    if (!payload || !payload.user_id) {
      logger.warn('认证失败：令牌载荷无效', {
        method: ctx.method,
        url: ctx.url,
        ip: ctx.ip,
        payload: payload ? Object.keys(payload) : null
      });
      
      ctx.status = 401;
      ctx.body = {
        code: 401,
        message: '无效的令牌',
        error_code: 'TOKEN_INVALID',
        data: null
      };
      return;
    }

    // 检查令牌是否过期
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      logger.warn('认证失败：令牌已过期', {
        method: ctx.method,
        url: ctx.url,
        ip: ctx.ip,
        user_id: payload.user_id,
        exp: payload.exp
      });
      
      ctx.status = 401;
      ctx.body = {
        code: 401,
        message: '认证令牌已过期',
        error_code: 'TOKEN_EXPIRED',
        data: null
      };
      return;
    }

    // 会话撤销校验：登出/重放撤销会话后，access token 即使没过期也立即失效。
    // Redis 不可用时 fail-open（isSessionRevoked 返回 false），退化为"等 access 过期"。
    if (payload.sid && await ssoSession.isSessionRevoked(payload.sid)) {
      logger.warn('认证失败：会话已撤销', {
        method: ctx.method,
        url: ctx.url,
        user_id: payload.user_id,
        sid: payload.sid,
      });
      ctx.status = 401;
      ctx.body = {
        code: 401,
        message: '会话已退出，请重新登录',
        error_code: 'SESSION_REVOKED',
        data: null
      };
      return;
    }

    // 将用户信息存储到 ctx.state 中
    ctx.state.user = payload;
    ctx.state.isSsoAuth = isSsoAuth;
    // 本次请求按哪个应用验的签：刷新令牌要用它保持应用会话
    // （刷新令牌自身不带 application_id，避免超过 uac.refresh_tokens.token 的 255 上限）
    ctx.state.ssoApplicationId = matchedCandidate.application?.application_id || null;
    
    logger.debug('认证成功', {
      method: ctx.method,
      url: ctx.url,
      user_id: payload.user_id,
      username: payload.username,
      isSsoAuth: isSsoAuth
    });
    
    await next();
  } catch (error) {
    logger.error('令牌验证失败', {
      method: ctx.method,
      url: ctx.url,
      ip: ctx.ip,
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    let errorMessage = '无效的令牌';
    
    if (error.name === 'TokenExpiredError') {
      errorMessage = '认证令牌已过期';
    } else if (error.name === 'JsonWebTokenError') {
      error.message = '认证令牌格式错误';
    } else if (error.name === 'NotBeforeError') {
      errorMessage = '认证令牌尚未生效';
    }
    
    ctx.status = 401;
    ctx.body = {
      code: 401,
      message: errorMessage,
      // 机器可读：客户端据此区分「该刷新还是该重新登录」
      error_code: error.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
      data: null
    };
  }
};

// 供自检脚本使用（不改中间件行为）
module.exports.buildSecretCandidates = buildSecretCandidates;
module.exports.findSsoSigningApp = findSsoSigningApp;
