/**
 * app_example 在 EADAF 上自举用的小客户端。
 *
 * 认证方式：用**应用 Token**（application_id + app_secret 换取的 JWT，平台密钥签发），
 * 这也是 EADAF 内置 API 对业务系统开放的标准方式；调内置 API 时**不要**带 ?app=。
 *
 * 需要的环境变量（都有默认值，默认指向本机 dev 环境）：
 *   EADAF_BASE        默认 http://localhost:29526
 *   EADAF_APP_ID      默认雨伞示例应用 ID
 *   EADAF_APP_SECRET  默认雨伞示例应用统一密钥
 */
const BASE = process.env.EADAF_BASE || 'http://localhost:29526';
export const APP_ID = process.env.EADAF_APP_ID || '1e71c653-630f-4006-b6df-081172b15752';
const APP_SECRET = process.env.EADAF_APP_SECRET
  || '63d98624f6aefe0046479fd060d4085a1c7d8c166144522d3bab3de7ede7f59b';

let token = null;

/** 用应用密钥换取应用 Token（平台密钥签发） */
export async function getToken() {
  if (token) return token;
  const res = await fetch(`${BASE}/api/v1/applications/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ application_id: APP_ID, app_secret: APP_SECRET }),
  });
  const json = await res.json();
  const t = json?.data?.token;
  if (!t) throw new Error(`换取应用 Token 失败：${JSON.stringify(json).slice(0, 300)}`);
  token = t;
  return token;
}

/** 调 EADAF 内置 API；失败抛错并带上响应体，便于定位 */
export async function req(method, path, body) {
  const t = await getToken();
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${t}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 400) }; }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> HTTP ${res.status}\n${text.slice(0, 500)}`);
  }
  return json;
}

export { BASE };
