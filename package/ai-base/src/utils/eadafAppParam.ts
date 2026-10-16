/**
 * 给打到 EADAF 的请求补 `?app=<application_id>`。
 *
 * 背景：用户 SSO 登录（`/auth/login?app=…`）签发的 JWT 用的是【应用统一密钥】，
 * 而 EADAF 的鉴权中间件要靠 `?app=`（或令牌自述的 application_id）才知道该用哪把
 * 密钥验签。漏带的表现是这些请求全部 401，业务侧若把 401 当会话失效，用户就会
 * 「一发请求就掉登录」。
 *
 * **只能拿令牌自述的应用去补参**（见 {@link withEadafAppParamForToken}）。
 * 不能拿 AI 配置里的 `applicationId` 顶替：那是「AI 归属应用」，EADAF 控制台用的
 * 是内置应用（未启用 SSO），硬塞进 `?app=` 会被判成「无效的第三方应用认证」。
 *
 * 纯函数无依赖，便于自检（见 eadafAppParam.verify.ts）。
 */

/** 只读 JWT 负载（不验签）：SSO 用户 JWT 会带 application_id，平台会话令牌不带 */
export function readTokenApplicationId(token?: string | null): string {
  if (!token || typeof token !== 'string') return '';
  try {
    const segment = token.split('.')[1];
    if (!segment) return '';
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { application_id?: unknown };
    return typeof payload?.application_id === 'string' ? payload.application_id.trim() : '';
  } catch {
    // 不是 JWT / 负载不是 JSON：当作「没有应用信息」，按平台令牌处理
    return '';
  }
}

/** 在 URL 上追加 `?app=`；不改写已有 query，调用方已显式指定 app 时不覆盖 */
export function withEadafAppParam(url: string, applicationId?: string | null): string {
  const appId = typeof applicationId === 'string' ? applicationId.trim() : '';
  if (!appId || !url) return url;

  const hashIndex = url.indexOf('#');
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
  const base = hashIndex >= 0 ? url.slice(0, hashIndex) : url;

  if (/([?&])app=/.test(base)) return url;

  const lastChar = base.slice(-1);
  const separator = lastChar === '?' || lastChar === '&' ? '' : base.includes('?') ? '&' : '?';
  return `${base}${separator}app=${encodeURIComponent(appId)}${hash}`;
}

/**
 * 按令牌自述的应用补参：
 * - SSO 用户 JWT（带 application_id）→ 补 `?app=<该应用>`；
 * - 平台会话令牌 / 应用 Token（不带声明，如 EADAF 控制台）→ 原样返回。
 */
export function withEadafAppParamForToken(url: string, token?: string | null): string {
  return withEadafAppParam(url, readTokenApplicationId(token));
}
