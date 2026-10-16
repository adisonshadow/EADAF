/**
 * Phase 2：授权码 + PKCE 与**平台签发**的用户令牌。
 *
 * 与老流程（`/auth/login?app=` 直接用应用密钥签用户 JWT）的区别：
 * - 令牌由平台私钥（RS256）签发，`iss`/`aud`/`azp`/`sid`/`scope` 齐全，应用侧用 JWKS 验签，
 *   不需要把应用密钥当令牌签名密钥分发；
 * - 令牌不再经过浏览器地址栏：浏览器只拿到一次性 `code`，`code` 由 BFF 换成令牌；
 * - 授权码一次性、短时效（120s）存 Redis，`GETDEL` 保证原子消费；Redis 不可用时**拒绝发码**
 *   （宁可不发，也不能发出无法保证一次性/过期的码）。
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const { withRedis } = require('../../utils/redisOps');
const { getPrivateKey, getKeyId } = require('../../utils/ssoKeys');
const { parseDurationToSeconds } = require('../../utils/ssoSession');

const CODE_PREFIX = 'sso:code:';
/** 授权码有效期：RFC 6749 建议 ≤10 分钟，这里取更短的 120s */
const CODE_TTL_SECONDS = 120;

function createCode() {
  return crypto.randomBytes(32).toString('base64url');
}

function base64UrlSha256(text) {
  return crypto.createHash('sha256').update(text).digest('base64url');
}

/**
 * PKCE 校验（RFC 7636）
 * @param {{ codeChallenge?: string, method?: string, verifier?: string }} input
 * @returns {boolean}
 */
function verifyPkce({ codeChallenge, method, verifier }) {
  if (!codeChallenge) return true; // 未使用 PKCE 的客户端（机密客户端可省）
  if (!verifier) return false;
  const normalized = String(method || 'plain').toUpperCase();
  if (normalized === 'S256') return base64UrlSha256(verifier) === codeChallenge;
  if (normalized === 'PLAIN') return verifier === codeChallenge;
  return false;
}

/**
 * 存授权码
 * @returns {Promise<string|null>} null = Redis 不可用（调用方应返回 503，而不是发一个存不下的码）
 */
async function saveAuthorizationCode(payload) {
  const code = createCode();
  const stored = await withRedis('saveAuthorizationCode', (client) => client.set(
    CODE_PREFIX + code,
    JSON.stringify(payload),
    { EX: CODE_TTL_SECONDS },
  ));
  return stored === 'OK' ? code : null;
}

/** 原子消费授权码（一次性） */
async function consumeAuthorizationCode(code) {
  if (!code) return null;
  const raw = await withRedis('consumeAuthorizationCode', (client) => client.getDel(CODE_PREFIX + code));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function accessTokenTtlSeconds() {
  return parseDurationToSeconds(config.api?.sso?.accessTokenTtl, 900);
}

/**
 * 平台签发的用户访问令牌（RS256）
 * @param {{ userId: string, username?: string, sid?: string|null, applicationId?: string|null, scope?: string|null, issuer: string }} input
 */
function signUserAccessToken({ userId, username, sid, applicationId, scope, issuer }) {
  return jwt.sign(
    {
      sub: userId,
      ...(username ? { username } : {}),
      ...(sid ? { sid } : {}),
      ...(applicationId ? { azp: applicationId } : {}),
      ...(scope ? { scope } : {}),
      jti: crypto.randomUUID(),
    },
    getPrivateKey(),
    {
      algorithm: 'RS256',
      keyid: getKeyId(),
      expiresIn: accessTokenTtlSeconds(),
      issuer,
      audience: applicationId || 'eadaf-console',
    },
  );
}

/**
 * ID Token（Phase 3 的 RP-Initiated Logout 会用它做 `id_token_hint`）
 */
function signIdToken({ userId, sid, applicationId, issuer, nonce, authTime }) {
  return jwt.sign(
    {
      sub: userId,
      ...(sid ? { sid } : {}),
      ...(nonce ? { nonce } : {}),
      auth_time: authTime || Math.floor(Date.now() / 1000),
    },
    getPrivateKey(),
    {
      algorithm: 'RS256',
      keyid: getKeyId(),
      expiresIn: accessTokenTtlSeconds(),
      issuer,
      audience: applicationId || 'eadaf-console',
    },
  );
}

/**
 * Back-Channel Logout Token（OIDC Back-Channel Logout 1.0）
 *
 * 平台在撤销会话时主动 POST 给应用 BFF，应用据此立刻清掉自己的会话，
 * 不必等下一次请求才发现失效。`events` 声明是协议要求；`sid`/`sub` 让应用对号入座。
 */
function signLogoutToken({ userId, sid, applicationId, issuer }) {
  return jwt.sign(
    {
      sub: userId,
      sid,
      jti: crypto.randomUUID(),
      events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
    },
    getPrivateKey(),
    {
      algorithm: 'RS256',
      keyid: getKeyId(),
      expiresIn: 120,
      issuer,
      audience: applicationId,
    },
  );
}

/** OIDC 发现文档（够用即可：只声明本平台真正实现的部分） */
function buildDiscoveryDocument(issuer) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/api/v1/oauth/token`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    end_session_endpoint: `${issuer}/api/v1/auth/end-session`,
    backchannel_logout_supported: true,
    backchannel_logout_session_supported: true,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256', 'plain'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    scopes_supported: ['openid', 'profile'],
  };
}

module.exports = {
  CODE_TTL_SECONDS,
  accessTokenTtlSeconds,
  verifyPkce,
  saveAuthorizationCode,
  consumeAuthorizationCode,
  signUserAccessToken,
  signIdToken,
  signLogoutToken,
  buildDiscoveryDocument,
  base64UrlSha256,
};
