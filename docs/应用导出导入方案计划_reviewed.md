# 应用导出/导入 方案计划 — Review 修订稿

> Review 对象：[docs/应用导出导入方案计划.md](应用导出导入方案计划.md)  
> 核查基准：`uac.applications` / 两套 Scope、`bizdata` 实体与物化、API/管道/Webhook、`aibase` Skill/Tool/Provider、`automation.hooks`、对象存储桶、`builtinApi/catalog`、系统设置 Tab、备份恢复上传模式  
> Review 日期：2026-09-07 · 方式：方案中全部事实断言逐条对照源码核查（file:line 为证）  
> 状态：**以本文为准的实施蓝本**（原文保留作历史；落地请按本文执行）

关联：现有整库备份 `systemRoutes.js` + `systemService.restoreBackup`（`.dump`，非本功能替代品）。

---

## 0. 总评

**方向通过，不能按原文直接开工。**

产品判断成立：

- 需要按应用维度的 JSON 迁移，区别于现有 `.dump` 整库备份；
- 入口放系统设置 Tab、导出/导入分 Modal、冲突策略三分法，交互可落地；
- 数据域 Scope（冒号 code 虚拟树）与 AI 域 `aibase.scopes` 必须分开处理；
- 专用 Skill 走 `skill_applications`、敏感字段要警示，方向对。

核查同时发现三类必须改掉的问题：

1. **会写错库 / 拆散引用的机制缺陷**（导入连接、行数据 UUID、分节失败互不影响、密文跨实例）。
2. **筛选规则自相矛盾**（实体用原始 `bizdata_scope_codes` 前缀，管道/Webhook 却用首段膨胀后的 `T(A)`；Skill 导出全部 `is_global`）。
3. **漏模块 + 与代码不符的接线**（enums/relations/metrics/hooks/存储桶、双唯一键 `route_path`/`function_name`、连接 `name` 非唯一、`entity_fields` 无 version、catalog 未登记则放行）。

修订稿保留原文产品决策（系统设置入口、JSON 单文件、冲突三策略、不做整库/菜单/对象文件内容），只改「筛什么、按什么键对齐、怎么接到现网上」。原文 §11 待确认问题在本文拍板，不再悬空。

---

## 1. 事实核查表（逐条）

图例：✅ 属实 · ⚠️ 属实但需补充精度 · ❌ 不属实

### 1.1 前提认知

| # | 方案断言 | 结论 | 证据 |
|---|---|---|---|
| 1 | 主存储 PostgreSQL，schema：`uac` / `aibase` / `bizdata`；物化在目标库 `bizdata_mat` | ⚠️ | Sequelize 默认 schema 是 `uac`（`config/database.js:16` + `config/index.js:64`）。`aibase`/`bizdata` 由各模型显式指定。物化默认 schema 是连接上的 `target_schema`（种子为 `bizdata_mat`，`bizdata-schema.sql:96,114`），**未必**在「本实例 PG」——连接可指向外部 PG/MySQL |
| 2 | 应用与 Scope 无关联表，`bizdata_scope_codes` JSONB 数组 | ✅ | `models/application.js:74-79` |
| 3 | 数据域 Scope 为虚拟树，顶层 = code 首段，无独立 Scope 表 | ✅ | `bizdataScopeUtils.js`；`businessDataService.listScopes` 从实体 code 推导（`:824-834`） |
| 4 | AI 域 `aibase.scopes` 扁平表，仅 tools/skills 的 `scope_id`，与数据域不是同一体系 | ✅ | `models/scope.js`；`models/index.js:102-106` |
| 5 | 实体结构在 `entities` + `entity_fields`（带 version）；行数据在物化物理表 | ⚠️ | **version 只在 `bizdata.entities`**（`bizdata-schema.sql:31`），`entity_fields` 无 version。物化经 `database_connections` 连 PG/MySQL/Mongo/Redis（`materializedTableBrowseService.js:7-12,17-28`） |
| 6 | 专用 Skill：`is_dedicated` + `skill_applications` | ✅ | `skillController.js:92-128`；全局与专用互斥（`:121-124`） |
| 7 | outbound webhook 无 scope 字段，靠绑定 API 的 code 首段 | ⚠️ | 表上确实无 scope（`outbound_webhook.js`）。但**应用侧已有** `outbound_webhook_scope`（`application.js:68-72`），匹配逻辑是 `webhookCodes` 精确 + `domainCodes` 前缀（`applicationApiCatalogService.js:254-271`）。方案用 `T(A)` 筛 webhook 与现网授权不一致 |
| 8 | 无业务 JSON 导入导出；仅 `.dump` 与对象存储下载 | ✅ | `systemRoutes.js` 只有 features/backups；对象存储是另一套 |
| 9 | 系统接口守卫：`authWithBuiltinApiGuard` + `operationAudit` | ⚠️ | 写操作确实如此。**未在 catalog 登记的路由，guard 直接放行**（`requireBuiltinApiPermission.js:18-21`）。现网 `system:backup:restore` 就没登记。新接口必须真登记，否则鉴权形同虚设 |

