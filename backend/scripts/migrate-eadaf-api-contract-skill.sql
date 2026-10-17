-- EADAF API 契约查询 Tool + Skill（幂等，可重复执行）
--
-- 背景：模型调平台/业务 API 时经常猜路径与参数名（/api/v1/bizdata、page_size…），
-- 一次任务要试错好几轮。这里提供：
--   1) server_builtin Tool `eadaf_api_contract`：按 app + keyword/path 查公开 OpenAPI 契约，
--      返回 method / path / 参数名（含必填）/ requestBody schema；
--   2) 全局 Skill `eadaf-api-contract`：教模型「先查契约、再按契约调用」，并把 Tool 挂上去。
--
-- 为什么不是让模型直接 GET /apis.json：YS 一份 140KB，远超单条 Tool 结果预算（8000 字符），
-- 整份塞进上下文会被截断。

BEGIN;

-- 1) Tool 本体（挂到与 http_request 相同的平台能力 Scope）
INSERT INTO aibase.tools (
  id, scope_id, name, slug, function_name, description,
  execution_type, parameters_schema, review_markdown, server_config, is_active
) VALUES (
  '55555555-5555-4555-8555-5555555555d1',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  'API 契约查询',
  'eadaf-api-contract',
  'eadaf_api_contract',
  '查某个应用的 API 契约（路径 / HTTP 方法 / 参数名与必填 / 请求体结构）。调 EADAF 或业务 API 前先用它核对，禁止猜路径与参数名。',
  'server_builtin',
  '{
    "type": "object",
    "required": ["app"],
    "properties": {
      "app": {
        "type": "string",
        "description": "必填。应用 code 或 application_id，如 EADAF / YS / SFDEP / FPCU"
      },
      "keyword": {
        "type": "string",
        "description": "按 path / summary / operationId 模糊匹配，如 entities、data、storage"
      },
      "path": {
        "type": "string",
        "description": "精确或前缀路径，如 /api/v1/business-data/entities（也可直接粘贴完整 URL）"
      },
      "detail": {
        "enum": ["summary", "detail"],
        "type": "string",
        "description": "summary=每个接口一行（默认）；detail=附带参数名/位置/必填/类型与请求体 schema"
      },
      "limit": {
        "type": "integer",
        "description": "最多返回多少个接口，默认 20，最大 50"
      }
    }
  }'::jsonb,
  '## eadaf_api_contract

- 调平台/业务 API 前先用它核对契约：`{ app, keyword }` 看总览，`{ app, path, detail: "detail" }` 拿参数细节
- `app` 必传：EADAF 管理台用 `EADAF`，业务应用用其应用 code（如 `YS`）
- 返回里 method + path + parameters(in: path/query) + requestBody.required 就是调用依据，逐字照抄
- 免登录完整契约：`/api/v1/applications-public/<code>/apis.json`（体积大，别整份读）',
  '{"handler":"eadaf_api_contract"}'::jsonb,
  true
)
ON CONFLICT (slug) DO UPDATE
   SET name = EXCLUDED.name,
       function_name = EXCLUDED.function_name,
       description = EXCLUDED.description,
       execution_type = EXCLUDED.execution_type,
       parameters_schema = EXCLUDED.parameters_schema,
       review_markdown = EXCLUDED.review_markdown,
       server_config = EXCLUDED.server_config,
       is_active = true,
       updated_at = CURRENT_TIMESTAMP;

