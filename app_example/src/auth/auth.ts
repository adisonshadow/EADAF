const TOKEN_KEY = 'token';
const REFRESH_TOKEN_KEY = 'refresh_token';

export function saveAuth(token: string, refreshToken?: string) {
  localStorage.setItem(TOKEN_KEY, token);
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function isAuthenticated() {
  return Boolean(getToken());
}

/**
 * 向 EADAF 复核会话：只有明确的 401 才算「会话无效」。
 * 网络抖动 / 5xx 返回 unknown —— 调用方不得据此清登录态。
 *
 * EADAF 按 URL 里的 ?app=<application_id> 选验签密钥（SSO 用户 JWT 是应用密钥签的），
 * 所以复核也必须带上，否则会把「好 token」误判成无效。
 */
async function verifySession(): Promise<'valid' | 'invalid' | 'unknown'> {
  const token = getToken();
  if (!token) return 'invalid';
  try {
    const base = import.meta.env.VITE_API_BASE || '/api';
    const res = await fetch(withApp(`${base}/v1/auth/check`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) return 'valid';
    if (res.status === 401) {
      // 明确无效/过期：清掉本地登录态，别让坏 token 继续挂在请求头里
      clearAuth();
      return 'invalid';
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function checkAuth(): Promise<boolean> {
  return (await verifySession()) === 'valid';
}

/** 是否已经在登录/回调相关页面上（避免重复跳转、避免打断回调） */
function onAuthPage(): boolean {
  return window.location.pathname.startsWith('/auth/');
}

let verifying = false;

/** {@link handleUnauthorized} 的结论，供调用方决定提示文案 */
export type SessionState = 'valid' | 'invalid' | 'unknown';

/**
 * 令牌失效时的统一处置：**先复核会话**，确认无效才清登录态 → 跳 `/auth/login`。
 *
 * 不能一见到 401 就清：401 也可能来自某个接口本身（例如漏带 `?app=`、后端权限或
 * 应用未授权），那时会话还是好的 —— 直接清就会表现为「一发起后端交互就掉登录」。
 * 见 `docs/sso-integration-guide.md` §8.3。
 *
 * 幂等：并发请求同时 401 时只复核一次；确认无效后保持标记，避免重复跳转。
 *
 * @returns `invalid`：会话确已失效（已清并跳转）；`valid`：会话没问题，是接口自身的 401；
 *          `unknown`：网络/5xx 或已在认证页，未做处置
 */
export async function handleUnauthorized(): Promise<SessionState> {
  if (verifying || onAuthPage()) return 'unknown';
  verifying = true;

  const state = await verifySession();
  if (state === 'invalid') {
    clearAuth();
    window.location.replace('/auth/login');
    return 'invalid';
  }
  // valid：该接口的 401 与会话无关；unknown：网络/5xx，都不清登录态
  verifying = false;
  return state;
}

/** 拦截器安装标记（StrictMode 下 main.tsx 可能被执行两次） */
const INTERCEPTOR_FLAG = '__ysUnauthorizedInterceptorInstalled';

/**
 * 全局 401 拦截：给 `window.fetch` 包一层，任何请求拿到 401 都走
 * {@link handleUnauthorized}。
 *
 * 为什么放在这一层：本示例的数据请求（storeApi）和 AI 助手请求（`@eadaf/ai-base`
 * 的 client）走的是两套封装，逐个改容易漏；令牌过期恰恰最常先在 AI 助手面板暴露成
 * 一句「无效的令牌」。在 fetch 这一层收口，两套都覆盖到。
 * 只读 `res.status`，不消费响应体。
 */
export function installUnauthorizedInterceptor(): void {
  const w = window as unknown as Record<string, unknown>;
  if (w[INTERCEPTOR_FLAG]) return;
  w[INTERCEPTOR_FLAG] = true;

  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await original(input, init);
    // 只读 res.status，不消费响应体；是否真的掉登录由 handleUnauthorized 复核后决定
    if (res.status === 401) void handleUnauthorized();
    return res;
  };
}

/**
 * 给 EADAF 请求补上 ?app=<application_id>。
 * 带 SSO 应用密钥签发的用户 JWT 调 EADAF 时必须带它，否则验签用的是平台密钥。
 */
export function withApp(url: string): string {
  const appId = import.meta.env.VITE_SSO_APPLICATION_ID;
  if (!appId) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}app=${encodeURIComponent(appId)}`;
}

export function buildSsoLoginUrl(applicationId?: string) {
  const appId = applicationId || import.meta.env.VITE_SSO_APPLICATION_ID;
  const EADAFFrontend = import.meta.env.VITE_SSO_EADAF_FRONTEND || 'http://localhost:29527';
  return `${EADAFFrontend}/auth/login?app=${appId}`;
}

/**
 * 单点登出：把浏览器交给 EADAF 的登出中转页。
 *
 * 只清本地令牌不叫退出：EADAF 的 IdP 会话还在，下次点登录会被静默 SSO 登回来。
 * 走这个地址后 EADAF 会撤刷新令牌、清掉平台与各应用令牌，再带着 `logged_out=1`
 * 回到本应用登录页（登录页据此显示"已退出"且不自动登录）。
 */
export function buildSsoLogoutUrl(state = 'logout'): string {
  const appId = import.meta.env.VITE_SSO_APPLICATION_ID;
  const EADAFFrontend = import.meta.env.VITE_SSO_EADAF_FRONTEND || 'http://localhost:29527';
  if (!appId) return `${EADAFFrontend}/auth/logout`;
  const qs = new URLSearchParams({
    app: appId,
    // 回跳地址必须与应用的 redirect_uri / frontend_url 同源（EADAF 侧会校验）
    post_logout_redirect_uri: `${window.location.origin}/auth/login`,
    state,
  });
  return `${EADAFFrontend}/auth/logout?${qs.toString()}`;
}