### 1.2 前端与入口

| # | 方案断言 | 结论 | 证据 |
|---|---|---|---|
| 10 | Settings `Tabs.items` 目前三项，可追加 | ✅ | `pages/System/Settings/index.tsx:10-14` |
| 11 | `tabs.tsx` 已 450 行，不宜再加厚 | ✅ | 文件止于 L450 |
| 12 | 应用列表 `GET /api/v1/applications` | ✅ | `applicationRoutes.js` prefix + `getApplications`（`services/EADAF/api/applications.ts`） |
| 13 | 内置应用 code = `EADAF` | ✅ | `applicationController.js:15` `SYSTEM_APPLICATION_CODE`；`builtinApiPermissionService.js:5-6` |
| 14 | 下载复用 `triggerBlobDownload` | ✅ | `FileStorage/Browser/index.tsx:52-61`。但该处拿的是 **blob 响应**，不是把 JSON envelope 再转 Blob |
| 15 | 恢复 Modal 交互可参考 `tabs.tsx:251-282`；超时 30 分钟 | ✅ | `system.ts:51` `timeout: 30 * 60 * 1000`；上传 `beforeUpload={() => false}` |
| 16 | 导出接口把整份 payload 放在 `{ data: { fileName, payload } }` 由前端落盘 | ❌ | 与备份模式相反。备份是服务器写 `.dump` 文件。1GB JSON 进 envelope → umi `request` 解析 → 再 `JSON.stringify` 成 Blob，内存 2～3 倍。应 **`Content-Disposition` 附件流式下载** |
| 17 | 前端 `JSON.parse` 预校验 format | ❌ | 大文件会卡死浏览器。预览必须走后端 `/preview`（P2 升为 P1 必做，禁止可选） |

### 1.3 唯一键与关联

| # | 方案断言 | 结论 | 证据 |
|---|---|---|---|
| 18 | applications/entities/api_services/pipelines/webhooks 按 `code` | ⚠️ | `code` 确实 UNIQUE。但 **`api_services.route_path`、`collection_pipelines.route_path` 也是 UNIQUE**（`bizdata_api_service.js:15-18`、`bizdata_collection_pipeline.js`）。只按 code upsert 会撞 route_path |
| 19 | aibase scopes/tools/skills/providers/models 按 `slug` | ⚠️ | slug 均 UNIQUE。**`tools.function_name` 另外 UNIQUE**（`tool.js:23-26`）。只按 slug 会撞 function_name |
| 20 | departments 无唯一键，按 name+父链 | ✅ | `schemas.sql:18-27` 无 UNIQUE(name) |
| 21 | `database_connections` 按 `name` 匹配 | ❌ | **`name` 不是 UNIQUE**（`bizdata-schema.sql:87-90`，模型无 unique）。且跨实例导入连接会把目标指向**源库 host**（见 §3.1） |
| 22 | users 按 username；roles/permissions 按 code | ✅ | `schemas.sql:37-38,49,67` |
| 23 | builtin_api_configs 按 code | ✅ | PK 就是 `code`（`builtin_api_config.js:12-16`） |
| 24 | 软删表导出仅未删除记录 | ⚠️ | paranoid 的是 applications/users/departments/roles/permissions/`data_permission_rules`（`models/*.js`）。**entities / api_services / skills 不是 paranoid** |

