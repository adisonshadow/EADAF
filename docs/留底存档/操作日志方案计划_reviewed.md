# 操作日志（Operation Audit Log）方案计划 — Review 修订稿

> Review 对象：[docs/操作日志方案计划.md](操作日志方案计划.md)  
> 核查基准：`operation_logs` 表/模型、user/role 现有写入、`auth.js` / JWT、`builtinApiPermissionService`、`errorHandler`、`catalog.js`、前端 `/system` 路由与「AI 请求日志」页、`toolInvokeService` server_builtin、`initdb.sh`  
> Review 日期：2026-09-01 · 方式：方案中全部事实断言逐条对照源码核查（file:line 为证）  
> 状态：**以本文为准的实施蓝本**（原文保留作历史；落地请按本文执行）

关联文档：[钩子管理方案计划.md](./钩子管理方案计划.md)（调度器/清单模式参照）、[p2-observability.md](./improvements/p2-observability.md)（AI 可观测性，互补不重叠）

---

## 0. 总评

**方向通过，不能按原文伪代码直接开工。**

核心判断全部成立：

- `eadaf.operation_logs` 确有写入、零读取，管理面审计缺口真实；
- 混合式（声明式中间件 + 控制器按需快照）方向正确，优于继续在各控制器堆 `try/create/catch`；
- 查询 API / 前端页沿用「AI 管理 → 请求日志」骨架正确；
- 权限走内置 API catalog + `authWithBuiltinApiGuard` 正确；
- §9.2「用户令牌 `roleIds` 恒空」是真缺陷，必须修。

但核查同时发现：

1. **2 处会记错账的机制缺陷**：成败判定用 `ctx.status < 400` 在本仓库会把业务失败记成 SUCCESS；`await next()` 无 `try/finally` 会丢掉抛错路径的 FAILED 日志。
2. **多处与代码不符的接线细节**（LOGOUT 活路径、测试文件不存在、SSO 写路由、`AuditOutlined` 已注册、`applicationSsoRoutes` 只读）。
3. **覆盖面自称「一步到位」但清单漏模块**，且 AI `server_builtin` 直调服务会绕过 HTTP 中间件。
4. **DDL 有落地风险**：`operator_id` FK 到 `users` 会卡死 APPLICATION 型、并阻碍用户删除。

修订稿**保留**原文产品决策（全覆盖、内置权限、混合式、不做回滚/防篡改/数据面审计），只改「怎么接到现网上」。开放问题在本文拍板，不再悬空。

---

## 1. 事实核查表（逐条）

图例：✅ 属实 · ⚠️ 属实但需补充精度 · ❌ 不属实

### 1.1 背景与现状

| # | 方案断言 | 结论 | 证据 |
|---|---|---|---|
| 1 | `eadaf.operation_logs` 已存在，无任何查询 API / 前端页 | ✅ | 模型 `models/operation_log.js`；全仓无 list/get 路由；前端无 OperationLogs 页 |
| 2 | 只有 7 处零散写入 | ⚠️ | `OperationLog.create` 确为 7 处：`userController.js` 5 处 + `roleController.js` 2 处。但 **LOGOUT 那处是死代码**（见 #8） |
| 3 | `user_id` 存的是被操作目标而非操作者 | ✅ | `userController.js:255` 注释「使用被更新的用户ID」；角色写入甚至不填 `user_id`（`roleController.js:245-256`） |
| 4 | 无 IP / UA / trace_id / 耗时；`created_at` 无索引 | ✅ | 表定义 `schemas.sql:178-190`；索引仅 `user_id` / `(resource_type,resource_id)` / `status`（`:328-330`） |
| 5 | 覆盖面无 CREATE | ✅ | `userController.create`（`:45`）全程无 `OperationLog` |
| 6 | AI 请求日志是最完整参照 | ⚠️ | 路由+页存在（`adminAiRequestLogRoutes.js`、`pages/AIManagement/RequestLogs`），但参照本身偏瘦：列表 `formatLog` 不含详情字段、前端 `request()` **只传 page/size**、无 `useProTableSearchCollapse`。新页应**优于**它，不要原样克隆缺陷 |
| 7 | 其它管理域完全不写操作日志 | ✅ | 全仓 `OperationLog.create` 仅上述两控制器 |

### 1.2 记录机制与现网行为

