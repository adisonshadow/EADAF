# EADAF 用户 SSO 接入指南

> 面向外部应用（含 Electron / Web + BFF）对接 EADAF **用户单点登录**。  
> 调用业务 DataAPI / 内置 API 请另见 [外部应用接入指南](./external-app-integration-guide.md)（应用 Token）。  
> 本文为 SSO 唯一权威说明；旧 `backend/Documents/SSO*.md` 已废弃。

---

## 1. 两种令牌（务必分清）

| 令牌 | 如何获得 | 用途 | 密钥 |
|------|----------|------|------|
| **用户 SSO JWT** | 用户在 EADAF `/auth/login?app={application_id}` 登录后回调下发 | 标识**终端用户**；业务侧会话、`/auth/check` | 应用统一密钥（见 §6） |
| **应用 API Token** | `POST /api/v1/applications/token`（`application_id` + `app_secret`） | 服务端调 DataAPI / 内置 API | 同一 `app_secret`，但签发的是 `type=application` 令牌 |

- `app_secret` **只保存在应用服务端**，绝不能下发到前端、写进 Git 或塞进 URL。
- 应用 Token **不能**代替用户 SSO JWT；用户 JWT **不能**当作应用 Token 调受保护的应用域 API。

---

## 2. EADAF 管理台配置

1. 登录 EADAF 管理后台 → **三方应用 / 应用**
2. 打开目标应用的 **SSO**
3. 开启 **启用 SSO**
4. 填写：
   - **重定向 URI（`redirect_uri`）**：必须是 **BFF** 回调地址，不要填前端页面地址（见 §3）
   - **跳转模式（`redirect_mode`）**：`POST_REDIRECT`（平台默认）或 `HEADER_REDIRECT`
5. 在 **密钥管理** 中生成应用统一密钥（同步为 API `app_secret` / SSO `client_secret`）
6. 保存

只读信息（如有展示）：`client_id`（应用 code）、`issuer`（当前 EADAF origin）等，一般无需业务侧手填。

### 开发/部署两套回调地址（DEV 专用重定向）

开发机 BFF 的端口和部署后的往往不一样（例：本机 `:13303/auth/callback`，部署后 `/auth/callback`），
来回改 `redirect_uri` 很烦。在应用 SSO 配置里勾选 **启用DEV专用重定向** 后，可以同时存两套地址：

| 配置 | 什么时候生效 |
|------|--------------|
| `redirect_uri`（默认） | EADAF 以部署模式运行（`NODE_ENV=production`，`npm run prod` / `pm2prod`） |
| `redirect_uri_dev`（DEV 专用） | EADAF 跑在开发模式（`NODE_ENV=development`，`npm run dev` / `pm2dev`） |

- 两套各自带 **自动跟随本系统域名/IP**（`redirect_uri_use_system_host` / `redirect_uri_dev_use_system_host`），可只填端口路径
- 判定依据是 **EADAF 后端**的运行模式，跟浏览器用什么地址访问无关；DEV 地址没填时自动回落到默认地址
- 登录页拿到的仍是平台解析好的完整地址，业务 BFF 侧不需要改任何东西

### 跳转模式

| 值 | 行为 | 适用 |
|----|------|------|
| `POST_REDIRECT`（平台默认） | 浏览器对 `redirect_uri` **表单 POST**（body 含 `access_token` 等） | 必须有 BFF 接 POST |
| `HEADER_REDIRECT`（对接推荐） | **302** 到 `redirect_uri`，token 在 **query** | BFF 用 GET 收参，再 302 到前端 |

Electron / 典型 Web+BFF：**推荐在应用 SSO 配置里选 `HEADER_REDIRECT`**，与 BFF `GET /auth/callback` 一致。

---

## 3. 回调地址填谁

EADAF 应用里配置的 `redirect_uri` **必须是 BFF 地址**，不是前端页面地址。

| | 示例 |
|--|------|
| 正确 | `http://localhost:5171/auth/callback`（BFF） |
| 错误 | `http://localhost:5173/auth/callback`（前端直收） |

推荐链路：

```
用户打开业务前端
  → 跳转 EADAF /auth/login?app={application_id}
  → 登录成功
  → HEADER_REDIRECT / POST 到 BFF /auth/callback（带 access_token 等）
  → BFF 再 302 到前端回调页并带上 token（格式见 §4）
```

`redirect_mode` 必须与 BFF 实现一致。

