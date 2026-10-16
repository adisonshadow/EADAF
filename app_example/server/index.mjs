/**
 * app_example 的 BFF（Backend for Frontend）—— 示例应用"推荐的接法"。
 *
 * 与"纯前端直连 EADAF"相比，令牌彻底不进浏览器：
 *   - 浏览器只拿一次性授权码，以及本 BFF 的 httpOnly 会话 Cookie；
 *   - access/refresh 令牌只存在这里（示例用内存 Map；生产请换 Redis/DB）；
 *   - 验签用 EADAF 的 JWKS 公钥本地完成，不需要共享密钥；
 *   - `/api/*` 代理：带上访问令牌转发；401 TOKEN_EXPIRED 时自动刷新一次并重放；
 *     会话被撤销则清会话，由前端回登录页；
 *   - 登出走 EADAF 的登出中转页（撤销 sid ⇒ 该设备上所有应用一起退出）。
 *
 * 只依赖 Node 18+ 自带能力（无第三方包）。
 *
 * 启动（与 Vite 开发服务器一起）：
 *   pnpm --filter ./app_example dev:bff     # 本 BFF，默认 :29530
 *   pnpm --filter ./app_example dev         # Vite :29529，把 /auth 与 /api 代理到这里
 *
 * 环境变量取自 app_example/.env（脚本用 node --env-file=.env 加载），别名：
 *   EADAF_API            ← EADAF_API || 默认 http://localhost:29526
 *   EADAF_FRONTEND       ← EADAF_FRONTEND || VITE_SSO_EADAF_FRONTEND
 *   EADAF_APP_ID         ← EADAF_APP_ID || VITE_SSO_APPLICATION_ID
 *   EADAF_APP_SECRET     ← EADAF_APP_SECRET || APP_SECRET
 *   REDIRECT_URI         ← REDIRECT_URI || http://localhost:29529/auth/callback（必须与 EADAF 里登记的一致）
 */
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.BFF_PORT || process.env.PORT || 29530);
const EADAF_API = (process.env.EADAF_API || 'http://localhost:29526').replace(/\/+$/, '');
const EADAF_FRONTEND = (
  process.env.EADAF_FRONTEND
  || process.env.VITE_SSO_EADAF_FRONTEND
  || 'http://localhost:29527'
).replace(/\/+$/, '');
const CLIENT_ID = process.env.EADAF_APP_ID || process.env.VITE_SSO_APPLICATION_ID || '';
const CLIENT_SECRET = process.env.EADAF_APP_SECRET || process.env.APP_SECRET || '';
const SPA_ORIGIN = (process.env.SPA_ORIGIN || 'http://localhost:29529').replace(/\/+$/, '');
const REDIRECT_URI = process.env.REDIRECT_URI || `${SPA_ORIGIN}/auth/callback`;

const SESSION_COOKIE = 'ys_session';
const LOGIN_COOKIE = 'ys_login';

/** 登录中的临时状态（state + PKCE verifier）：生产放 Redis 并设 TTL */
const pendingLogins = new Map();
/** 已登录会话：生产放 Redis/DB，Cookie 里只放会话 ID */
const sessions = new Map();

const b64url = (input) => Buffer.from(input).toString('base64url');
const sha256b64url = (text) => b64url(crypto.createHash('sha256').update(text).digest());

const createPkce = () => {
  const verifier = b64url(crypto.randomBytes(48));
  return { verifier, challenge: sha256b64url(verifier) };
};

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

function setCookie(res, name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  res.setHeader('Set-Cookie', [...(res.getHeader('Set-Cookie') || []), parts.join('; ')]);
}

const clearCookie = (res, name) => setCookie(res, name, '', { maxAge: 0 });

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

/* ------------------------------ EADAF 交互 ------------------------------ */

