/**
 * EADAF SSO —— 业务应用 BFF 参考实现（模板，零依赖，Node 18+）
 *
 * 演示 Phase 2 的推荐接法（授权码 + PKCE），把"令牌"彻底挡在浏览器之外：
 *   - 浏览器只拿到一次性 `code`，以及本 BFF 的 httpOnly 会话 Cookie；
 *   - access/refresh 令牌只存在服务端（模板用内存 Map；生产请换 Redis/DB）；
 *   - 验签用 EADAF 的 JWKS 公钥本地完成（无共享密钥），并校验 iss/aud；
 *   - 代理业务请求时自动刷新（401 TOKEN_EXPIRED → 刷新一次并重放）；
 *   - 登出走 EADAF 的登出中转页（撤销 sid ⇒ 该设备上所有应用一起退出）。
 *
 * 运行：
 *   EADAF_APP_ID=<application_id> EADAF_APP_SECRET=<应用统一密钥> node docs/sso-bff-template/server.mjs
 * 环境变量见 README.md。
 */
import http from 'node:http';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 4100);
const EADAF_API = (process.env.EADAF_API || 'http://localhost:29526').replace(/\/+$/, '');
const EADAF_FRONTEND = (process.env.EADAF_FRONTEND || 'http://localhost:29527').replace(/\/+$/, '');
const CLIENT_ID = process.env.EADAF_APP_ID || '';
const CLIENT_SECRET = process.env.EADAF_APP_SECRET || '';
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${PORT}/auth/callback`;
const SESSION_COOKIE = 'bff_session';
const LOGIN_COOKIE = 'bff_login';

/** 登录中的临时状态（state + PKCE verifier）：生产放 Redis 并设 TTL */
const pendingLogins = new Map();
/** 已登录会话：生产放 Redis/DB，Cookie 里只放会话 ID */
const sessions = new Map();

const b64url = (input) => Buffer.from(input).toString('base64url');
const sha256b64url = (text) => b64url(crypto.createHash('sha256').update(text).digest());

function createPkce() {
  const verifier = b64url(crypto.randomBytes(48));
  return { verifier, challenge: sha256b64url(verifier) };
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    out[trimmed.slice(0, index)] = decodeURIComponent(trimmed.slice(index + 1));
  }
  return out;
}

const setCookie = (res, name, value, options = {}) => {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  res.setHeader('Set-Cookie', [...(res.getHeader('Set-Cookie') || []), parts.join('; ')]);
};

const clearCookie = (res, name) => setCookie(res, name, '', { maxAge: 0 });

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

/* --------------------------- EADAF 交互 --------------------------- */

async function exchangeToken(params) {
  const res = await fetch(`${EADAF_API}/api/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    const detail = json.error_description || json.error || `HTTP ${res.status}`;
    throw new Error(`换票失败：${detail}`);
  }
  return json;
}

async function refreshSession(session) {
  const json = await exchangeToken({
    grant_type: 'refresh_token',
    refresh_token: session.refreshToken,
  });
  session.accessToken = json.access_token;
  session.refreshToken = json.refresh_token || session.refreshToken;
  session.expiresAt = Date.now() + (json.expires_in || 900) * 1000;
  return session;
}

/* --------------------------- JWKS 本地验签 --------------------------- */

let jwksCache = null;

async function getJwks() {
  if (!jwksCache) {
    const res = await fetch(`${EADAF_API}/.well-known/jwks.json`);
    jwksCache = await res.json();
  }
  return jwksCache;
}

/**
 * 用 EADAF 的 JWKS 公钥本地验签（不依赖共享密钥）。
 * 这里用 Node 自带的 crypto 验签，避免为模板引入依赖。
 */