---

## 4. 前端路由形态决定「BFF 二次跳转」格式

BFF 转发前端时，必须按前端 Router 选型拼 URL，否则会出现「有时登录成功又回到登录页」：

| 前端路由 | BFF 应 302 到 |
|----------|----------------|
| HashRouter（Electron 常见） | `{FRONTEND_URL}/#/auth/callback?token=...` |
| BrowserRouter（纯 Web） | `{FRONTEND_URL}/auth/callback?token=...` |

禁止对 HashRouter 应用只跳 `http://host/auth/callback?token=...`（无 hash）：React 路由匹配不到回调页，token 不会写入，随后被鉴权守卫送回登录页。

若历史已存在 pathname 回调，前端可在启动时兜底改写为 `/#/auth/callback?...`，但**契约上应以 BFF 直接发对格式为准**。

---

## 5. 回调查询参数约定

### 5.1 EADAF → BFF

由 `redirect_mode` 决定传递方式（query 或 POST body），字段名一致：

| 字段 | 说明 |
|------|------|
| `access_token` | 必需，用户 JWT |
| `refresh_token` | 可选 |
| `token_type` | 通常 `Bearer` |
| `expires_in` | 秒数（提示值） |
| `state` | 可选，透传登录页 query |
| `user_info` | JSON 字符串（用户摘要） |
| `verify` | JSON（`timestamp` / `public_secret` 等，可选校验） |
| `idp` | POST 模式下常见，如 `EADAF` |

### 5.2 BFF → 前端（建议统一）

| 参数 | 说明 |
|------|------|
| `token`（或兼容 `access_token`） | 必需，用户 JWT |
| `refresh_token` | 可选 |
| `user_info` | 可选；建议 BFF **裁剪**为 `user_id` / `username` / `name` / `avatar` / `department_id` 等，避免 URL 过长导致 token 被截断 |

前端回调页应同时兼容 `token` / `access_token`。

---

## 6. 验签密钥与 `/auth/check`

### 6.1 应用统一密钥（替代旧「签名盐」）

验签密钥解析优先级（EADAF 服务端）：

1. `sso_config.client_secret`
2. `api_connect_config.app_secret`
3. 旧版 `sso_config.salt`（仅兼容历史数据）

BFF 本地 `jwt.verify` 使用的密钥必须与上述应用密钥**完全一致**（通常配置为环境变量，例如 `SSO_JWT_SECRET` / `APP_SECRET`，名称自定）。  
旧文档中的 `SSO_JWT_SALT` /「签名盐值」已过时，请勿再按独立 salt 字段对接。

### 6.2 `/auth/check` 推荐策略（BFF）

1. **优先请求 EADAF**：  
   `GET {eadaf}/api/v1/auth/check?app={application_id}`  
   Header：`Authorization: Bearer <user_jwt>`
2. EADAF 不可达或非明确拒绝时，再 `jwt.verify(应用统一密钥)` / `jwt.decode` 本地回退
3. 仅当明确 **401 / 无效 token** 时清理本地登录态；网络抖动不要立刻清 token 并踢回登录页

登录时 EADAF 前端会把 URL 中的 `app` 作为 `application_id` 传给 `POST /api/v1/auth/login`，从而用应用密钥签发用户 JWT，与 `check?app=` 一致。

### 6.3 验签密钥怎么选（`?app=` 与令牌自述）

EADAF 侧按顺序挑验签密钥，因此**同一个 token 带不带 `?app=` 都能通过**：

| 顺序 | 依据 | 说明 |
|------|------|------|
| 1 | `?app={application_id}` | 显式声明；该应用必须存在、`ACTIVE` 且已启用 SSO，否则 401 |
| 2 | JWT 负载里的 `application_id` | 新版 EADAF 签发用户 JWT 时会写入，令牌自描述 |
| 3 | 平台密钥 | 平台会话 JWT、以及用平台密钥签发的**应用 Token** |