### 1.4 导出范围缺口

| # | 方案断言 | 结论 | 证据 |
|---|---|---|---|
| 25 | 实体附带 fields + scope_docs + 用到的 connections | ⚠️ | 漏 **`bizdata.enums`**（code UNIQUE）、**`bizdata.relations`**（实体图，无业务唯一键）。有关系的实体导入后 ER 断裂 |
| 26 | API 附带 operations + permissions；排除 runs | ✅ 方向对 | 仍漏 **`api_exception_responses` 不必随应用**（全局按 HTTP 状态码 UNIQUE，属实例级，v1 不导出） |
| 27 | 管道筛「code 首段 ∈ T(A)」 | ❌ 过宽 | `collection_pipeline_applications` 是 **restrict_sources 来源白名单**，不是所有权（`applicationApiCatalogService.js:178-183`）。应用实际数据范围是 `bizdata_scope_codes` 原值前缀，不是首段膨胀 |
| 28 | Skill = 全部 `is_global` + 绑定 A 的 dedicated | ❌ | `filterSkillsForContext`：global 对**任意应用**可见，dedicated 才按应用过滤；**既非 global 也非 dedicated 的 Skill 对 capabilities 不可见**（`skillController.js:535-553`）。导出全部 global = 把平台 EADAF/AI 管理助手打进业务应用包 |
| 29 | 勾选 AI 则 providers/models/capabilities/ioTags **全量** | ⚠️ 事实如此可做，语义错误 | 这是实例级配置，不是应用级。现成对照：`scripts/export-aibase-ai-seed.js` 已能导出整份 aibase 种子 |
| 30 | 前端文案「8 类内容」 | ❌ | 第 4 节是 10 条；且 7～10 受勾选控制 |
| 31 | 组件名 `AppTransferSettingsTab` vs 文件 `AppTransferTab.tsx` | ❌ | 原文 3.1 自相矛盾，实施时统一为文件名 `AppTransferTab.tsx`、导出 `AppTransferTab` |

### 1.5 现网还有、原文未写的应用数据

这些不是「后续扩展」，漏了则目标实例上的应用不完整：

| 模块 | 关联方式 | v1 处理 |
|---|---|---|
| `bizdata.metrics` + `metric_cards` | `metrics.scope_code`、`metric_cards.domain_code` 均可前缀命中 | **纳入结构导出**（排除 `metric_runs` / `metric_values`） |
| `automation.hooks` | 无 code；`event_filter` 常指向 API/实体 | **纳入**：筛 `event_filter` 命中本次导出的 apiService/entity code；upsert 键 `(name, event_type)`（表无 UNIQUE，导入前按此查） |
| `uac.storage_buckets` | 有 `application_id` | **只导桶元数据**（code UNIQUE），**不导对象文件**（与原文「存储桶文件内容不做」一致） |
| `bizdata.data_standards` | 元数据治理，弱关联 | v1 **不导出**（无稳定应用边界） |

---

## 2. 原文待确认问题 — 本 Review 拍板