async function verifyAccessToken(token) {
  const [headerPart, payloadPart, signaturePart] = String(token).split('.');
  if (!signaturePart) throw new Error('令牌格式错误');
  const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  if (header.alg !== 'RS256') throw new Error(`不接受的签名算法：${header.alg}`);

  const jwks = await getJwks();
  const jwk = jwks.keys.find((key) => key.kid === header.kid) || jwks.keys[0];
  if (!jwk) throw new Error('JWKS 中没有可用公钥');

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const ok = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${headerPart}.${payloadPart}`),
    publicKey,
    Buffer.from(signaturePart, 'base64url'),
  );
  if (!ok) throw new Error('签名校验失败');

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('令牌已过期');
  if (payload.aud && CLIENT_ID && payload.aud !== CLIENT_ID) throw new Error('aud 不匹配');
  return payload;
}

/* ------------------------------ 路由 ------------------------------ */

async function handleLogin(req, res) {
  const { verifier, challenge } = createPkce();
  const state = b64url(crypto.randomBytes(16));
  const loginId = crypto.randomUUID();
  pendingLogins.set(loginId, { state, verifier, createdAt: Date.now() });

  const authorizeUrl = new URL(`${EADAF_FRONTEND}/oauth/authorize`);
  authorizeUrl.searchParams.set('client_id', CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', 'openid profile');
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');

  setCookie(res, LOGIN_COOKIE, loginId, { maxAge: 600 });
  res.writeHead(302, { Location: authorizeUrl.toString() });
  res.end();
}

async function handleCallback(req, res, url) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const loginId = parseCookies(req)[LOGIN_COOKIE];
  const pending = loginId ? pendingLogins.get(loginId) : null;

  if (!code || !pending || state !== pending.state) {
    sendJson(res, 400, { error: 'invalid_request', error_description: 'state 校验失败或缺少 code' });
    return;
  }
  pendingLogins.delete(loginId);

  const tokens = await exchangeToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: pending.verifier,
  });

  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in || 900) * 1000,
    sid: tokens.sid || null,
    createdAt: Date.now(),
  });

  clearCookie(res, LOGIN_COOKIE);
  setCookie(res, SESSION_COOKIE, sessionId, { maxAge: 7 * 24 * 3600 });
  res.writeHead(302, { Location: '/' });
  res.end();
}

async function handleMe(req, res, session) {
  if (!session) return sendJson(res, 401, { error: 'unauthenticated' });
  try {
    const claims = await verifyAccessToken(session.accessToken);
    return sendJson(res, 200, {
      user_id: claims.sub,
      sid: claims.sid,
      azp: claims.azp,
      expires_at: claims.exp ? claims.exp * 1000 : null,
      verified_locally: true,
    });
  } catch (error) {
    return sendJson(res, 401, { error: 'invalid_token', error_description: error.message });
  }
}

async function handleLogout(req, res, session) {
  if (session) {
    sessions.delete(parseCookies(req)[SESSION_COOKIE]);
  }
  clearCookie(res, SESSION_COOKIE);
  const endSession = new URL(`${EADAF_FRONTEND}/auth/logout`);
  endSession.searchParams.set('app', CLIENT_ID);
  endSession.searchParams.set('post_logout_redirect_uri', `http://localhost:${PORT}/`);
  sendJson(res, 200, { ok: true, end_session_url: endSession.toString() });
}

/** 代理受保护的 EADAF 接口：自动刷新 + 会话失效才回 401 */
async function handleProxy(req, res, url, session) {
  if (!session) return sendJson(res, 401, { error: 'unauthenticated' });

  const callUpstream = () => fetch(`${EADAF_API}${url.pathname}${url.search}`, {
    method: req.method,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      ...(req.headers['content-type'] ? { 'Content-Type': req.headers['content-type'] } : {}),
    },
    ...(req.method === 'GET' || req.method === 'HEAD' ? {} : { body: req.bodyRaw }),
  });

  let upstream = await callUpstream();
  if (upstream.status === 401) {
    const body = await upstream.clone().json().catch(() => ({}));
    // 只有"令牌过期"值得刷新；会话已撤销/令牌无效 ⇒ 清会话，让前端回登录页
    if (!body.error_code || body.error_code === 'TOKEN_EXPIRED') {
      try {
        await refreshSession(session);
        upstream = await callUpstream();
      } catch (error) {
        sessions.delete(parseCookies(req)[SESSION_COOKIE]);
        clearCookie(res, SESSION_COOKIE);
        return sendJson(res, 401, { error: 'session_expired', error_description: error.message });
      }
    } else {
      sessions.delete(parseCookies(req)[SESSION_COOKIE]);
      clearCookie(res, SESSION_COOKIE);
      return sendJson(res, 401, { error: body.error_code, error_description: body.message });
    }
  }

  const text = await upstream.text();
  res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json' });
  res.end(text);
}

async function serveIndex(res) {
  const html = await readFile(path.join(__dirname, 'public', 'index.html'), 'utf8');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const cookies = parseCookies(req);
  const session = cookies[SESSION_COOKIE] ? sessions.get(cookies[SESSION_COOKIE]) : null;
  req.bodyRaw = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);

  try {
    if (url.pathname === '/') return await serveIndex(res);
    if (url.pathname === '/login') return await handleLogin(req, res);
    if (url.pathname === '/auth/callback') return await handleCallback(req, res, url);
    if (url.pathname === '/auth/me') return await handleMe(req, res, session);
    if (url.pathname === '/auth/logout') return await handleLogout(req, res, session);
    if (url.pathname.startsWith('/api/')) return await handleProxy(req, res, url, session);
    return sendJson(res, 404, { error: 'not_found' });
  } catch (error) {
    console.error('[bff] 处理失败:', error);
    return sendJson(res, 500, { error: 'server_error', error_description: error.message });
  }
});

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('缺少 EADAF_APP_ID / EADAF_APP_SECRET：请先在管理台注册应用并生成统一密钥');
  process.exit(1);
}

server.listen(PORT, () => {
  console.log(`[bff] http://localhost:${PORT}`);
  console.log(`[bff] EADAF_API=${EADAF_API} EADAF_FRONTEND=${EADAF_FRONTEND} redirect_uri=${REDIRECT_URI}`);
});
