/**
 * SSO 应用 token 的独立存储（纯 localStorage 读写，无其它依赖，便于自检）。
 *
 * 背景（"SSO 登录后 EADAF 掉登录"的根因）：
 *   应用 JWT 由后端用【应用密钥】签发，只对带 `app=<id>` 的请求有效；
 *   而 EADAF 管理台的全局会话校验不带 app（用平台密钥验签）。
 *   两者若共用 localStorage.token，应用登录就会把管理台会话覆盖成无效 token，
 *   管理台下一个请求 401 → 清会话 → 回登录页。
 *
 * 因此约定：`token` / `refresh_token` 只属于平台会话；
 * 应用 token 一律按应用存到 `sso_token:<app_id>`，绝不写进平台会话位。
 */

const TOKEN_PREFIX = 'sso_token:';
const REFRESH_PREFIX = 'sso_refresh_token:';

export const platformTokenKeys = ['token', 'refresh_token'] as const;

export const ssoTokenKey = (appId: string) => `${TOKEN_PREFIX}${appId}`;
export const ssoRefreshTokenKey = (appId: string) => `${REFRESH_PREFIX}${appId}`;

export function saveSsoAuth(appId: string, token: string, refreshToken?: string): void {
  if (!appId || !token) return;
  localStorage.setItem(ssoTokenKey(appId), token);
  if (refreshToken) localStorage.setItem(ssoRefreshTokenKey(appId), refreshToken);
}

export function getSsoAuth(appId: string): { token: string; refreshToken: string } {
  if (!appId) return { token: '', refreshToken: '' };
  return {
    token: localStorage.getItem(ssoTokenKey(appId)) || '',
    refreshToken: localStorage.getItem(ssoRefreshTokenKey(appId)) || '',
  };
}

export function clearSsoAuth(appId: string): void {
  if (!appId) return;
  localStorage.removeItem(ssoTokenKey(appId));
  localStorage.removeItem(ssoRefreshTokenKey(appId));
}

/**
 * 清掉所有应用 token。
 * 两个用途：读到脏 token 时兜底；清理旧版本误写进平台会话位的痕迹时配合使用。
 */
export function clearAllSsoAuth(): number {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && (key.startsWith(TOKEN_PREFIX) || key.startsWith(REFRESH_PREFIX))) {
      keys.push(key);
    }
  }
  keys.forEach((key) => localStorage.removeItem(key));
  return keys.length;
}