| # | 方案断言 | 结论 | 证据 |
|---|---|---|---|
| 8 | 把 `userController.js:963` LOGOUT 迁到中间件 | ❌ | **活路径是 `authController.logout`**（`authRoutes.js:446`），该函数**不写** OperationLog（`authController.js:469-508`）。`userController.logout` 无路由挂载 |
| 9 | 现有测试 `test/user.test.js` L306 等必须保持通过 | ❌ | **`backend/test/` 不存在**；全仓无 `OperationLog` 测试。`OPERATION_AUDIT_SYNC` 仍建议做，但不是为了保存量测试 |
| 10 | 成败用 `ctx.status < 400`，错误消息取 `ctx.body.message` | ❌ | 本仓库用信封 `code`。`userController.create` 校验失败显式 `ctx.status = 200` + `body.code = 400`（`:54-60`）。只看 HTTP status 会把失败记成 SUCCESS |
| 11 | `await next()` 后落库即可覆盖失败 | ❌ | `errorHandler` 在最外层（`app.js:66`）。控制器 **throw** 时中间件 `next()` 之后的代码不会跑，FAILED 日志丢失。必须 `try/finally` |
| 12 | `ctx.state.traceId` 可复用 | ✅ | `middlewares/traceId.js:5-7`；`app.js:67` 全局挂载 |
| 13 | 操作者：`ctx.state.user` / `ctx.state.application` | ✅ | `auth.js:125` 应用令牌设 `application`；`:176` 用户令牌设 `payload`（仅 `user_id`+`username`） |
| 14 | `applicationSsoRoutes` 是 SSO 配置变更写入点 | ❌ | 该文件只有 GET（`system-branding`、`/:id`）。SSO 配置写在 `applicationRoutes.js` 的 PUT/generate-secret |
| 15 | 数据面调用不走本功能 | ✅ | Data API / AI chat / 钩子 Run 已有各自表。`internal_api` 动作直调 `executePublished`（`internalApiAction.js:28`），本来就不该记管理面日志 |

### 1.3 权限与前端

| # | 方案断言 | 结论 | 证据 |
|---|---|---|---|
| 16 | JWT 只签 `{user_id, username}`，auth 不补 roleIds | ✅ | `authController.js:245-246`；`auth.js:176` `ctx.state.user = payload`；全文无 roleIds 注入 |
| 17 | 用户令牌一旦配 `mode:'role'` → 全员 403（含 SUPER_ADMIN） | ✅ | `extractUserAuthContext` 读 `user.roleIds`（`builtinApiPermissionService.js:124`），恒为 `[]`；比对 `:163-168` |
| 18 | 同套缺陷只影响角色 | ⚠️ | JWT 也**没有** `department_id`。`mode:'department'` 同样全 403（`:172-176`）。§9.2 必须一并回查部门 |
| 19 | `/me`（checkAuth）有角色，故菜单侧无此问题 | ✅ | `authController.js:568-576` 展平 `role_ids` / `role_codes`；`AppLayout.tsx:56` `isSuperAdmin`；`config.ts:100` 旁路 |
| 20 | 前端菜单：`/system` 无 name 不显示 | ✅ | `semanticRegistry` 仅有 `/system/settings`（`:438`）；`routeUi.ts:79` 将其 `hideInMenu`；无 `/system` 分组根 |
| 21 | `AppLayout.iconMap` 需补 `AuditOutlined` | ❌ | **已经有**（`AppLayout.tsx:4,24`）。`/permissions` 分组已用该图标 |
| 22 | catalog 按 `ai:request_log:list/get` 模式登记 | ✅ | `catalog.js:985-1001`；system 域已有 features/backup（`:1041-1077`） |
| 23 | SUPER_ADMIN 角色 ID 实施时取自 `superadmin.sql` | ✅ | 角色 ID = `10000000-0000-0000-0000-000000000001`（`superadmin.sql:4`） |
| 24 | 菜单权限 seed 用 `660e8400-…-090` 的 `system:manage` | ⚠️ | 该 ID 目前未占用。但同文件 **`440082` 已被 `collection_pipeline:read` 与 `system:settings:manage` 重复使用**（`eadaf-permissions-catalog-seed.sql:37-39`）。新 seed **禁止**再复用 082，且不要在本功能里顺手「修」082（另开迁移） |