- 用户 JWT（应用密钥签发）与**应用 Token**（`POST /applications/token`，平台密钥签发）是两把密钥，过去靠「URL 上有没有 `?app=`」区分，客户端漏带/多带都会 401 —— 业务侧若把 401 当会话失效，用户就会「一发请求就掉登录」。
- 客户端的稳妥做法仍是**显式带 `?app={application_id}`**（兼容旧后端与旧令牌）；`@eadaf/ai-base` 会自动读**令牌自述的 `application_id`** 补上它。
- ⚠️ **别把「AI 归属应用」当 SSO 应用**：ai-base 配置里的 `applicationId`（EADAF 控制台用的是内置应用 `EADAF`，它并未启用 SSO）只用于 Skill/Scope 归属，把它塞进 `?app=` 会得到 401「无效的第三方应用认证」。`?app=` 只能是**签发该用户 JWT 的那个应用**。
- 旧版本签发的用户 JWT 不带 `application_id` 声明：ai-base 支持用 `ssoApplicationId` 显式声明"本前端的令牌由哪个 SSO 应用签发"（示例应用已配）。**注意它和 `applicationId` 不是一个东西**，别把归属应用配进去。

### 6.4 401 的可编程错误码

`auth` 中间件的 401 响应带 `error_code`，客户端据此区分「该刷新/重新登录」还是「只是这个接口没权限」：

| `error_code` | 含义 | 客户端建议动作 |
|--------------|------|----------------|
| `TOKEN_EXPIRED` | 访问令牌过期 | 静默刷新一次；失败则重新登录 |
| `TOKEN_INVALID` | 验签失败 / 载荷不合法 / 应用令牌无效 / 刷新令牌已轮换 | 清应用会话 → 回登录页 |
| `SESSION_REVOKED` | 会话已被撤销（登出、退出所有设备、刷新令牌重放） | 清应用会话 → 回登录页 |
| `AUTH_MISSING` / `AUTH_MALFORMED` | 没带 / 格式不对的 Authorization 头 | 清应用会话 → 回登录页 |
| `APP_CONTEXT_INVALID` | `?app=` 指向的应用不可用于 SSO | **不要清会话**：这是配置/接口问题，提示并联系管理员 |

> 401 一律当"掉登录"是历史坑（见 §10）；接口级问题请只提示、不清登录态。

### 6.5 会话（`sid`）与「退出所有设备」

一次登录会产生一个**会话**（`sid`），该设备上所有应用共用它：

- `POST /api/v1/auth/login` 响应里带 `sid`；后续登录（包括业务应用的 SSO 登录，由管理台前端发起）带上同一个 `sid` 即并入同一会话；
- 访问令牌里带 `sid`，`auth` 中间件每次请求都检查会话是否被撤销 —— **撤销后令牌即使没过期也立即 401 `SESSION_REVOKED`**，这就是"登出立即级联该设备所有应用"的实现；
- 会话状态存在 Redis（`sso:sess:<sid>` / `sso:revoked:<sid>`）。**Redis 不可用时 fail-open**：撤销查不到就放行，退化为"等 access 过期"，可用性优先；
- 刷新令牌是**不透明随机串**（`rt_…`，46 字符），客户端只回传、不要解码；轮换时旧令牌置 REVOKED，重放（超过 60s 宽限）会撤销整条会话；
- `POST /api/v1/auth/refresh` **不再要求有效 access token**（访问令牌过期后必须还能刷新），凭据是刷新令牌本身。

| 接口 | 用途 |
|------|------|
| `GET /api/v1/auth/sessions` | 当前用户的活跃会话（"登录设备"）；`store_available=false` 表示 Redis 不可用、列表查不到 |
| `DELETE /api/v1/auth/sessions/{sid}` | 撤销指定会话（只能撤自己的） |
| `DELETE /api/v1/auth/sessions` | 退出所有设备（含当前会话，前端随后回登录页） |
| `POST /api/v1/auth/logout` `{ all: true }` | 同上；需能确认身份（有效令牌或刷新令牌），否则 401 `AUTH_MISSING` |


---

## 7. 应用侧必备接口（BFF 自建）

以下路径是**业务 BFF 约定**，不是 EADAF 内置路由。

| 接口 | 用途 |
|------|------|
| `GET /auth/sso-config` | 返回 `eadaf_frontend_url`、`application_id`、`callback_url`、`redirect_mode` 等（可免登录） |
| `GET` 或 `POST /auth/callback` | 接 EADAF 回调；与应用配置的 `redirect_mode` 一致 |
| `GET /auth/check` | 校验用户 JWT（见 §6） |
| `GET /auth/me` | 可选，返回当前用户声明 |
| `POST /auth/logout` | 可选；**优先走 EADAF 登出中转页**，见 §7.1 |

### 7.1 单点登出（RP-Initiated Logout）

