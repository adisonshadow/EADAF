/**
 * 给打到 EADAF 的请求补 `?app=<application_id>`。
 *
 * 背景：用户 SSO 登录（`/auth/login?app=…`）签发的 JWT 用的是【应用统一密钥】，
 * 而 EADAF 的鉴权中间件要靠 `?app=`（或令牌自述的 application_id）才知道该用哪把
 * 密钥验签。漏带的表现是这些请求全部 401，业务侧若把 401 当会话失效，用户就会
 * 「一发请求就掉登录」。
 *
 * 所以只要配置了 `applicationId`，AI 助手的所有 EADAF 请求都显式带上它。
 * 只在 URL 上追加参数、不改写已有 query，纯函数无依赖，便于自检
 * （见 eadafAppParam.verify.ts）。
 */
export function withEadafAppParam(url: string, applicationId?: string | null): string {
  const appId = typeof applicationId === 'string' ? applicationId.trim() : '';
  if (!appId || !url) return url;

  const hashIndex = url.indexOf('#');
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
  const base = hashIndex >= 0 ? url.slice(0, hashIndex) : url;

  // 调用方已显式指定 app（可能是别的应用）时不要覆盖
  if (/([?&])app=/.test(base)) return url;

  const lastChar = base.slice(-1);
  const separator = lastChar === '?' || lastChar === '&' ? '' : base.includes('?') ? '&' : '?';
  return `${base}${separator}app=${encodeURIComponent(appId)}${hash}`;
}