| # | 原问题 | 拍板 |
|---|---|---|
| 1 | 「应用配置中 EADAF 的应用数据」指什么 | **所选应用在 `uac.applications` 的完整配置行**（含 `api_*` / `sso_*` / `bizdata_scope_codes` / `top_level_skill_markdown`）。**不是**内置系统应用 EADAF 的 `docs/eadaf-api-skill` 或内置 API catalog。EADAF 自身禁止出现在导出下拉中 |
| 2 | 「无论如何，结构一定导出」 | 拆成两句，避免和 EADAF 勾选搅在一起：**(a) 数据实体/API/管道/Webhook/指标/钩子/专用 Skill 的结构始终导出**，与是否勾选「含用户」无关；`dataMode=data_only` 仍然带实体结构（至少 code+version+fields），否则目标无法做版本校验。**(b) EADAF：不勾选则只导出被引用的 permissions（及作为 grant 目标的 roles 定义），不导出用户/部门/授权行。** 不要理解成「全量角色目录始终导出」 |
| 3 | API 服务筛选 | **保持 `api_data_scope` 优先**（`serviceCodes` 精确 + `domainCodes` 前缀），空则回退 **`bizdata_scope_codes` 原值前缀**（不要用 `T(A)` 首段膨胀）。不要改成「只导 `grant_type=application` 绑定的服务」——授权给角色的服务仍属于该应用数据域 |
| 4 | 非 PG/MySQL 行数据 v1 跳过 | **接受**。说明：browse 服务已支持 Mongo/Redis，这是产品取舍不是做不到。导出摘要里必须列出跳过的实体 |
| 5 | 内置应用 EADAF 能否导出 | **禁止**。下拉过滤 `code === 'EADAF'`；后端再拒一次。该应用承担内置 API 全量放行（`builtinApiPermissionService.js:5-6`），导出它等于搬平台 |
| 6 | 冲突默认「覆盖更新」 | **保持 overwrite 默认**，但必须 `modal.confirm`（原文已有）。`abort` 作为预检用途，不改成默认 |

---

## 3. 必须改掉的设计（按优先级）

### 3.1 P0 — 禁止把源库连接导入目标

原文按 `name` 匹配连接，匹配不到还「创建或回退默认」。`name` 非唯一，且文件里带 `host/port/password_enc`。

若在目标实例 **创建** 这条连接，目标会连上**源环境数据库**，导入行数据等于往源库写——这是事故。

**修订：**

- 连接**只匹配、不创建**。
- 匹配顺序：`is_default && db_type` 相同 → `(db_type, target_schema)` → `name`（仅提示用）。
- 匹配失败：该实体行数据标记失败，**不准**用错误连接兜底写入。
- 文件里仍可带连接的 `id/name/db_type/target_schema` 作为匹配提示；**不导出密码密文，不在目标插入 `database_connections` 行。**

### 3.2 P0 — 行数据保留原主键，禁止给行 UUID 重新生成

原文「导入时所有 UUID 重新生成」若作用在物化表行上，实体间 FK、自引用、采集管道写入的 id 会全部断裂。`relations` 描述的就是这些边。

**修订：**

| 层 | UUID 策略 |
|---|---|
| 元数据表（entities、fields、api_services、skills…） | **重映射**（原文 idMap 保留） |
| 物化表行数据 | **保留源主键值**；冲突按策略 truncate+insert / skip / abort |
| 行内指向元数据的 id（极少） | 不处理；物化行应只含业务列 |

`overwrite` 行数据 = 对该表 `TRUNCATE`（或 `DELETE FROM`）后按 columns 批量插入，同事务（连接库内）。不要静默 `INSERT` 撞主键。

### 3.3 P0 — 密文不可跨实例原样搬

`encryptApiKey` 使用本实例 `ENCRYPTION_KEY`（`config/index.js:127`，`utils/encryption.js`）。另一台机器密钥不同，密文解密必失败。

**修订：**