### 1.4 绕过 HTTP 中间件的写路径

| # | 方案断言 | 结论 | 证据 |
|---|---|---|---|
| 25 | 管理面写操作挂路由中间件即可全覆盖 | ❌ | AI `server_builtin` **直调服务**：`bizdata_execute_materialization` / `bizdata_insert_mock_data`（`toolInvokeService.js:52-113`）不经过 `businessDataRoutes`。只挂中间件会漏「AI 触发的物化 / 灌 mock」 |
| 26 | 前端 client Tool 写操作会经过 REST | ✅ | 工作区约定写操作走 Chat Tool；client Tool 打的是同一套管理 API，中间件能罩住 |

---

## 2. 必须修正项（写入可实施蓝本）

### 2.1 成败判定：信封 code 优先

```js
function resolveAuditSuccess(ctx) {
  const envelopeCode = Number(ctx.body?.code);
  if (Number.isFinite(envelopeCode)) return envelopeCode < 400;
  return ctx.status < 400;
}
```

禁止只看 `ctx.status`。错误消息仍取 `ctx.body?.message`，截断 2000。

### 2.2 中间件必须 `try/finally`

```js
function operationAudit(config) {
  return async (ctx, next) => {
    const startAt = Date.now();
    try {
      await next();
    } finally {
      // 鉴权中间件未 next（401/403）时本中间件根本不会进，这里只处理已进入业务的请求
      writeAuditRecord(ctx, config, startAt); // 内部再 setImmediate / 同步切换
    }
  };
}
```

`errorHandler` 在外层，throw 之后 `ctx.status` / `ctx.body` 已被写成信封，`finally` 里能读到 FAILED。

### 2.3 落库收敛到函数，中间件只是 HTTP 适配器

抽出 `backend/src/services/operationAudit/writeOperationLog.js`：

- HTTP：`operationAudit` 中间件组装 record 后调用它；
- 非 HTTP：`bizdata_execute_materialization`、`bizdata_insert_mock_data` 等 server_builtin **在 handler 成功/失败后显式调用**（operator = 当前 `invokeContext.userId`，`operator_type='USER'`，domain=`bizdata`）。

M4 清单里凡「AI 也能直调服务」的写操作，必须在服务层或 builtin handler 补一行，不能只改路由。

### 2.4 DDL 修正

| 原文 | 修订 |
|---|---|
| `operator_id UUID REFERENCES eadaf.users(user_id)` | **不要 FK 到 users**。APPLICATION 要把 `application_id` 放这里会违反 FK；用户删除会被日志行卡住。改为无 FK 的 UUID + `ON DELETE` 无需声明 |
| 无 application 标识 | 新增可空 `application_id UUID`（同样无 FK，或 FK `applications` 且 `ON DELETE SET NULL`） |
| `resource_id VARCHAR(50)` 保持不变 | **加宽到 `VARCHAR(200)`**。UUID=36 够用，但存储 object key、实体 code、复合标识会超 50 |
| 存量 `user_id` 语义 | 维持「目标用户」；仅 user 域填写。角色/应用等保持 NULL |
| `operator_id` 存量 NULL | 维持，前端显示「—」 |

`SUPER_ADMIN` 角色 ID 写死为 `10000000-0000-0000-0000-000000000001`（不要占位符）。

### 2.5 LOGOUT / LOGIN 接线

| 操作 | 挂载点 |
|---|---|
| LOGOUT | `authRoutes.js` `POST /logout` → `authController.logout`（**不要**改无路由的 `userController.logout`；建议删除该死函数以免再被抄） |
| LOGIN 成功 | `authRoutes.js` `POST /login`；登录成功后控制器设 `auditContext`（此时尚无 `ctx.state.user`） |
| LOGIN 失败 | **不入** operation_logs（见 §3 Q2） |

### 2.6 脱敏

`redactFields` 必须同时支持：

1. **键名递归匹配**（大小写不敏感）：`password` / `password_hash` / `secret` / `token` / `app_secret` / `client_secret` / `api_key` / `apikey` / `private_key` / `authorization` / `refresh_token` / `access_key`；
2. **点路径**（如 `sso_config.client_secret`、`connection_config.password`）——原文「路径」与「按键名剔除」不是一回事，只做键名会漏嵌套对象。

