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

/** 未经拦截器包装的原生 fetch（刷新自身、重放请求都用它，避免递归） */
let rawFetch: typeof fetch = typeof window !== 'undefined' ? window.fetch.bind(window) : fetch;

let refreshing: Promise<boolean> | null = null;

/**
 * 静默刷新访问令牌（单飞）。
 *
 * Phase 1 起访问令牌收紧到 15 分钟，没有它用户每 15 分钟就被踢回登录页。
 * 刷新令牌是**不透明随机串**（`rt_…`），只回传、不解码。
 */
async function doRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return false;
  try {
    const base = import.meta.env.VITE_API_BASE || '/api';
    const res = await rawFetch(withApp(`${base}/v1/auth/refresh`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const json = await res.json();
    const data = json?.data;
    if (!data?.token) return false;
    saveAuth(data.token, data.refresh_token || refreshToken);
    return true;
  } catch (error) {
    console.warn('静默刷新访问令牌失败:', error);
    return false;
  }
}

/** 单飞刷新：并发的 401 共用同一次刷新请求 */
export function refreshSessionOnce(): Promise<boolean> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

/** 用当前（可能是刚刷新过的）令牌重建请求头 */
function withFreshToken(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers, __authRetried: true } as RequestInit & { __authRetried?: boolean };
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
 * 全局 401 拦截：给 `window.fetch` 包一层。
 *
 * 处理顺序（重要）：
 *   1. 401 + 能刷新 → 静默刷新一次并用新令牌**重放原请求**（令牌过期不该打断用户）；
 *   2. 刷新救不回来（会话被撤销 / 令牌无效）→ 交给 {@link handleUnauthorized} 复核后清登录态。
 *
 * 为什么放在 fetch 这一层：本示例的数据请求（storeApi）和 AI 助手请求（`@eadaf/ai-base`
 * 的 client）走的是两套封装，逐个改容易漏；令牌过期恰恰最常先在 AI 助手面板暴露成
 * 一句「无效的令牌」。在 fetch 这一层收口，两套都覆盖到。
 * 只读 `res.status`，不消费响应体（重放时才重建请求）。
 */
export function installUnauthorizedInterceptor(): void {
  const w = window as unknown as Record<string, unknown>;
  if (w[INTERCEPTOR_FLAG]) return;
  w[INTERCEPTOR_FLAG] = true;

  rawFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await rawFetch(input, init);
    if (res.status !== 401) return res;

    const retried = (init as (RequestInit & { __authRetried?: boolean }) | undefined)?.__authRetried;
    if (!retried && (await refreshSessionOnce())) {
      return rawFetch(input, withFreshToken(init));
    }

    void handleUnauthorized();
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