- 导出时对 `providers.api_key_encrypted`、`outbound_webhooks.auth_secret_enc`、`applications.api_connect_config.app_secret` / `sso_config.client_secret` **解密后写入文件明文段**（文件本身已是机密，Modal 警示保留）。
- 导入时用**目标** `ENCRYPTION_KEY` 重新加密。
- `database_connections.password_enc`：v1 不导出（见 3.1）。
- `users.password_hash`：这是 bcrypt 哈希不是 AES，**可原样**（与密钥无关）；仅 `includeUac=true` 时带。
- 文件头 `options.secretsInPlaintext: true`，导入前校验，避免以后有人改回「带密文」还误以为能用。

### 3.4 P0 — 分节失败策略

原文「失败节不影响其他节」会留下半套应用（有 API 无实体、有 Skill 无应用 id）。

**修订：**

- **依赖链上的节失败 → 终止后续节**（仍返回已完成节的计数，不回滚已提交的外部库行数据——这一点必须在结果里写清楚）。
- 依赖链：`uac` 最小结构 → `application` → `entities`（+enums/relations/scope_docs）→ 物化 → `entityData` → `apiServices` → `collectionPipelines` → `outboundWebhooks` → `metrics` → `hooks` → `skills` → `storageBuckets`。
- **可选节**（`includeUac` 的用户数据、`includeAi` 的 providers）失败不阻断主链，单独标红。

主库各节用一个 Sequelize 事务能包则包；物化与行数据在外部连接，**无法**与主库同事务（原文这句保留）。

### 3.5 P0 — 筛选统一用「应用已配置的前缀」，禁止 T(A) 首段膨胀

原文例子：`bizdata_scope_codes = ["IPS","CRM:bom"]` → `T(A)={"IPS","CRM"}`。于是管道/Webhook 会带上整个 `CRM:*`，而实体只导 `CRM:bom*`。

**统一函数（与 `matchesApiDataScope` 同形）：**

```js
function prefixHit(code, scopes) {
  const c = String(code || '');
  return (scopes || []).some((s) => c === s || c.startsWith(s + ':'));
}
```

| 内容 | 筛法 |
|---|---|
| 实体 / 枚举 / 指标 | `prefixHit(code, A.bizdata_scope_codes)` |
| 指标卡片 | `prefixHit(domain_code, A.bizdata_scope_codes)` |
| 实体关系 | 两端实体都在本次实体集合内才导出（缺一端则列入 preview 警告，仍导出边并在导入时 skip） |
| scope_docs | code 落在本次实体祖先路径上（`buildScopeAncestorCodes`） |
| API | `api_data_scope` 优先，空则 `prefixHit(service.code, bizdata_scope_codes)` |
| Webhook | **`matchesOutboundWebhookScope(webhook.code, A.outbound_webhook_scope)`**；若 scope 全空，再回退「绑定的 `trigger_api_service_code` 落在本次 API 集合」 |
| 管道 | `prefixHit(pipeline.code, A.bizdata_scope_codes)`；`collection_pipeline_applications` 只保留 `application_id === A` 的行（其它应用 id 目标不存在） |
| 钩子 | `event_filter` JSON 字符串/字段中出现本次导出的 entity/api code；或 `event_type` 属于应用域且 filter 为空（preview 列出供人确认） |
| 专用 Skill | `is_dedicated && skill_applications.application_id === A`（**不含**全部 `is_global`） |
| 附带 tools / aiScopes | 仅上述 Skill 经 `skill_tools` 引用到的 tools，及其 `scope_id` 对应的 `aibase.scopes` |
| 应用本体 | 始终 |
| 存储桶 | `storage_buckets.application_id === A` |

`is_global` Skill、全量 providers：**只有 `includeAi=true` 才导出**，并在 UI 标明「这是实例级 AI 目录，会 upsert 到目标 aibase，不是应用私有数据」。默认否。

### 3.6 P1 — 双唯一键冲突

导入前除主键映射外，必须检测第二唯一键：

| 表 | 业务键 | 额外冲突键 |
|---|---|---|
| api_services | code | route_path |
| collection_pipelines | code | route_path |
| tools | slug | function_name |
| metric_cards | code | — |
| storage_buckets | code | — |

