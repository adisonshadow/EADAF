/**
 * SSO redirect_uri：
 * - 支持「跟随本系统域名/IP」：redirect_uri_use_system_host=true 时，redirect_uri 存后缀，
 *   如 `:13303/auth/callback` 或 `/callback`，登录/跳转时按请求 Host 拼出完整 URL。
 * - 支持「DEV 专用重定向」：redirect_uri_dev_enabled=true 且平台跑在开发模式（NODE_ENV=development）时，
 *   改用 redirect_uri_dev（及其跟随开关）。开发机与部署环境的回调地址常常不同（尤其端口），
 *   两套都存下来，登录跳转时按当前模式自动选，省得每次来回改配置。
 */

/** 两套重定向配置的字段名 */
const REDIRECT_URI_FIELDS = {
  /** 部署环境（默认） */
  normal: { uri: 'redirect_uri', useSystemHost: 'redirect_uri_use_system_host' },
  /** 开发模式 */
  dev: { uri: 'redirect_uri_dev', useSystemHost: 'redirect_uri_dev_use_system_host' },
};

/**
 * 平台是否跑在开发模式。
 * 与 config/index.js 一致：未设置 NODE_ENV 时按 development 处理；
 * 只有明确的 development（npm run dev / pm2dev）才算，production 及其它环境一律用默认重定向。
 * @param {string} [env]
 * @returns {boolean}
 */
function isPlatformDevMode(env = process.env.NODE_ENV) {
  return String(env || 'development').trim().toLowerCase() === 'development';
}

/**
 * 本次登录是否该走 DEV 专用重定向：应用启用了 + 平台在开发模式 + 确实配了地址。
 * @param {{ redirect_uri_dev_enabled?: boolean, redirect_uri_dev?: string } | null | undefined} ssoConfig
 * @param {{ isDevMode?: boolean }} [options]
 * @returns {boolean}
 */
function shouldUseDevRedirectUri(ssoConfig, options = {}) {
  const isDevMode = options.isDevMode === undefined ? isPlatformDevMode() : !!options.isDevMode;
  if (!isDevMode) return false;
  if (!ssoConfig || !ssoConfig.redirect_uri_dev_enabled) return false;
  return !!String(ssoConfig.redirect_uri_dev || '').trim();
}

/**
 * @param {string} uri
 * @returns {boolean}
 */
