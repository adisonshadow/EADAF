# app_example × EADAF 自举脚本

这套脚本把「雨伞品牌电商独立站」示例**在 EADAF 上完整搭起来**，走的正是 EADAF 的
「数据模型 → 物化 → API 服务」链路，全程只调 **EADAF 内置 API**（应用 Token 认证），幂等可重复执行。

```
provision.mjs   ① 专用存储桶 ② 数据模型（实体/字段/枚举/关系） ③ 物化 ④ API 服务 + 发布
load-data.mjs   把演示数据（会员/伞品/订单/明细/售后）灌进物化表
```

## 前置条件

1. EADAF 已在跑（后端 `http://localhost:29526`），且在本机 **dev 模式**
2. 在管理台「三方应用」里已注册本示例应用，并拿到**应用统一密钥**
3. 该应用的 `api_enabled` 为真（`POST /api/v1/applications/token` 能换到 Token）

环境变量（都有默认值，指向仓库里这个示例应用）：

| 变量 | 默认 | 用途 |
|---|---|---|
| `EADAF_BASE` | `http://localhost:29526` | EADAF 后端地址 |
| `EADAF_APP_ID` | 示例应用 ID | 换 Token / 建桶时归属 |
| `EADAF_APP_SECRET` | 示例应用密钥 | 换取应用 Token |
| `EADAF_MYSQL_CMD` | 空 | `load-data.mjs` 灌库命令；空则只生成 SQL |
| `SALES_DEMO_DB_PATH` | `backend/data/sales-demo.db` | 演示数据源（SQLite） |

## 用法

```bash
cd app_example

# 0) 先把权威演示数据载入 SQLite（本示例的数据源头）
pnpm --filter ./backend init-sales-demo-db

# 1) 建桶 + 建模型 + 物化 + 建 API 服务（可反复跑）
node scripts/eadaf/provision.mjs
node scripts/eadaf/provision.mjs --dry-run            # 只看物化 SQL，不执行
node scripts/eadaf/provision.mjs --skip-materialize   # 跳过物化

# 2) 把演示数据灌进物化表
EADAF_MYSQL_CMD='docker exec -i mysql-local sh -c '"'"'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" bizdata_mat'"'"'' \
  node scripts/eadaf/load-data.mjs
```

## 建出来的东西

| 类别 | 内容 |
|---|---|
| 存储桶 | `ys`（绑本应用；`load-data` 不涉及，供示例上传伞品图片/售后凭证用） |
| 枚举 | `YS:member:MemberLevel`、`YS:order:OrderStatus`、`YS:service:ComplaintType`、`YS:service:ComplaintStatus` |
| 实体 | `YS:member:Member`、`YS:product:Product`、`YS:order:Order`、`YS:order:OrderItem`、`YS:service:Complaint` |
| 物化表 | `bizdata_mat.ys_member` / `ys_product` / `ys_order` / `ys_order_item` / `ys_complaint` |
| API 服务 | 每实体 `find` / `findOne` / `findById` / `count`，全部 published |

建完即可在管理台 **业务数据 → 模型设计** 看到 `YS` 域，在 **物化** 看到运行记录，
在 **API 服务** 看到 5 个服务。

## 前端调用姿势（重要）

示例应用是**纯前端 + SSO**，用的用户 JWT 是**应用密钥签发**的，所以每个请求都要带
`?app=<application_id>`（EADAF 靠它选择验签密钥）。前端已由
[`src/pages/store/storeApi.ts`](../../src/pages/store/storeApi.ts) 的 `withApp()` 统一补上：

```
GET /api/v1/data/YS/order/Order?limit=20&skip=0&app=<application_id>
Authorization: Bearer <用户 JWT>
```

响应信封：`{ items: [...], pagination: { total, page, pageSize, totalPages, hasNext } }`
（`findOne` 是 `{ item: {...} }`）。

## 应用侧需要配的一次性设置

脚本不动应用自身的配置，下面两条在管理台「三方应用」里配（或用 `PUT /api/v1/applications/{id}`）：

| 字段 | 值 | 作用 |
|---|---|---|
| `api_data_scope.domainCodes` | `["YS"]` | **决定 API 服务是否出现在 `/api/v1/applications-public/YS/apis.json`**；空则一个都不给 |
| `bizdata_scope_codes` | `["YS"]` | 存储按 Scope 授权、应用导出/导入时选哪些实体 |

## AI 侧现状与待办（交接）

**现状**：示例应用的 AI 助手能正常对话，但它用的 `sales-*` 系列 Tool（`订单状态统计`、
`搜索订单`、`查询订单详情`、`投诉列表`…）是 EADAF 后端里 **`server_builtin` 的硬编码实现**，
读的是旧 SQLite 演示库 `backend/data/sales-demo.db`，**不是上面这套物化表**。

因为两边都由同一份 `scripts/sales-demo-db.sql` 生成，**当前数据内容是一致的**（20/20/60/118/10）；
但它们是**两个存储**，写入不会互相同步。

**为什么不能靠配置解决**：`aibase.tools` 只支持 `execution_type` = `server_builtin` / `client`，
**没有「绑定到某条 API 服务」这种类型**（也没有 `apiServiceId` 字段）。所以要把 AI 指到 API 服务，
只能二选一：

- **(a) 改代码**：把 `backend/src/services/ai/toolInvokeService.js` 里 `sales_*` 的实现
  从 `salesDemoDb.*` 换成走 `bizdata_mat.ys_*`（或直接调 `apiServiceInvokeService`）。
  注意这些 Tool 挂在共享的 `sales-demo` scope 上，会影响其他引用了该 scope 的应用。
- **(b) 接受双存储**：两者同源同内容，只读演示完全够用；真要做写操作演示再上 (a)。

**另一个发现**：示例的 `VITE_DEMO_SCOPE_SLUG=YS` 指向的 **AI Scope `YS` 并不存在**
（`GET /api/v1/ai/scopes/YS/tools` → `SCOPE_NOT_FOUND`）。不过 ai-base 的启动链路只调
`/v1/ai/capabilities`（服务端不做 scope 过滤），`getScopeTools` 从未被调用，所以**目前不影响运行**；
要让这个变量名副其实，就在管理台建一个 slug 为 `YS` 的 AI Scope，并把上面那 6 个 `sales-*` Tool 归到它下面。

## 已知的平台侧修复

`backend/src/services/apiService/filterQueryBuilder.js` 的 `STRUCTURAL_PARAM_KEYS` 原先漏了 `app`，
导致**所有用应用密钥签发 JWT 的业务应用**调数据服务时报 `Unknown column 'app'`（不带 `?app=` 又必然 401）。
已加入 `'app'`。