`overwrite`：按业务键更新；若业务键未冲突但第二键撞了**另一条**目标记录 → 该条 `failed`，不要静默改别人的 route。  
`abort`：两类键任一冲突都列入清单。

### 3.7 P1 — 物化不是「导完结构就能写数」

`executeMaterialization` 对 PG 是 `CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS`（`materialization/dialects/postgresql.js:91-102`），**不会删列、不会改类型**。

**修订：**

- 导入结构后对本次实体调用 `executeMaterialization({ connectionId: 匹配到的目标连接, expectedVersions, createTargetIfMissing: true })`。
- 版本校验用**目标实体当前 version** 与文件 `entityData.entityVersion` 比，不要用源 `entity.id` 填 `expectedVersions`（导入后 id 已变；`executeMaterialization` 按 `ent.id` 查期望版本，`:227-232`）。
- 列不兼容（缺列、类型变了）→ 该表行数据 `failed`，错误里带 DDL 差异，不要硬 INSERT。

### 3.8 P1 — `dataMode=data_only` 与「结构始终导出」

原文第 4 节第 2 条「结构始终导出」，第 3 条又写仅数据。两者并存会让实现分叉。

**修订：** `dataMode` 只控制 **要不要带 `entityData[].rows`**。`entities`（含 fields/enums/relations）**任何模式都导出**。UI 文案改为：

- 「结构和数据」（默认）
- 「仅数据（仍带结构指纹，供目标做版本校验；目标无同 code 实体则跳过写数）」

不要承诺「目标已有同版本结构就可以不带结构」——文件里没有结构指纹就无法校验。

---

## 4. 修订后的导出文件格式

保留 `format: "eadaf-app-export"`、`formatVersion: 1`。相对原文增减如下：

**`options` 增补**

```jsonc
{
  "dataMode": "structure_and_data", // | "data_only"
  "includeUac": false,
  "includeAi": false,
  "secretsInPlaintext": true
}
```

**节（有则写，无则 `[]` / 省略均可，导入按缺省空）**

| 节 | 相对原文 |
|---|---|
| `application` | 保留；密钥类字段为**明文**（见 3.3）；`logo_url` 原样（对象存储未迁，目标可能 404，preview 警告） |
| `entities.items/fields/scopeDocs` | 保留；**不**含 `connections` 密码；改 `connectionsHint[]`: `{ sourceId, name, dbType, targetSchema, isDefault }` |
| `entities.enums` | **新增** |
| `entities.relations` | **新增**（from/to 用源 entity id，导入走 idMap） |
| `entityData` | 保留；rows **保留原 PK** |
| `apiServices` | 保留 |
| `collectionPipelines` | 保留；`applications` 只含本应用 |
| `outboundWebhooks` | 保留；`auth_secret` 明文 |
| `metrics.items` + `metricCards` | **新增** |
| `hooks.items` | **新增**；`action_config` 内 http 密钥按 3.3 明文 |
| `skills` | 默认只有 dedicated + 其 tools/aiScopes/skillApplications(本应用)。`includeAi` 才追加 global skills 与 providers/models |
| `ai` | 仅 `includeAi` |
| `uac` | 同原文；不勾选时只填被引用的 roles/permissions（及必要的 role_permissions 边） |
| `storageBuckets` | **新增**元数据，无 objects |

文件名仍：`eadaf-app-export-{appCode}-{yyyyMMddHHmmss}.json`。

---

## 5. 修订后的后端接口

仍挂 `prefix: '/api/v1/system/app-transfer'`，中间件 `authWithBuiltinApiGuard` + 写操作 `operationAudit`。