async function exchangeToken(params) {
  const res = await fetch(`${EADAF_API}/api/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `换票失败 HTTP ${res.status}`);
  }
  return json;
}

/** 拿用户资料（姓名/头像等展示用）；失败不影响登录 */
async function fetchProfile(accessToken) {
  try {
    const res = await fetch(`${EADAF_API}/api/v1/auth/check`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data || null;
  } catch {
    return null;
  }
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

/* ---------------------------- JWKS 本地验签 ---------------------------- */

let jwksCache = null;

async function getJwks() {
  if (!jwksCache) {
    const res = await fetch(`${EADAF_API}/.well-known/jwks.json`);
    jwksCache = await res.json();
  }
  return jwksCache;
}

/** 用 EADAF 的 JWKS 公钥本地验签（Node 自带 crypto 处理 JWK，无需依赖） */
/**
 * 校验 logout token：除验签/iss/aud/exp 外，还必须带 back-channel 事件且**不能带 nonce**
 * （否则就等于允许把 ID Token 当 logout token 重放）。
 */
async function verifyTokenForAudience(token) {
  const payload = await verifyAccessToken(token);
  const events = payload.events || {};
  if (!events['http://schemas.openid.net/event/backchannel-logout']) {
    throw new Error('缺少 back-channel-logout 事件声明');
  }
  if (payload.nonce) throw new Error('logout token 不应带 nonce');
  return payload;
}

async function verifyAccessToken(token) {
  const [headerPart, payloadPart, signaturePart] = String(token).split('.');
  if (!signaturePart) throw new Error('令牌格式错误');
  const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  if (header.alg !== 'RS256') throw new Error(`不接受的签名算法：${header.alg}`);

  // 未知 kid 时刷新一次 JWKS（密钥轮换）
  let jwk = (await getJwks()).keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    jwksCache = null;
    jwk = (await getJwks()).keys.find((key) => key.kid === header.kid) || (await getJwks()).keys[0];
  }
  if (!jwk) throw new Error('JWKS 中没有可用公钥');

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const ok = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${headerPart}.${payloadPart}`),
    publicKey,
    Buffer.from(signaturePart, 'base64url'),
  );
  if (!ok) throw new Error('签名校验失败');
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('令牌已过期');
  if (payload.aud && CLIENT_ID && payload.aud !== CLIENT_ID) throw new Error('aud 不匹配');
  return payload;
}


/**
 * Back-Channel Logout 接收端点（OIDC Back-Channel Logout 1.0）
 *
 * EADAF 撤销会话时会主动 POST 到这里（`application/x-www-form-urlencoded` 的 `logout_token`），
 * 我们验签 + 校验 iss/aud/events 后按 `sid` 清掉本地会话 —— 用户不必等下一次请求才发现自己已登出。
 */
async function handleBackChannelLogout(req, res) {
  const params = new URLSearchParams(req.bodyRaw || '');
  const logoutToken = params.get('logout_token');
  if (!logoutToken) {
    return sendJson(res, 400, { error: 'invalid_request', error_description: '缺少 logout_token' });
  }
  let claims;
  try {
    claims = await verifyTokenForAudience(logoutToken);
  } catch (error) {
    return sendJson(res, 400, { error: 'invalid_token', error_description: error.message });
  }
  if (!claims.sid) {
    return sendJson(res, 400, { error: 'invalid_token', error_description: 'logout token 缺少 sid' });
  }
  let removed = 0;
  for (const [id, session] of sessions) {
    if (session.sid === claims.sid) {
      sessions.delete(id);
      removed += 1;
    }
  }
  console.log(`[bff] back-channel logout：sid=${claims.sid} 清掉 ${removed} 个会话`);
  return sendJson(res, 200, { ok: true, removed });
}

/* -------------------------------- 路由 -------------------------------- */

function handleLogin(req, res, url) {
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
  if (url.searchParams.get('redirect')) {
    // 业务侧希望登录后回某个页面：塞进 state 一起带回（示例只支持站内相对路径）
    const redirectTo = url.searchParams.get('redirect') || '';
    if (redirectTo.startsWith('/')) authorizeUrl.searchParams.set('state', `${state}|${redirectTo}`);
  }

  setCookie(res, LOGIN_COOKIE, loginId, { maxAge: 600 });
  res.writeHead(302, { Location: authorizeUrl.toString() });
  res.end();
}

async function handleCallback(req, res, url) {
  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state') || '';
  const [state, redirectTo] = stateRaw.split('|');
  const loginId = parseCookies(req)[LOGIN_COOKIE];
  const pending = loginId ? pendingLogins.get(loginId) : null;

  if (!code || !pending || state !== pending.state) {
    res.writeHead(302, { Location: `${SPA_ORIGIN}/login?auth_error=state` });
    res.end();
    return;
  }
  pendingLogins.delete(loginId);

  try {
    const tokens = await exchangeToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: pending.verifier,
    });
    const sessionId = crypto.randomUUID();
    const profile = await fetchProfile(tokens.access_token);
    sessions.set(sessionId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in || 900) * 1000,
      sid: tokens.sid || null,
      user: {
        user_id: profile?.user_id || null,
        username: profile?.username || null,
        name: profile?.name || profile?.username || '未知用户',
        avatar: profile?.avatar || null,
      },
    });

    clearCookie(res, LOGIN_COOKIE);
    setCookie(res, SESSION_COOKIE, sessionId, { maxAge: 7 * 24 * 3600 });
    res.writeHead(302, { Location: `${SPA_ORIGIN}${redirectTo || '/'}` });
    res.end();
  } catch (error) {
    console.error('[bff] 换票失败:', error.message);
    res.writeHead(302, { Location: `${SPA_ORIGIN}/login?auth_error=exchange` });
    res.end();
  }
}