只清应用本地令牌**不叫退出**：EADAF 的 IdP 会话还在，用户下次点登录会被静默 SSO 登回来（看起来像"没退出成功"）。应用退出时应把浏览器交给 EADAF 的登出中转页：

```text
{eadaf_frontend_url}/auth/logout?app={application_id}&post_logout_redirect_uri={应用登录页}&state={opaque}
```

中转页会做三件事：① 撤销本地 refresh 令牌；② 清掉平台令牌与**所有应用**的 `sso_token:<app_id>`；③ 带 `logged_out=1` 与 `state` 回跳 `post_logout_redirect_uri`。

- `post_logout_redirect_uri` 必须与应用的 `redirect_uri`（含 DEV 那套）或 `frontend_url` **同源**，否则 EADAF 返回 400（防开放重定向）；
- 应用登录页收到 `logged_out=1` 应显示"已退出"，并且**不要自动跳 SSO**，必须等用户主动点击，否则会被登回去；
- 纯服务端场景（无浏览器）可直接调后端中转，由它校验并 302：

```http
GET {eadaf}/api/v1/auth/end-session?app={application_id}&post_logout_redirect_uri={url}&state={opaque}
```

**阶段边界**（见 [方案计划](./SSO会话与登出方案计划.md)）：Phase 0 的登出只撤当前会话的 refresh 并清**本浏览器**的令牌，其它已登录应用要等下次探测才回登录页；**Phase 1 起**该设备上所有应用共用一个 `sid`，撤销即让它们的令牌**立刻**失效（§6.5）；Phase 3 的 back-channel logout 让应用无需探测、1 秒内回登录页。

前端登录入口推荐：

```text
{eadaf_frontend_url}/auth/login?app={application_id}
```

EADAF 侧可公开拉取的配置（跳转用，非完整密钥）：

```http
GET {eadaf}/api/v1/applications-sso/{application_id}
```

返回含 `redirect_uri`、`redirect_mode`、`currentTimestamp`、`secret`（回调校验用 hash）等，**不会**下发 `app_secret`。

---

## 8. 前端鉴权守卫注意点

1. **React StrictMode** 下回调 `useEffect` 可能双跑：第二次可能已无 query。须用 `useRef` 保证只处理一次；若本地**已有** token，应直接进业务页，而不是报「缺少 token」并踢回登录。
2. 不要把 `/login`、`/auth/callback` 记成「登录后回跳地址」。
3. 调用 `/auth/check` 时，不要走「HTTP 401 → 立刻 `clearToken` + 强制跳登录」的通用 API 客户端逻辑；仅明确无效 token 再清登录态。否则会出现「刚登录成功又被踢回登录页」。

---

## 9. 联调检查清单

- [ ] EADAF 应用 SSO 已启用，`redirect_uri` = BFF `/auth/callback`
- [ ] 本地开发与部署的回调地址不同时，勾选「启用DEV专用重定向」并把 DEV 地址填成本机 BFF（见 §2）
- [ ] `redirect_mode` 与 BFF 一致（推荐 `HEADER_REDIRECT`）
- [ ] 已在「密钥管理」生成统一密钥；BFF 验签密钥与之一致
- [ ] BFF → 前端二次跳转格式匹配 HashRouter / BrowserRouter
- [ ] 浏览器 / Electron 实际落地 URL 中可见 `token=`（或 `access_token=`），且前端回调页被路由命中
- [ ] 登录后进入业务首页，而不是再次 `/login`
- [ ] DevTools：本地已有用户 token；随后业务 API 带 `Authorization: Bearer ...`
- [ ] BFF `check` 使用 `?app={application_id}`（或本地同一密钥验签）

---

## 10. 常见故障速查

