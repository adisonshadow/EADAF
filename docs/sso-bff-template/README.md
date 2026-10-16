# EADAF SSO · 业务 BFF 参考实现（模板）

给**自带 BFF 的业务应用**（FMMS / CIAC-MS / IPS / FPCU 这类）的最小可用模板，演示
[docs/sso-integration-guide.md](../sso-integration-guide.md) §13 的推荐接法：**授权码 + PKCE**。

零依赖（只用 Node 18+ 自带能力），可以直接 `node server.mjs` 跑起来点一遍。

## 它演示了什么

| 关注点 | 做法 |
|--------|------|
| 令牌不出服务端 | 浏览器只拿一次性 `code` + 本 BFF 的 httpOnly 会话 Cookie；access/refresh 只存服务端 |
| 无需共享密钥验签 | 用 EADAF 的 `/.well-known/jwks.json` 公钥**本地验签**（RS256），校验 `iss`/`aud`/`exp` |
| CSRF / 重放防护 | `state` 严格比对 + PKCE(S256) + 一次性授权码（120s） |
| 令牌过期不打断用户 | 代理请求遇 401 `TOKEN_EXPIRED` → 刷新一次 → 重放原请求 |
| 真登出 / 级联 | 登出跳 EADAF 的登出中转页撤销 **sid** ⇒ 该设备上所有应用一起退出 |

## 跑起来

1. 管理台 → 三方应用 → 选中应用：
   - **SSO**：启用 SSO，`redirect_uri` 填 `http://localhost:4100/auth/callback`
     （本机回调建议勾选"自动跟随本系统域名/IP"或用 DEV 专用重定向，见指南 §2）
   - **密钥管理**：生成应用统一密钥
2. 启动：

```bash
EADAF_APP_ID=<application_id> \
EADAF_APP_SECRET=<应用统一密钥> \
node docs/sso-bff-template/server.mjs
```

3. 打开 <http://localhost:4100>，点「登录」→ 跳 EADAF 授权页（未登录会先要求登录）→
   回调回来即已登录。此后：

- 「看当前用户」= BFF 本地验签后返回 claims；
- 「调 EADAF 业务接口」= BFF 带访问令牌代理 `/api/v1/...`（可观察自动刷新）；
- 「退出」= 清 BFF 会话 + 跳登出中转页（撤销 sid）。

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `4100` | 本 BFF 端口 |
| `EADAF_API` | `http://localhost:29526` | EADAF 后端（换票 / JWKS / 业务接口） |
| `EADAF_FRONTEND` | `http://localhost:29527` | EADAF 管理台前端（授权页 / 登出页） |
| `EADAF_APP_ID` | 必填 | 应用 ID（= OAuth `client_id`） |
| `EADAF_APP_SECRET` | 必填 | 应用统一密钥（= `client_secret`，**只放服务端**） |
| `REDIRECT_URI` | `http://localhost:<PORT>/auth/callback` | 必须与应用登记的回调完全一致 |

## 移植到真实项目

- **会话存储**：模板用内存 `Map`（含 `pendingLogins` 与 `sessions`）。生产换成 Redis/DB，
  并给 `state`/`code_verifier` 设 5–10 分钟 TTL、给会话设滑动过期；
- **Cookie**：生产加 `Secure`，多域名场景设置 `Domain`；跨站前端（前后端不同站）改用
  `SameSite=None; Secure` 或改为前端带 CSRF token 的授权头方案；
- **JWKS 缓存**：模板永久缓存。生产建议带 TTL（如 10 分钟）+ 遇到未知 `kid` 时强制刷新一次；
- **刷新失败**：`SESSION_REVOKED` / `TOKEN_INVALID` 一定要清本应用会话并回登录页（指南 §6.4）；
- **登出**：`end_session_url` 由 EADAF 的登出页处理；Phase 3 起还会支持 back-channel logout，
  BFF 加一个端点接收 EADAF 的注销通知即可（届时可做到"用户在 EADAF 登出，应用 1 秒内退出"）；
- **可观测性**：把 `sid`、`sub`、`azp` 打进日志，排障时能一眼看出是哪个会话/应用。

## 用到的 EADAF 端点

| 端点 | 用途 |
|------|------|
| `{EADAF_FRONTEND}/oauth/authorize` | 浏览器跳转：授权（未登录会先去登录） |
| `POST {EADAF_API}/api/v1/oauth/token` | `authorization_code` / `refresh_token` 换票 |
| `GET {EADAF_API}/.well-known/jwks.json` | 公钥（本地验签） |
| `GET {EADAF_API}/.well-known/openid-configuration` | 发现文档 |
| `{EADAF_FRONTEND}/auth/logout` | 登出中转（撤销 sid，级联该设备所有应用） |