function isValidSystemHostRedirectSuffix(uri) {
  if (!uri || typeof uri !== 'string') return false;
  const s = uri.trim();
  if (!s || /^https?:\/\//i.test(s)) return false;
  if (s.startsWith(':')) {
    return /^:\d{1,5}(\/[^\s]*)?$/.test(s);
  }
  if (s.startsWith('/')) {
    return !s.includes('://');
  }
  return false;
}

/**
 * @param {string} uri
 * @returns {boolean}
 */
function isAbsoluteHttpUrl(uri) {
  try {
    const u = new URL(uri);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 校验单条 redirect_uri 配置（按是否跟随本机 Host）
 * @param {string} uri
 * @param {boolean} useSystem
 * @param {{ requiredMessage?: string, formatMessage?: string, useSystemHostMessage?: string }} messages
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
function validateSingleRedirectUri(uri, useSystem, messages = {}) {
  const {
    requiredMessage = 'SSO回调地址不能为空',
    formatMessage = 'SSO回调地址格式不正确',
    useSystemHostMessage = '已启用「自动跟随本系统域名/IP」时，请填写端口路径（如 :13303/auth/callback）或本机路径（如 /auth/callback），不要填写完整域名',
  } = messages;

  if (!uri || typeof uri !== 'string' || !uri.trim()) {
    return { ok: false, message: requiredMessage };
  }
  if (useSystem) {
    if (!isValidSystemHostRedirectSuffix(uri.trim())) {
      return { ok: false, message: useSystemHostMessage };
    }
    return { ok: true };
  }
  if (!isAbsoluteHttpUrl(uri.trim())) {
    return { ok: false, message: formatMessage };
  }
  return { ok: true };
}

/**
 * 创建/更新时校验 redirect_uri（按是否跟随本机 Host）。
 * 启用了 DEV 专用重定向时，DEV 地址一并校验；没启用则不校验（允许留空/旧值）。
 * @param {{ redirect_uri?: string, redirect_uri_use_system_host?: boolean,
 *   redirect_uri_dev_enabled?: boolean, redirect_uri_dev?: string,
 *   redirect_uri_dev_use_system_host?: boolean }} ssoConfig
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
function validateSsoRedirectUriConfig(ssoConfig) {
  const normalCheck = validateSingleRedirectUri(
    ssoConfig?.redirect_uri,
    !!ssoConfig?.redirect_uri_use_system_host,
  );
  if (!normalCheck.ok) return normalCheck;

  if (!ssoConfig?.redirect_uri_dev_enabled) return { ok: true };

  return validateSingleRedirectUri(
    ssoConfig?.redirect_uri_dev,
    !!ssoConfig?.redirect_uri_dev_use_system_host,
    {
      requiredMessage: '已启用「DEV 专用重定向」，请填写 DEV 专用重定向 URI',
      formatMessage: 'DEV 专用重定向 URI 格式不正确',
      useSystemHostMessage:
        'DEV 行勾选了「自动跟随本系统域名/IP」时，请填写端口路径（如 :13303/auth/callback）或本机路径（如 /auth/callback），不要填写完整域名',
    },
  );
}

/**
 * 把一条重定向配置拼成完整地址
 * @param {string} uri
 * @param {boolean} useSystemHost
 * @param {{ protocol?: string, host?: string }} req
 * @returns {string}
 */
function resolveSingleRedirectUri(uri, useSystemHost, req = {}) {
  const value = String(uri || '').trim();
  if (!useSystemHost || !value) {
    return value;
  }
  const host = String(req.host || '').trim() || 'localhost';
  const hostname = host.split(':')[0] || 'localhost';
  const proto = req.protocol === 'https' ? 'https' : 'http';

  if (value.startsWith(':')) {
    return `${proto}://${hostname}${value}`;
  }
  if (value.startsWith('/')) {
    return `${proto}://${host}${value}`;
  }
  return `${proto}://${hostname}/${value.replace(/^\//, '')}`;
}

/**
 * 取本次登录实际要用的完整回调地址：
 * 平台在开发模式且应用启用了 DEV 重定向时用 DEV 那套，否则用默认那套。
 * @param {{ redirect_uri?: string, redirect_uri_use_system_host?: boolean,
 *   redirect_uri_dev_enabled?: boolean, redirect_uri_dev?: string,
 *   redirect_uri_dev_use_system_host?: boolean } | null | undefined} ssoConfig
 * @param {{ protocol?: string, host?: string }} req
 * @param {{ isDevMode?: boolean }} [options]
 * @returns {string}
 */
function resolveSsoRedirectUri(ssoConfig, req = {}, options = {}) {
  const fields = shouldUseDevRedirectUri(ssoConfig, options)
    ? REDIRECT_URI_FIELDS.dev
    : REDIRECT_URI_FIELDS.normal;

  return resolveSingleRedirectUri(
    ssoConfig?.[fields.uri],
    !!ssoConfig?.[fields.useSystemHost],
    req,
  );
}

/**
 * 从 Koa ctx 取协议与 Host（信任代理时用 ctx.request）
 * @param {import('koa').Context} ctx
 */
function requestHostInfo(ctx) {
  return {
    protocol: ctx.request.protocol,
    host: ctx.request.host,
  };
}

/**
 * 登出后回跳目标是否允许：必须与应用的**回调地址**或**前端地址**同源。
 *
 * 单点登出是"浏览器直接跳走"的流程，不校验就是开放重定向。这里按 origin 比对
 * （应用的登录页路径与 BFF 回调路径通常不同，只比 origin）；两套回调地址
 * （默认 + DEV）都参与比对，避免平台运行模式与应用部署模式不一致时误拒。
 *
 * @param {object|null|undefined} ssoConfig 应用的 sso_config
 * @param {string} candidate 应用请求的 post_logout_redirect_uri
 * @param {{ protocol?: string, host?: string }} req
 * @returns {boolean}
 */
function isAllowedPostLogoutRedirect(ssoConfig, candidate, req = {}) {
  if (!candidate || typeof candidate !== 'string') return false;

  let target;
  try {
    target = new URL(candidate.trim());
  } catch {
    return false;
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return false;

  const origins = new Set();
  const addOrigin = (uri) => {
    if (!uri || typeof uri !== 'string') return;
    try {
      origins.add(new URL(uri).origin);
    } catch {
      // 跟随 Host 的后缀地址在 req 缺失时拼不出来，忽略即可
    }
  };

  addOrigin(resolveSsoRedirectUri(ssoConfig, req, { isDevMode: false }));
  addOrigin(resolveSsoRedirectUri(ssoConfig, req, { isDevMode: true }));
  addOrigin(ssoConfig?.frontend_url);

  return origins.has(target.origin);
}

module.exports = {
  isValidSystemHostRedirectSuffix,
  isAbsoluteHttpUrl,
  isPlatformDevMode,
  shouldUseDevRedirectUri,
  validateSsoRedirectUriConfig,
  resolveSsoRedirectUri,
  isAllowedPostLogoutRedirect,
  requestHostInfo,
};