| 现象 | 优先排查 |
|------|----------|
| 登录后又回登录页 | Hash 回调格式错误；StrictMode 双跑；check 误清 token；回跳路径写成了 `/login` |
| **应用里退出后，一点登录又自动登进去** | 只清了应用本地令牌，没退 EADAF 的 IdP 会话。退出要走登出中转页（§7.1），登录页收到 `logged_out=1` 时不要自动跳 SSO |
| **EADAF 退出后，应用仍停着 / 只报"无效的令牌"** | Phase 0 的能力边界：其它应用要等自己下次探测（`/auth/check` 返回 401）才回登录页；Phase 1 起 `sid` 撤销即时生效，Phase 3 back-channel 后无需探测 |
| **一发后端请求就掉登录** | 客户端把 401 一律当会话失效：某些接口（AI / DataAPI / 存储）漏带 `?app=` 时必然 401。先复核 `/auth/check?app=` 再决定是否清 token（见 §8.3）；`@eadaf/ai-base` 会按令牌自述的 `application_id` 自动补 `?app=` |
| 401 **无效的第三方应用认证** | `?app=` 指向的应用不可用于 SSO：不存在 / 非 `ACTIVE` / `sso_enabled=false` / 没生成统一密钥。常见误用是把「AI 归属应用」（如控制台的内置应用 EADAF）塞进了 `?app=`，以及把「AI 归属应用」和「签发该 JWT 的应用」混为一谈 |
| 回调 400「缺少 token」 | `redirect_mode` / 参数名与 BFF 不一致（EADAF 下发的是 `access_token`） |
| check 总是 401 | 验签密钥不一致；未带 `app={application_id}` 调 EADAF check；登录未走 SSO（未传 `application_id`）导致密钥不匹配 |
| DataAPI 403、登录却正常 | 应用 Token / 域授权问题，与 SSO 用户 JWT 无关 |
| URL 超长、偶发丢参 | `user_info` 未裁剪；改用 POST 模式或 BFF 会话存 token |
| POST 回调前端收不到 | POST 必须由 BFF 接；纯前端页面无法可靠读 body |

---

## 11. EADAF API 速查

### 11.1 SSO 登录入口（浏览器）

```text
GET {eadaf_frontend}/auth/login?app={application_id}
```

可选透传：`state`、`redirect`（仅管理台场景；业务 SSO 以应用 `redirect_uri` 为准）。

### 11.2 登录（EADAF 前端调用；业务一般不直连）

```http
POST {eadaf}/api/v1/auth/login
Content-Type: application/json

{
  "username": "...",
  "password": "...",
  "application_id": "<UUID>"
}
```

提供且应用已启用 SSO 时：用应用统一密钥签发 `token` / `refresh_token`，并可能在 `data.sso` 中带回配置摘要。

### 11.3 校验用户 JWT

```http
GET {eadaf}/api/v1/auth/check?app={application_id}
Authorization: Bearer {user_jwt}
```

### 11.4 拉取公开 SSO 跳转信息

```http
GET {eadaf}/api/v1/applications-sso/{application_id}
```

### 11.5 应用 API Token（与用户 SSO 无关）

```http
POST {eadaf}/api/v1/applications/token
Content-Type: application/json

{
  "application_id": "<UUID>",
  "app_secret": "<密钥>"
}
```

详见 [外部应用接入指南](./external-app-integration-guide.md)。

### 11.6 单点登出

浏览器（应用退出按钮用这个）：

```text
{eadaf_frontend}/auth/logout?app={application_id}&post_logout_redirect_uri={应用登录页}&state={opaque}
```

服务端/无浏览器（校验回跳地址后 302）：

```http
GET {eadaf}/api/v1/auth/end-session?app={application_id}&post_logout_redirect_uri={url}&state={opaque}
```

说明见 §7.1（回跳地址必须与应用同源，否则 400）。

### 11.7 会话（登录设备）

```http
GET    {eadaf}/api/v1/auth/sessions            # 列出（需认证）
DELETE {eadaf}/api/v1/auth/sessions/{sid}      # 撤销指定会话（需认证）
DELETE {eadaf}/api/v1/auth/sessions            # 退出所有设备（需认证）
```

---

## 12. 时序（推荐 HEADER_REDIRECT）

```mermaid
sequenceDiagram
  participant FE as AppFrontend
  participant BFF as AppBFF
  participant EADAF as EADAF
  FE->>BFF: GET /auth/sso-config
  BFF-->>FE: eadaf_frontend_url application_id
  FE->>EADAF: 打开 /auth/login?app=application_id
  EADAF->>BFF: 302 GET /auth/callback?access_token=...
  BFF->>FE: 302 按 Router 形态带 token
  FE->>BFF: GET /auth/check
  BFF->>EADAF: GET /api/v1/auth/check?app=...
  EADAF-->>BFF: 用户信息
  BFF-->>FE: ok
```

---

> **文档版本**：2026-08-09  
> **适用**：当前 EADAF 开发版  
> **相关**：AI 调用约定见 [`docs/eadaf-api-skill/SKILL.md`](./eadaf-api-skill/SKILL.md)