| 接口 | 方法 | 行为（相对原文的改动） |
|---|---|---|
| 导出 | `GET` 或 `POST /export` | **响应体就是 JSON 文件**（`Content-Type: application/json`，`Content-Disposition: attachment; filename="..."`）。不要包 `{ code, data: { payload } }`。权限码见下。Body/query 仍用 `{ applicationId, dataMode, includeUac, includeAi }` |
| 预览 | `POST /preview` multipart `file` | **P1 必做**。返回节条数、冲突（含第二唯一键）、连接匹配结果、跳过的 Mongo/Redis 实体、缺失引用 |
| 导入 | `POST /import` multipart `file` + `strategy` | 同原文 1GB / 临时目录 / 只收 `.json`；超时 30 分钟。结果分节 |

**不要**让前端先 `JSON.parse` 再 POST JSON body——大文件走 multipart 临时文件，与 backup restore 相同。

### 5.1 权限码（必须登记，否则 guard 放行）

在 `services/builtinApi/catalog.js` 的 system 域追加，并同步 `scripts/eadaf-permissions-catalog-seed.sql`（**禁止**复用已占用的 permission 数字后缀，参见操作日志 review 对 082 的警告）：

| code | method + path |
|---|---|
| `system:app_transfer:export` | `POST /api/v1/system/app-transfer/export`（若用 GET 则改 catalog `httpMethods`） |
| `system:app_transfer:preview` | `POST /api/v1/system/app-transfer/preview` |
| `system:app_transfer:import` | `POST /api/v1/system/app-transfer/import` |

路由文件写 **Swagger 注释**（本仓库约定）。`operationAudit`：export 可记只读摘要（applicationId/fileName/bytes），import 必记 strategy + 分节计数。

对照：现网 backup **restore 未进 catalog**，不要照抄这个缺陷。

### 5.2 导出实现要点

- 服务：`services/appTransfer/appExportService.js`，按 §3.5 筛，按节 `findAll`。
- 行数据：仅 `postgresql` / `mysql`；复用 `materializedTableBrowseService` 的 `withPgClient` / `withMysqlClient` 做 `SELECT`；列集来自信息架构或 entity_fields。
- 预留 `maxRowsPerEntity` 环境变量，**v1 默认不截断**，但超过 10 万行在 preview/导出摘要里警告。
- 流式：控制器 `ctx.body = Readable.from(jsonStringOrIterate)` 或先写临时文件再 `createReadStream`，避免整份字符串 + Koa 再拷一份。单节点内网可接受，但禁止「整包进 envelope」。

### 5.3 导入实现要点

- `idMap` 只覆盖元数据表。
- 连接匹配见 3.1。
- 行数据见 3.2。
- relations upsert 键：`(type, name, fromEntityCode, toEntityCode)`（导入时 code 已就绪）。
- hooks upsert 键：`(name, event_type)`，匹配多条则 `failed` 并要求人工改名。
- `department_closure`：有用户数据时按新树重建（原文保留）。
- `api_service_permissions`：`grant_type=application` 只保留指向 A 的行并 remap；指向未导出 user/dept 的行 skip 并报告；指向已导出 role 的 remap。

---

## 6. 修订后的前端

- 新文件 `frontend/src/pages/System/Settings/AppTransferTab.tsx`，由 `index.tsx` 增加 Tab `key: 'app-transfer'`。
- 导出：`applicationId` Select（过滤 EADAF）+ `dataMode` + 两勾选 + **静态清单按实际 节来**（不要写「8 类」）。
- 导出请求：`responseType: 'blob'`，`timeout` 与恢复相同；从 `Content-Disposition` 取文件名，失败时 blob 可能是 JSON 错误信封（参考 Browser 页对 `application/json` blob 的处理，`:39-40` 一带）。
- 导入：**禁止**本地 `JSON.parse` 整文件。选文件 → 直接 `POST /preview` → 展示后端摘要 → 选策略 → confirm → `POST /import`。
- API 封装仍放 `services/EADAF/api/system.ts` + `typings.d.ts`。
- 敏感警示、不可自动撤销，保留原文。

本功能是系统设置上的备份类能力，**不走 AI Chat**，与现有备份 Tab 同类，不违反「业务 AI 必须走 Chat」规则。