-- 2) 全局 Skill：先查契约再调用
INSERT INTO aibase.skills (
  id, scope_id, name, slug, description, content_markdown,
  is_active, is_global, is_dedicated, completion_strategy
) VALUES (
  '99999999-9999-4999-8999-9999999999d2',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  'API 契约优先',
  'eadaf-api-contract',
  '调 EADAF / 业务 API 前先查契约（路径、参数名、必填、请求体），禁止猜接口地址与参数',
  $skill$
# API 契约优先

要用 HTTP 调平台 API（`/api/v1/...`）或业务数据 API（`/api/v1/data/...`）时，**先查契约、再调用**，禁止凭印象猜路径或参数名。

## 何时必须查

- 调 `http_request` 之前：不确定准确的 path、query 参数名、body 字段名
- 遇到 `404` / `400`（如 `column "xxx" does not exist`、`参数校验失败`）时：先查契约再重试，**不要换个地址继续试**
- 需要写操作（create / update / publish / execute）时：请求体字段以契约为准

## 怎么查

1. 总览（按关键词）：
   `eadaf_api_contract({ app: "<应用 code>", keyword: "entities" })`
2. 精确单个接口（拿参数细节）：
   `eadaf_api_contract({ app: "<应用 code>", path: "/api/v1/business-data/entities", detail: "detail" })`
3. `app` **必传**：管理端用 `EADAF`，业务应用用其 code（如 `YS`）；传错/不存在时工具会返回可选应用清单。

## 拿到契约后怎么调

- GET / HEAD / DELETE：参数放 query string（`?size=20&page=1`）
- POST / PUT / PATCH：参数放 JSON body，字段名与 `requestBody.properties` 一致，`required` 必须给全
- path 里的 `{id}` 之类替换成真实值（path 参数不要放 query）
- 列表接口：先取一页（分页参数名以契约为准，常见 `page` / `size`），读 `data.pagination.total`
  判断是否还要翻页；**不要**靠前缀枚举凑全量
- 调用结果按 `{ code, message, data }` 判读：`code !== 200` 即失败，按 `message` 修正，而不是换接口

## 铁律

- 路径逐字照抄契约里的 path；不要自造复数/驼峰（`/entities` ≠ `/entity`，`/business-data` ≠ `/bizdata`）
- 参数名逐字照抄（`page` / `size` / `keyword` / `filter` 等以契约为准）
- 契约里带 `__2` 之类后缀的是**重名去重路径**，正常调用用同名的第一个
- 免登录的完整契约入口：`/api/v1/applications-public/<code>/apis.json`（体积大，用本 Skill 的 Tool 过滤，别整份读进上下文）
$skill$,
  true,
  true,
  false,
  NULL
)
ON CONFLICT (slug) DO UPDATE
   SET name = EXCLUDED.name,
       description = EXCLUDED.description,
       content_markdown = EXCLUDED.content_markdown,
       is_active = true,
       is_global = true,
       is_dedicated = false,
       completion_strategy = NULL,
       updated_at = CURRENT_TIMESTAMP;

-- 3) Skill 授予该 Tool
INSERT INTO aibase.skill_tools (skill_id, tool_id, sort_order)
SELECT s.id, t.id, 0
  FROM aibase.skills s, aibase.tools t
 WHERE s.slug = 'eadaf-api-contract'
   AND t.slug = 'eadaf-api-contract'
ON CONFLICT (skill_id, tool_id) DO NOTHING;

-- 4) 把「调 API 前先查契约」写进全局框架 Skill 的硬约束
--    只做插入（在 run_code 段之前），已插入过则跳过，幂等。
UPDATE aibase.skills
   SET content_markdown = replace(
         content_markdown,
         '## run_code 脚本 API（若使用）',
         $rule$## 调 API 前先查契约（硬约束）
需要直接发 HTTP 调平台 API（`/api/v1/...`）或业务数据 API（`/api/v1/data/...`）时：
- **先查契约**：可用 Tool 里有 `eadaf_api_contract`（由全局 Skill `eadaf-api-contract` 授予）就先用它查，
  如 `{ app: "<当前应用 code>", keyword: "..." }`；拿到 method / path / 参数名 / 请求体后再调，
  参数位置不确定时加 `detail: "detail"`。
- **禁止猜**：不要凭印象拼路径或参数名，也不要用 `/api/v1/bizdata`、`/api/v1/openapi.json`、
  `/api/v1/docs`、`/api/v1/entities` 之类不存在的入口探路。
- **参数位置**：GET / HEAD / DELETE 放 query string；POST / PUT / PATCH 放 JSON body，
  字段名与契约 `requestBody.properties` 一致，`required` 必须给全。
- **失败先查契约**：遇到 404 / 400（如 `column "xxx" does not exist`、`参数校验失败`）先查契约再重试，
  **不要换地址继续试**。
- **已封装的不重复查**：`bizdata_*` / `apiservice_*` 等专用 Tool 参数明确，直接用 Tool。

$rule$ || '## run_code 脚本 API（若使用）'
       ),
       updated_at = CURRENT_TIMESTAMP
 WHERE slug = 'aibase-chat-framework'
   AND content_markdown NOT LIKE '%调 API 前先查契约%'
   AND content_markdown LIKE '%## run_code 脚本 API（若使用）%';

COMMIT;

-- 自检
SELECT s.slug, s.is_global, s.is_dedicated, length(s.content_markdown) AS body_len,
       (SELECT count(*) FROM aibase.skill_tools st WHERE st.skill_id = s.id) AS tool_links
  FROM aibase.skills s WHERE s.slug = 'eadaf-api-contract';
SELECT t.slug, t.function_name, t.execution_type,
       (SELECT count(*) FROM aibase.skill_tools st WHERE st.tool_id = t.id) AS skill_links
  FROM aibase.tools t WHERE t.slug = 'eadaf-api-contract';
SELECT slug, length(content_markdown) AS body_len,
       content_markdown LIKE '%调 API 前先查契约%' AS has_contract_rule
  FROM aibase.skills WHERE slug = 'aibase-chat-framework';
