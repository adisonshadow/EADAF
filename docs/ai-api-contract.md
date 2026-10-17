# 让 AI 准确调用 API：契约查询 Tool + Skill

## 1. 问题

AIBase 里的模型在调平台 / 业务 API 时，**经常猜接口地址和参数名**：

```
/api/v1/bizdata/entities      ← 真名是 /api/v1/business-data/entities
...?pageSize=500              ← 真名是 size
...?fields=code,label         ← 没有这个参数
/api/v1/openapi.json          ← 不存在
```

实测「列出现有业务实体」这一个问题：**22 次 `http_request` 全部猜错，最后没有答出来**；
问「创建实体要哪些必填字段」时模型甚至用 `POST /api/v1/business-data/entities` **真去建了一个探针实体**
（`TEST:probe:*`），再删掉 —— 猜参数不只是慢，还可能造成写副作用。

根因不是模型笨：它对这套 API 没有任何可信的事实来源。平台其实有完整契约
（`GET /api/v1/applications-public/{app}/apis.json`，免登录的 OpenAPI 3.0），
但整份文档很大（YS 一份 140KB），塞不进对话上下文（单条 Tool 结果预算 8000 字符）。

## 2. 方案：把契约做成可查询的 Tool + 教它先查的 Skill

| 组成 | 名称 | 作用 |
| --- | --- | --- |
| Tool（server_builtin） | `eadaf_api_contract` | 按 `app` + `keyword`/`path` 查契约，只回匹配的几段：method、path、参数名与位置/必填/类型、requestBody schema |
| Skill（全局） | `eadaf-api-contract` | 全局可见、正文常驻提示词：**调 API 前先查契约**，逐字照抄路径与参数；并授予上面这个 Tool |
| 硬约束（全局框架 Skill） | `aibase-chat-framework` 新增「调 API 前先查契约」段 | 即使当前页 Skill 没提，模型也被要求先查契约；禁止用 `/api/v1/bizdata`、`/api/v1/openapi.json` 等不存在的前缀探路 |

全局 Skill 会被每个应用预取，Tool 随 Skill 授予 —— 也就是说所有应用的 AI 都有这个能力，
不需要逐应用配置。

### 调用方式

```jsonc
// 1) 先看有哪些相关接口（中文/英文关键词都行；app 必传）
{ "app": "YS", "keyword": "product" }

// 2) 精确拿一个接口的参数细节（也可以传 path）
{ "app": "EADAF", "path": "/api/v1/business-data/entities", "detail": "detail" }
```

返回（节选）：

```jsonc
{
  "app": "EADAF", "detail": "detail", "matchedOperations": 1,
  "operations": [{
    "method": "POST", "path": "/api/v1/business-data/entities",
    "summary": "创建实体 [需要认证]",
    "bodyRequired": ["code", "label"],
    "requestBody": {
      "required": ["code", "label"],
      "properties": [
        { "name": "code", "type": "string", "description": "Scope:Entity 编码，如 sales:order:Order" },
        { "name": "label", "type": "string" }
      ]
    }
  }],
  "callTip": "GET/HEAD/DELETE 参数放 query string；POST/PUT/PATCH 参数放 JSON body…"
}
```

细节：

- `app` **必传**（Tool schema 里 `required: ["app"]`，模型不会漏）：管理端用 `EADAF`，业务应用用其
  code（`YS` / `SFDEP` / `FPCU` …）。传错或不存在时返回可选应用清单。
- 服务端还有一层兜底：请求上下文里带了应用（ai-base 对 SSO 应用会带 `?app=`，
  或 JWT 里有 `application_id`）时，缺 `app` 也能查。
- 命中 ≤ 3 个接口时**自动升级为 detail**，省掉「先 summary 再 detail」的第二个来回。
- `limit` 默认 20、上限 50；结果过长会提示收窄 keyword/path。

### 实测对比（同一模型、同一问题）

| 问题 | 没有契约 Tool | 有契约 Tool |
| --- | --- | --- |
| 创建实体要哪些必填字段 | 22 次调用，还误建了实体，最终没答 | **1 次**，直接给出 `code`/`label` 与完整 schema |
| 列出所有业务实体 | 22 次调用，没答出来 | **3 次**，正确列出 36 个实体 |

（对比数据来自本地实测：deepseek-v4-pro，tools = `http_request` + `eadaf_api_contract`。）

## 3. 文档页的「复制 JSON URL」也修好了

`/public/applications/<code>/api-docs` 右上角的 **复制 JSON URL** 以前在
`http://192.168.x.x:29527` 这类**非安全上下文**下点了没反应：`navigator.clipboard` 只在
https / localhost 可用，原代码 `navigator.clipboard?.writeText(...).then(...)` 在局域网 IP 下
会拿到 `undefined` 再 `.then` 抛错。

现在统一走 [`frontend/src/utils/clipboard.ts`](../frontend/src/utils/clipboard.ts)：
安全上下文用 Clipboard API，否则回退隐藏 textarea + `execCommand('copy')`；
应用内的 UUID、指标 code、实体 code、成员密码、打包日志等复制按钮也一并换掉了。

复制的 URL 形如：

```text
http://192.168.3.18:29526/api/v1/applications-public/YS/apis.json
```

- 免登录，可直接给 AI 或浏览器打开；
- 体积很大，**不要整份丢进对话**：让 AI 用 `eadaf_api_contract` 过滤，或自己按 path 摘取。

按钮本身也做了可发现性加强（`/public/applications/<code>/api-docs[/<routePath>]` 页头最右）：

- 改为实心主色按钮（与其它 ghost 按钮区分），保留 `复制 JSON URL` 文案；
- 悬浮提示说明「免登录 OpenAPI、可直接给 AI 读、体积大建议按 path 过滤」；
- 页头说明行追加一句：**「复制 JSON URL」是免登录 OpenAPI 契约，可直接交给 AI 读取**。

## 4. 安装 / 迁移

```bash
# 幂等；新库由 initdb.sh 自动执行（放在 AI 种子之后，避免被 TRUNCATE）
docker cp backend/scripts/migrate-eadaf-api-contract-skill.sql EADAF-dev-postgres:/tmp/api-contract.sql
docker exec EADAF-dev-postgres psql -U my_name -d eadaf_db -v ON_ERROR_STOP=1 -f /tmp/api-contract.sql
```

验证：

```bash
curl -s 'http://127.0.0.1:29526/api/v1/ai/tools/invoke' \
  -H "Authorization: Bearer <token>" -H 'Content-Type: application/json' \
  -d '{"functionName":"eadaf_api_contract","arguments":{"app":"YS","keyword":"product"}}'
```

或在管理端 **AI 管理 → Skills** 里看到全局 Skill `eadaf-api-contract`（名称「API 契约优先」）。

## 5. 和「业务应用的业务 API Skill」的关系

两者互补，别重复造：

| 机制 | 覆盖范围 | 何时用 |
| --- | --- | --- |
| 本页的 `eadaf_api_contract` + `eadaf-api-contract` | **平台内置 API + 该应用已发布的业务 API**（整个 OpenAPI 契约） | 通用：任何应用、任何接口，先查再调 |
| [业务 API Skill](./app-api-skill/README.md)（如 `ys-business-api` + 应用顶层 Skill） | **某个应用自己的业务数据 API**，带字段、枚举取值、典型问法与口径 | 该应用高频问题：把事实常驻提示词，连「查契约」这一步都省掉 |

实践建议：业务应用两者都配 —— 高频字段/口径写进业务 API Skill（0 次查询），
内置 API（`/api/v1/business-data`、`/api/v1/storage`、`/api/v1/user` …）走契约查询。
