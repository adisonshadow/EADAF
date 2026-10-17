# 业务应用的「业务 API Skill」——生成与接入

## 1. 为什么需要

业务应用（如 `app_example` 的 `YS`）的 AI 助手默认只拿到**全局 Skill** `aibase-chat-framework`，
它授予的唯一业务向 Tool 是 `http_request`。也就是说：

- 模型不知道这个应用有哪些 API、路径长什么样、响应信封是什么；
- 于是它只能**猜**：`/api/v1/orders`、`/api/v1/entities`、`/api/v1/openapi.json` … 一个个试；
- 一次「库存低于 20 的伞品」实测要 **12 次** 无效 `http_request`，最后还答不出来。

把「本应用业务 API 的事实」写进 **应用顶层 Skill**（`eadaf.applications.top_level_skill_markdown`）
+ 一个**专用 Skill**（`aibase.skills`），同一个问题 **1 次**调用就够：

| | 修复前 | 修复后 |
| --- | --- | --- |
| 库存低于 20 的伞品 | 12 次无效尝试，无答案 | 1 次 `GET /api/v1/data/YS/product/Product?limit=100`，答对 |
| 会员张伟的订单 | 13 次无效尝试 | 2 次：`Member/one` → `Order?filter={"member_id":…}` |
| 各状态订单数量/金额 | 13 次无效尝试 | 5 次：按状态各取一次，数值与库内一致 |

## 2. 产物

| 文件 | 作用 |
| --- | --- |
| `docs/app-api-skill/<CODE>.notes.md` | **人工维护**的业务口径：枚举取值、表间关系、典型问法、回答口径 |
| `docs/app-api-skill/<CODE>.md` | **生成**的完整手册（路径 / 字段 / 通用规则 / 坑），给人看，也便于 review diff |
| `backend/scripts/migrate-<code>-business-api-skill.sql` | **生成**的幂等迁移：写顶层 Skill + upsert 专用 Skill + 绑定应用 + 挂 `http-request` |

生成器：[`backend/scripts/gen-app-business-api-skill.js`](../../backend/scripts/gen-app-business-api-skill.js)。
它读公开目录 `GET /api/v1/applications-public/{key}/api-catalog`（不需要登录），
所以只要 API 服务发布完，就能生成一份与真实接口一致的文档。

## 3. 重新生成（API 服务改了就跑一次）

```bash
# 仓库根目录
node backend/scripts/gen-app-business-api-skill.js \
  --app YS \
  --notes docs/app-api-skill/YS.notes.md \
  --out   docs/app-api-skill/YS.md \
  --sql   backend/scripts/migrate-ys-business-api-skill.sql \
  --scope sales-demo \
  --skill-slug ys-business-api \
  --skill-name "雨伞独立站业务 API" \
  --skill-id 55555555-5555-4555-8555-5555555555c1
# 或：cd backend && pnpm gen:app-api-skill --app YS ...

# 应用到当前库（幂等，可重复跑）
docker cp backend/scripts/migrate-ys-business-api-skill.sql EADAF-dev-postgres:/tmp/ys-skill.sql
docker exec EADAF-dev-postgres psql -U my_name -d eadaf_db -v ON_ERROR_STOP=1 -f /tmp/ys-skill.sql
```

换应用就换 `--app`（应用 code 或 application_id）/ `--skill-slug` / `--skill-id`。
`--notes` 不给也能生成，只是少了本应用的枚举与问法示例。

## 4. 运行时怎么生效

```text
capabilities?applicationId=…            （后端按 app 过滤）
  ├─ topLevelSkill.contentMarkdown  → 拼进 system prompt「应用顶层 Skill」，每轮都在
  └─ skills[]                       → 只进「Skill 目录」摘要，按需 skill({slug}) 加载正文
        └─ tools[]                  → 加载后同回合授予（ys-business-api → http_request）
```

- **顶层 Skill** 随「应用数据导出」一起走（`applications` 整行会导出），换实例不用重做；
  专用 Skill 属于平台级资源（`skills` 段），要单独用平台数据包搬。
- 顶层 Skill 每轮都进 prompt，所以生成器把它控制在一屏内（YS 约 7KB ≈ 2k tokens）。
  比"省这点 token 然后多打 12 次 Tool"划算得多：每次 Tool 往返都要重发整段 prompt。

## 5. 验收

```bash
# 1) 能力清单里能看到顶层 Skill + 专用 Skill
curl -s 'http://127.0.0.1:29526/api/v1/ai/capabilities?applicationId=<YS应用ID>' \
  -H "Authorization: Bearer <user token>" | jq '.data.topLevelSkill.contentMarkdown|length, .data.skills[].slug'

# 2) 问一句只有业务 API 能回答的问题，看是否第一轮就调对路径
#    预期：http_request 的 url = /api/v1/data/YS/product/Product?limit=100
```

## 6. 已知问题（本次排查发现，未在本轮修）
1. **`count` operation 被 `/:id` 抢匹配**：`GET /api/v1/data/YS/order/Order/count` 会返回
   `invalid input syntax for type uuid: "count"`（`apiServiceRouteResolve.pickCandidate` 没优先选字面量路径）。
   文档里改成「`?limit=1` 读 `pagination.total`」，根因修复建议：字面量优先于 `:param`。
2. **`sales_*` 演示 Tool 只支持 MySQL 物化连接**：`salesDataService` 写死 `withMysqlClient`，
   而本实例物化连接是 PostgreSQL → 8 个 Tool 全部返回
   `SYSTEM_ERROR: 销售 Demo 的 AI 工具当前只支持 MySQL 物化连接`。
   因此**没有**把 `order-analysis` / `after-sales-analysis` 绑到 YS（绑了等于给模型一排必然报错的工具）。
   修好后可再绑定，统计类问题就能 1 次调用完成。

## 7. 相关：平台内置 API 走「契约查询」

本页的 Skill 只覆盖**该应用自己的业务数据 API**。平台内置 API
（`/api/v1/business-data/…`、`/api/v1/storage/…`、`/api/v1/user/…`）
不用逐个写进业务 Skill —— 全局 Skill `eadaf-api-contract` + Tool `eadaf_api_contract`
会让 AI 先查契约（路径 / 参数名 / 必填 / 请求体）再调用。见
[../ai-api-contract.md](../ai-api-contract.md)。