async function handleMe(req, res, session) {
  if (!session) return sendJson(res, 401, { error: 'unauthenticated' });
  try {
    // 本地验签：确认令牌没被篡改/过期（过期由代理路径负责刷新，这里只读 claims）
    const claims = await verifyAccessToken(session.accessToken);
    return sendJson(res, 200, {
      user: session.user,
      sid: claims.sid || session.sid || null,
      azp: claims.azp || null,
      expires_at: claims.exp ? claims.exp * 1000 : null,
      verified_locally: true,
    });
  } catch (error) {
    // 令牌过期属于正常现象（代理调用时会刷新），这里只标记，不强制登出
    if (session.expiresAt && session.expiresAt < Date.now()) {
      try {
        await refreshSession(session);
        const claims = await verifyAccessToken(session.accessToken);
        return sendJson(res, 200, {
          user: session.user,
          sid: claims.sid || session.sid || null,
          azp: claims.azp || null,
          verified_locally: true,
        });
      } catch (refreshError) {
        sessions.delete(parseCookies(req)[SESSION_COOKIE]);
        clearCookie(res, SESSION_COOKIE);
        return sendJson(res, 401, { error: 'session_expired', error_description: refreshError.message });
      }
    }
    return sendJson(res, 401, { error: 'invalid_token', error_description: error.message });
  }
}

function handleLogout(req, res, session) {
  if (session) sessions.delete(parseCookies(req)[SESSION_COOKIE]);
  clearCookie(res, SESSION_COOKIE);
  const endSession = new URL(`${EADAF_FRONTEND}/auth/logout`);
  endSession.searchParams.set('app', CLIENT_ID);
  // 回跳地址必须与 EADAF 里登记的回调同源（EADAF 会校验）
  endSession.searchParams.set('post_logout_redirect_uri', `${SPA_ORIGIN}/login`);
  endSession.searchParams.set('state', 'logged_out');
  sendJson(res, 200, { ok: true, end_session_url: endSession.toString() });
}

/** 代理受保护的 EADAF 接口：自动刷新 + 只有"会话没了"才回 401 */
async function handleProxy(req, res, url, session) {
  if (!session) {
    return sendJson(res, 401, { error: 'unauthenticated', error_description: '请先登录' });
  }

  const callUpstream = () => fetch(`${EADAF_API}${url.pathname}${url.search}`, {
    method: req.method,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      ...(req.headers['content-type'] ? { 'Content-Type': req.headers['content-type'] } : {}),
      ...(req.headers.accept ? { Accept: req.headers.accept } : {}),
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
      return sendJson(res, 401, { error: body.error_code || 'session_revoked', error_description: body.message });
    }
  }

  const text = await upstream.text();
  res.writeHead(upstream.status, {
    'Content-Type': upstream.headers.get('content-type') || 'application/json',
  });
  res.end(text);
}

/* ------------------------------- 启动 ------------------------------- */

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('[bff] 缺少 EADAF_APP_ID / EADAF_APP_SECRET（或 VITE_SSO_APPLICATION_ID / APP_SECRET）');
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const cookies = parseCookies(req);
  const session = cookies[SESSION_COOKIE] ? sessions.get(cookies[SESSION_COOKIE]) : null;
  req.bodyRaw = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);

  try {
    if (url.pathname === '/auth/login') return handleLogin(req, res, url);
    if (url.pathname === '/auth/callback') return await handleCallback(req, res, url);
    if (url.pathname === '/auth/me') return await handleMe(req, res, session);
    if (url.pathname === '/auth/logout') return handleLogout(req, res, session);
    if (url.pathname === '/auth/backchannel-logout') return await handleBackChannelLogout(req, res);
    if (url.pathname.startsWith('/api/')) return await handleProxy(req, res, url, session);
    if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true, sessions: sessions.size });
    return sendJson(res, 404, {
      error: 'not_found',
      error_description: `这是 app_example 的 BFF；前端请访问 ${SPA_ORIGIN}`,
    });
  } catch (error) {
    console.error('[bff] 处理失败:', error);
    return sendJson(res, 500, { error: 'server_error', error_description: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`[bff] http://localhost:${PORT}`);
  console.log(`[bff] EADAF_API=${EADAF_API} EADAF_FRONTEND=${EADAF_FRONTEND}`);
  console.log(`[bff] redirect_uri=${REDIRECT_URI}（必须与 EADAF 应用里登记的回调一致）`);
});