超大字段（SQL 正文、handler 源码、scope doc）截断 2KB（R3 落地为硬规则，M1 就做，不要拖到出问题再裁）。

### 2.7 其它设计拍板

| 问题 | 修订结论 |
|---|---|
| Q1 初期权限 | **A. M2 即收紧 SUPER_ADMIN**。详情含 PII + 变更快照，不能「登录越权可见」 |
| Q2 登录失败 | **不进**操作日志；只留 `login_attempts` |
| Q3 定时调度 | **不记** SYSTEM 操作日志；物化/钩子看各自 Run 表 |
| Q4 写日志是否发钩子 | **不做**。避免审计→钩子→再审计的记录链 |
| Q5 保留期 | **180 天**，M5 再做清理；M1 不建分区 |
| 未认证写接口（重置密码 token 等） | `operator_type='ANONYMOUS'`，**不要**冒充 SYSTEM |
| 纯校验 / 预览 / dry-run | **不挂**中间件：`check-handler`、`check-permission`、`resolve-connection`、`validate-script`、`preview`、`dedup-check`、`suggest-test-params`、连接 test（除非明确算 EXECUTE） |
| 查看日志本身 | v1 **不**自审计；导出（M5）才记 `EXPORT` |
| 前端图标 | **不改** `AppLayout.iconMap` |
| 存量测试 | 无存量 OperationLog 测试。新增 `*.verify.js` 或 `test/operationAudit.verify.js`，与仓库现有 verify 风格对齐；`OPERATION_AUDIT_SYNC=true` 仅服务这些新测试 |
| AI 集成 | 本页只读，**不**走 Chat / `sendMockUserMessage`。符合「业务写操作才走 AI Chat」——这里没有写操作 |

---

## 3. 修订后完整方案（实施蓝本）

> 以下替代原文对应节；未点名修改处与原文意图一致。

### 3.1 背景与目标

保持原文 §1：补齐「记录 / 查询 / 查看」三件事；目标用户为管理员与按 `trace_id` 串联排障的人。

非目标不变：数据面运行日志、拦截回滚、防篡改、替换 winston。

### 3.2 已确认产品决策

| 决策点 | 结论 |
|---|---|
| 覆盖范围 | 管理面写操作全覆盖（代码按里程碑交付） |
| 访问权限 | 内置 API + `authWithBuiltinApiGuard`；**查询默认仅 SUPER_ADMIN** |
| 记录机制 | 混合式：中间件（HTTP）+ 共享 `writeOperationLog`（HTTP 与 server_builtin 共用） |

### 3.3 记录机制（修订后）

```
管理请求（写操作）
     │
     ▼
 auth / builtinApiGuard          ← 401/403 不进入审计
     │
     ▼
 operationAudit(config)          ← try/finally；成败看信封 code
     │
     ▼
 控制器（可选 ctx.state.auditContext）
     │
     ▼
 writeOperationLog(record)       ← 唯一落库点；测试可同步
     │
     ▼
 eadaf.operation_logs
```

非 HTTP 写（server_builtin 物化 / 灌 mock）在 handler 末尾直接调 `writeOperationLog`。

路由声明示例与原文一致，但 `resourceId` 对 CREATE 必须能从响应取 ID（各域字段名不同：`user_id` / `id` / `data.item.id`，**逐路由写清**，禁止假设都是 `user_id`）。

`resolveOperator`：

| 条件 | operator_type | operator_id | application_id | operator_name |
|---|---|---|---|---|
| `ctx.state.user` | USER | `user_id` | null | JWT `username`（有 auditContext 可覆盖为展示名） |
| `ctx.state.application` | APPLICATION | null | `application_id` | `application.name` |
| 内部调度显式传入 | SYSTEM | null | null | `system` |
| 已进入业务但无主体 | ANONYMOUS | null | null | null |

禁止「均无 → SYSTEM」。

### 3.4 数据库（修订 DDL）

迁移脚本：`backend/scripts/migrate-operation-log-audit.sql`，幂等，挂入 `initdb.sh`（紧挨 `migrate-builtin-api-system.sql` 之后即可）。