---

## 7. 涉及文件清单（修订）

**新增（后端）**

- `backend/src/routes/appTransferRoutes.js`（含 Swagger）
- `backend/src/controllers/appTransferController.js`
- `backend/src/services/appTransfer/appExportService.js`
- `backend/src/services/appTransfer/appImportService.js`
- `backend/src/services/appTransfer/scopePrefix.js`（`prefixHit` 等，避免三处复制）

**新增（前端）**

- `frontend/src/pages/System/Settings/AppTransferTab.tsx`

**修改**

- `backend/src/routes/index.js`
- `backend/src/services/builtinApi/catalog.js`（三条权限，必须）
- `backend/scripts/eadaf-permissions-catalog-seed.sql`（同步权限种子）
- `frontend/src/pages/System/Settings/index.tsx`
- `frontend/src/services/EADAF/api/system.ts`
- `frontend/src/services/EADAF/api/typings.d.ts`

---

## 8. 边界与风险（修订后仍成立 / 新加）

1. **两套 Scope**：Skill/Tool 必须带 `aibase.scopes` 按 slug upsert（原文正确）。
2. **Logo / 头像 URL**：对象文件不迁移，导入后链接可能失效；preview 警告即可，v1 不修。
3. **菜单/路由**：仍明确不做（前端 `semanticRegistry` 是代码不是数据）。
4. **幂等**：`overwrite` + 元数据按业务键 upsert + 行数据 truncate+insert，重复导入同一文件应对齐。`skip` 二次应全跳过。
5. **大表**：v1 接受长任务；UI loading + 结果耗时。不要把 1GB 塞进浏览器 parse。
6. **物化 ADD COLUMN only**：结构演进无法靠导入变窄表；需在结果中说明。
7. **管道白名单里的其它 application_id**：丢弃，避免指向目标不存在的应用。
8. **全局异常响应 / data_standards / 系统桶**：不当作应用的一部分。

---

## 9. 实施拆分（审阅通过后执行）

| 阶段 | 内容 | 相对原文 |
|---|---|---|
| P1 | 导出服务 + **流式** `/export`；catalog 三条权限；前端 Tab + 导出 Modal + blob 下载；**同时做 `/preview`**（至少节计数 + 连接匹配 + EADAF 拒绝） | preview 从「可选」提前 |
| P2 | `/import` 全链路：idMap、连接只匹配、行数据保留 PK、双唯一键、依赖链失败终止；前端导入 Modal + 结果分节 |
| P3 | enums/relations/metrics/hooks/storageBuckets；密文明文往返；Swagger；operationAudit；超大行数警告与失败路径测试 |

P1 交付时导入可以还没有，但 **preview 要有**，避免 P2 才发现文件根本不可用。

---

## 10. 明确不采纳原文的句子（对照用）

- 「前端将响应 JSON 转 Blob 下载」→ 改为附件流 / blob 响应。
- 「前端 JSON.parse 预校验，preview 可选」→ preview 必做，前端不 parse。
- 「所有 UUID 重新生成」→ 仅元数据；行数据保留 PK。
- 「database_connections 按 name 匹配，匹配不到回退默认并导入连接」→ 只匹配不创建，失败则该表数据 failed。
- 「敏感字段原样导出原样导入」→ AES 密文必须解密再导出、目标再加密。
- 「失败节不影响其他节」→ 主依赖链终止。
- 「管道/Webhook 用 T(A) 首段」→ 用应用已配置前缀 / `outbound_webhook_scope`。
- 「Skill 含全部 is_global」→ 默认只导 dedicated；global 归 `includeAi`。
- 「结构在 entity_fields 带 version」→ version 只在 entities。
- 「8 类内容」→ 按实际节列出。
- catalog「照抄 systemRoutes 现有接口的实际要求」→ 现网 restore 未登记，不能照抄；本功能必须登记。
