/**
 * 示例应用的会话客户端（**BFF 形态**）。
 *
 * 前端不持有任何令牌：
 *   - 登录：跳 BFF 的 `/auth/login`（BFF 生成 PKCE 并跳 EADAF 授权页）；
 *   - 会话：`GET /auth/me` 由 BFF 用 JWKS 本地验签后返回用户；
 *   - 业务请求：走 `/api/*`，BFF 负责带令牌、过期自动刷新；
 *   - 退出：`POST /auth/logout` 清 BFF 会话，再跳 EADAF 登出中转页撤销 sid（级联该设备所有应用）。
 *
 * 所以这里没有 localStorage、没有 Authorization 头、没有 `?app=`，也没有前端刷新逻辑 ——
 * 那些都在 BFF 里（见 app_example/server/index.mjs）。
 */

export interface SessionUser {
  user_id: string | null;
  username: string | null;
  name: string;
  avatar: string | null;
}

export interface SessionInfo {
  user: SessionUser;
  sid: string | null;
  azp: string | null;
  /** BFF 是否用 JWKS 公钥本地验签通过 */
  verifiedLocally: boolean;
}

export type SessionStatus = 'authenticated' | 'unauthenticated' | 'unknown';

/** 询问 BFF：当前浏览器是否已登录（unknown = 网络/5xx，不要据此清会话） */
export async function fetchSession(): Promise<{ status: SessionStatus; session?: SessionInfo }> {
  try {
    const res = await fetch('/auth/me', { credentials: 'same-origin' });
    if (res.ok) {
      const json = await res.json();
      return {
        status: 'authenticated',
        session: {
          user: {
            user_id: json?.user?.user_id ?? null,
            username: json?.user?.username ?? null,
            name: json?.user?.name || json?.user?.username || '未知用户',
            avatar: json?.user?.avatar ?? null,
          },
          sid: json?.sid ?? null,
          azp: json?.azp ?? null,
          verifiedLocally: Boolean(json?.verified_locally),
        },
      };
    }
    if (res.status === 401) return { status: 'unauthenticated' };
    return { status: 'unknown' };
  } catch {
    return { status: 'unknown' };
  }
}

/** 开始登录（可选 redirect：登录后回到站内某个路径） */
export function startLogin(redirect?: string): void {
  const target = redirect && redirect.startsWith('/') && redirect !== '/login'
    ? `/auth/login?redirect=${encodeURIComponent(redirect)}`
    : '/auth/login';
  window.location.href = target;
}

/** 退出：清 BFF 会话 → 跳 EADAF 登出中转页（撤销 sid，该设备所有应用一起退出） */
export async function logout(): Promise<void> {
  try {
    const res = await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
    const json = await res.json().catch(() => ({}));
    if (json?.end_session_url) {
      window.location.href = json.end_session_url;
      return;
    }
  } catch (error) {
    console.warn('退出时清理服务端会话失败（已忽略）:', error);
  }
  window.location.href = '/login?logged_out=1';
}

/** 拦截器安装标记（StrictMode 下 main.tsx 可能被执行两次） */
const INTERCEPTOR_FLAG = '__ys401InterceptorInstalled';

/**
 * 401 拦截：BFF 已经负责"令牌过期就刷新"，所以业务请求再拿到 401 只可能是
 * **会话真的没了**（登出/被撤销/刷新失败）→ 回登录页，而不是把「无效的令牌」留在页面上。
 */
export function installUnauthorizedInterceptor(): void {
  const w = window as unknown as Record<string, unknown>;
  if (w[INTERCEPTOR_FLAG]) return;
  w[INTERCEPTOR_FLAG] = true;

  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await original(input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    const onLoginPage = window.location.pathname.startsWith('/login');
    if (res.status === 401 && url.includes('/api/') && !onLoginPage) {
      window.location.replace('/login?expired=1');
    }
    return res;
  };
}