```sql
BEGIN;

ALTER TABLE eadaf.operation_logs
  ADD COLUMN IF NOT EXISTS operator_id UUID,
  ADD COLUMN IF NOT EXISTS operator_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS operator_type VARCHAR(20) NOT NULL DEFAULT 'USER',
  ADD COLUMN IF NOT EXISTS application_id UUID,
  ADD COLUMN IF NOT EXISTS resource_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS domain VARCHAR(50),
  ADD COLUMN IF NOT EXISTS ip VARCHAR(45),
  ADD COLUMN IF NOT EXISTS user_agent VARCHAR(500),
  ADD COLUMN IF NOT EXISTS trace_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS request_summary JSONB;

-- 加宽 resource_id（存量 UUID 不受影响）
ALTER TABLE eadaf.operation_logs
  ALTER COLUMN resource_id TYPE VARCHAR(200);

-- 约束用独立 CHECK，避免 ADD COLUMN IF NOT EXISTS 与 CHECK 组合在重跑时踩坑
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'operation_logs_operator_type_check'
  ) THEN
    ALTER TABLE eadaf.operation_logs
      ADD CONSTRAINT operation_logs_operator_type_check
      CHECK (operator_type IN ('USER', 'APPLICATION', 'SYSTEM', 'ANONYMOUS'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at
  ON eadaf.operation_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_logs_operator_id
  ON eadaf.operation_logs (operator_id);
CREATE INDEX IF NOT EXISTS idx_operation_logs_domain_created_at
  ON eadaf.operation_logs (domain, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_logs_trace_id
  ON eadaf.operation_logs (trace_id);

COMMIT;
```

模型 `operation_log.js` 同步新列。`models/index.js` 现有 `User.hasMany(OperationLog, { foreignKey: 'user_id' })` 保持「目标用户」语义；**不要**把 `operator_id` 接成默认 `belongsTo` 以免和 `user_id` 混淆。若要 include 操作者，显式 `as: 'Operator'`。

IP：仓库**没有**现成 `clientIp`，`app.proxy` 也未开。实现：`x-forwarded-for` 取第一段（截断 45）否则 `ctx.ip`；生产反代后再考虑 `app.proxy = true`（本功能不顺手改全局代理语义）。

### 3.5 全域覆盖清单（补漏 + 明确不记）

记录原则不变：**管理面写操作全记；例行读不记；数据面不记；手动触发执行记 EXECUTE。**

在原文 §7 基础上补模块，并标出「中间件不够、要服务层补记」：

| 域 | 必须覆盖（原文未写或写不全的） | 不记 |
|---|---|---|
| `auth` | LOGIN 成功、LOGOUT（挂 `authController`） | 登录失败、验证码、refresh |
| `user` | CREATE / UPDATE / DELETE / RESTORE / STATUS_CHANGE / RESET_PASSWORD / CHANGE_PASSWORD / ASSIGN_ROLES；**update 里带 password 仍记 UPDATE，快照不含哈希** | 头像上传可记 UPDATE（有则挂，无则 M4 末尾补） |
| `role` | CREATE / UPDATE / DELETE / ASSIGN_PERMISSIONS | `check-permission` |
| `department` | CREATE / UPDATE / DELETE / ASSIGN_ROLES | |
| `permission` | CREATE / UPDATE / DELETE / 规则 CREATE / ASSIGN_ROLE | |
| `application` | CREATE / UPDATE / DELETE / 密钥重置 / top-level-skill | SSO **GET**、`POST /token` |
| `bizdata` | 实体/字段/枚举/关系 CRUD、连接 CRUD、数据标准、元数据、指标与卡片 CRUD、**手动物化 EXECUTE**、scope-doc UPSERT；AI builtin 物化/灌 mock **服务层补记** | preview、连接 test、browse 读 |
| `apiservice` | CREATE / UPDATE / DELETE / PUBLISH / UNPUBLISH / ENABLE / DISABLE | resolve-connection、check-handler、suggest-test-params、saveTestMockParams、**Admin test**（测试台可回滚，归运行侧；不记操作日志） |
| `outbound`（可并入 `apiservice` domain，`resource_type=outbound_webhook`） | CREATE / UPDATE / DELETE / PUBLISH / DISABLE | test |
| `exception`（可并入 `apiservice`） | 异常模板 CREATE / UPDATE / DELETE | |
| `ai` | provider / model / scope / tool / skill CRUD | 对话、tools/invoke、http-request（P2 可观测性） |
| `storage` | bucket CRUD、**对象删除** | 上传/TUS（量太大，对象删除才记）；dedup-check |
| `collection` | 管道 CRUD / PUBLISH / DISABLE / 手动运行 EXECUTE | ingest 数据面、validate/test |
| `automation` | 钩子 CRUD / ENABLE / DISABLE / 测试 EXECUTE / Run 重试 EXECUTE | validate-script |
| `system` | features UPDATE、手动备份 EXECUTE、**builtin_api_configs 的 restriction 变更** | features GET、备份列表 |
| （不记） | Data API、AI 对话、公开路由、采集 ingest、钩子定时/事件触发本身 | |

M4 交付物必须附一张「路由 × 是否挂 audit」对照表，启动期自检（扫描 admin 写方法未挂中间件则 warn）可放 M5，但对照表 M4 就要有。

### 3.6 查询 API

路径、分页钳制、筛选参数、列表排除 JSONB 与原文 §8 一致。

实施注意：

- 控制器**不要**照抄 `aiRequestLogController.formatLog` 的瘦字段集；列表/详情用两套 mapper；
- 错误处理跟本域惯例：`try/catch` + `{code,message,data}`（`sendError` 并非全局工具，各控制器本地函数）；
- 路径参数用 `:log_id`（与 PK 对齐）可以，前端 service 必须同一字段名；
- Swagger tags：`[Admin-Operation-Logs]`，`security: [{ bearerAuth: [] }]`。

M5 的 export / stats 保持可选。

### 3.7 权限（含 §9.2 修订）

catalog 两条保持原文：`system:operation_log:list` / `get`。

**§9.2 修复范围扩大到一个函数**：

`assertBuiltinApiAccess` 在用户令牌且 restriction 为 role/department 时：

1. `roleIds` 缺失 → 查 `user_roles`（60s 内存缓存，key=`user_id`）；
2. `departmentId` 缺失 → 查 `users.department_id`（可与上同一缓存条目）；
3. 角色 `code === 'SUPER_ADMIN'` **放行**（即使 roleIds 配置漏了该角色 ID）。

缓存不在角色变更时主动失效（60s 可接受）。第三方应用 scope 路径不动。

seed：

```sql
-- 菜单：系统分组（/system → system:manage）
INSERT INTO eadaf.permissions (...)
VALUES ('660e8400-e29b-41d4-a716-446655440090', 'system:manage', '系统管理', 'MENU', '["read"]', ...)
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description, updated_at = CURRENT_TIMESTAMP;

INSERT INTO eadaf.builtin_api_configs (code, access_restriction) VALUES
  ('system:operation_log:list', '{"mode":"role","roleIds":["10000000-0000-0000-0000-000000000001"]}'::jsonb),
  ('system:operation_log:get',  '{"mode":"role","roleIds":["10000000-0000-0000-0000-000000000001"]}'::jsonb)
ON CONFLICT (code) DO UPDATE SET access_restriction = EXCLUDED.access_restriction;
```

**禁止**在本迁移里改 `440082` 那组重复 permission_id。

### 3.8 前端

新建 `pages/System/OperationLogs/index.tsx` + `schema.tsx`，Mode-1 列表：`PageContainer` 隐藏页头 + `UrlSyncedProTable` + `DEFAULT_PRO_TABLE_OPTIONS` + `useProTableSearchCollapse('system.operation-logs')` + `TableActions`。

比 RequestLogs 参照多做的：筛选项真正传给 API（domain / operationType / status / operatorName / keyword / 时间范围 / traceId）。

注册：

| 文件 | 修订后动作 |
|---|---|
| `semanticRegistry.ts` | 增加 `{ path:'/system', to:'/system/operation-logs', scopeGroup:'system' }` 以及 operation-logs 页 entry（`pageKey:'operationLogs'`，`actions:['list']`） |
| `routeElements.tsx` | `operationLogs: lazy(() => import('@/pages/System/OperationLogs'))` |
| `routeUi.ts` | `/system`: `{ name:'系统', icon:'SettingOutlined' }`；`/system/operation-logs`: `{ name:'操作日志', icon:'AuditOutlined' }`。`/system/settings` 保持 hideInMenu |
| `AppLayout.tsx` | **不改** |
| `services/EADAF/api/adminOperationLogs.ts` | 手写，对齐 `adminAiRequestLogs.ts` |
| `enums.ts` | `OPERATION_LOG_DOMAIN` / `OPERATION_LOG_TYPE` / `OPERATION_LOG_STATUS` |

存量 `operator_*` 为空显示「—」，hover「历史数据未记录操作者」。

资源页「操作记录」跳转、old/new 字段 diff：M5。

### 3.9 现有 7 处写入迁移

| 原文位置 | 修订 |
|---|---|
| user UPDATE / DELETE / RESTORE / RESET_PASSWORD | 挂中间件 + auditContext；删 inline `create` |
| user LOGOUT | **不迁这个函数**；改挂 `authController.logout`；删除死代码 `userController.logout` |
| role UPDATE / DELETE | 同用户域 |

`operation_type` / `resource_type` / 目标 `user_id` 取值保持兼容，便于以后若有人查旧日志。

### 3.10 性能 / 兼容

与原文 §11–§12 一致，加上：

- `setImmediate` 前**先组好纯 JSON record**（不要在回调里再读 `ctx`）；
- 进程崩溃丢尾部 1–2 条可接受（R5）；
- `operatorName` / `keyword` 的 `iLike` 不做额外索引（量级够用）。

### 3.11 测试

| 层 | 用例 |
|---|---|
| `writeOperationLog` + 中间件 | 信封 200+HTTP200 = SUCCESS；信封 400+HTTP200 = FAILED；throw 经 errorHandler = FAILED；auditContext 优先；USER/APPLICATION/ANONYMOUS；脱敏键与点路径；summaryKeys；写库失败不阻断；`OPERATION_AUDIT_SYNC` |
| 查询 API | 分页钳制；筛选；列表无 JSONB；详情 404；restriction 后非超管 403 |
| 权限修复 | roleIds/departmentId 回查与缓存；SUPER_ADMIN code 放行；应用 scope 不受影响 |
| 无「存量 user.test.js」可回归 | 不要写进验收清单 |

前端以 GUI 实测为主（列表筛选、URL 同步、详情 JSON、超管可见/普通用户 403）。

### 3.12 里程碑（修订）

| 里程碑 | 内容 |
|---|---|
| **M1 地基** | 修订后 DDL + 模型 + `writeOperationLog` + `operationAudit`（try/finally + 信封成败）+ `redactFields`（键+路径+截断）+ 同步开关 + verify |
| **M2 查询+权限** | 路由/控制器/Swagger/catalog + **roleIds 与 departmentId 回查** + SUPER_ADMIN 放行 + 权限/菜单 seed + API verify |
| **M3 前端** | 日志页 + `/system` 分组根 + service/enums；**不改** iconMap |
| **M4a IAM 接入** | auth/user/role/department/permission/application（含死 LOGOUT 清理） |
| **M4b 业务域接入** | bizdata（含 builtin 补记）、apiservice/outbound/exception、ai、storage、collection、automation、system/builtin_api_configs；附路由对照表 |
| **M5 可选** | CSV+EXPORT 自审计、统计、180 天清理、diff 视图、资源页入口、启动期未挂中间件 warn |

「一步到位」指产品范围，不指一个 PR。M4 拆两批，避免八十多条写路由一次漏挂。

---

## 4. 风险（修订后仍成立的）

- **R1** 不修 §9.2 就插入 role restriction = 全员 403。M2 已含修复，且 Q1 已拍板收紧。
- **R2** 逐路由声明仍会漏。缓解=M4 对照表 + M5 启动 warn。
- **R3** 快照膨胀。M1 起截断 2KB / 只留标量+变更字段。
- **R4** 业务与日志非同一事务。保持：写失败只打 winston。
- **R5** 异步丢尾。可接受。
- **R6（新增）** HTTP 200 + 信封 400 记成 SUCCESS。已用 §2.1 消掉。
- **R7（新增）** server_builtin 绕过。已用共享 writer + M4b 清单消掉。
- **R8（新增）** `operator_id` FK 导致删用户失败或 APPLICATION 插不进去。已用无 FK + `application_id` 消掉。

---

## 5. 修订记录

| 版本 | 日期 | 说明 |
|---|---|---|
| v0.1 | 2026-09-01 | 原文初稿（待审阅） |
| v0.2 | 2026-09-01 | Review 修订稿：信封成败、try/finally、共享落库、DDL/覆盖面/LOGOUT/测试/权限回查纠偏；Q1–Q5 拍板 |
