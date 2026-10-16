-- migrate-eadaf-ai-skills.sql
-- EADAF 全局 + EADAF 专用 Skill/Tool/Scope 幂等 upsert（不 TRUNCATE，不删业务应用 Skill）。
-- 由 scripts/export-eadaf-ai-skills.js 从现库导出。本地改完 Skill 后重新导出并在服务器执行。
-- 生成时间: 2026-09-12T21:20:30.108Z
-- scopes=3 tools=153 skills=17 skill_tools=210

BEGIN;

-- ===== scopes =====
INSERT INTO aibase.scopes (id, name, slug, description, is_active, created_at, updated_at)
VALUES ('88888888-8888-4888-8888-888888888801', 'AI 管理', 'ai-management', 'EADAF AI 能力配置：Scope、Tool、Skill 的设计与管理', true, '2026-06-24T12:51:20.252Z', '2026-06-27T06:54:25.451Z')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.scopes (id, name, slug, description, is_active, created_at, updated_at)
VALUES ('55555555-5555-4555-8555-555555555501', '业务数据', 'business-data', 'EADAF 业务数据模型设计与物化', true, '2026-06-22T11:33:21.110Z', '2026-06-22T11:35:04.808Z')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.scopes (id, name, slug, description, is_active, created_at, updated_at)
VALUES ('77777777-7777-4777-8777-777777777710', '成员与权限', 'member-org', 'EADAF 成员、角色、权限与数据规则管理', true, '2026-06-27T06:51:24.398Z', '2026-07-10T15:16:58.359Z')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  updated_at = CURRENT_TIMESTAMP;

-- ===== tools（按 function_name upsert，scope 按 slug 解析） =====
INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '99999999-9999-4999-8999-999999999923',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  '创建 AI 模型', 'aibase-create-model', 'aibase_create_model',
  '创建 AI 模型并绑定服务商', 'client',
  '{"type":"object","required":["providerId","modelId","displayName","capabilities"],"properties":{"slug":{"type":"string"},"modelId":{"type":"string"},"inputTags":{"type":"array","items":{"type":"string"}},"outputTags":{"type":"array","items":{"type":"string"}},"providerId":{"type":"string"},"displayName":{"type":"string"},"capabilities":{"type":"array","items":{"type":"string"}},"defaultParams":{"type":"object"}}}'::jsonb, '## aibase_create_model

### capabilities（能力标签）
`text`, `vision`, `image_generation`, `audio_input`, `audio_output`, `embedding`, `function_calling`

### inputTags / outputTags（模态）
`text`, `image`, `audio`, `video`, `file`（文档）

- 聊天附件能力由 **inputTags** 决定：如 `image` 允许图片，`file` 允许文档
- slug 可省略，将根据 displayName 自动生成
- modelId 为上游模型名，如 `deepseek-chat`', '{}'::jsonb,
  true, '2026-06-26T18:36:36.823Z', '2026-06-26T18:56:58.412Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '99999999-9999-4999-8999-999999999913',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  '创建 AI 服务商', 'aibase-create-provider', 'aibase_create_provider',
  '创建 OpenAI Compatible 等 AI 服务商', 'client',
  '{"type":"object","required":["name","baseUrl"],"properties":{"name":{"type":"string"},"slug":{"type":"string"},"apiKey":{"type":"string"},"baseUrl":{"type":"string"},"adapterType":{"type":"string"}}}'::jsonb, '## aibase_create_provider

- **不要向用户询问 baseUrl / adapterType**，能识别服务商时直接用 Skill 内置对照表
- 仅向用户索取 **API Key**（及可选的显示名称）
- slug 可选，小写字母数字连字符
- adapterType 默认 `openai_compatible`', '{}'::jsonb,
  true, '2026-06-26T18:36:36.823Z', '2026-06-26T18:56:58.412Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '88888888-8888-4888-8888-888888888813',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  '创建 Scope', 'aibase-create-scope', 'aibase_create_scope',
  '创建 AI Scope', 'client',
  '{"type":"object","required":["name","slug"],"properties":{"name":{"type":"string"},"slug":{"type":"string"},"description":{"type":"string"}}}'::jsonb, '## aibase_create_scope

slug 即 Scope ID，小写字母、数字与连字符。', '{}'::jsonb,
  true, '2026-06-24T12:51:20.259Z', '2026-06-27T06:54:25.461Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '88888888-8888-4888-8888-888888888833',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  '创建 Skill', 'aibase-create-skill', 'aibase_create_skill',
  '创建 AI Skill', 'client',
  '{"type":"object","required":["name","slug"],"properties":{"name":{"type":"string"},"slug":{"type":"string"},"scopeId":{"type":"string"},"toolIds":{"type":"array","items":{"type":"string"}},"isGlobal":{"type":"boolean"},"description":{"type":"string"},"isDedicated":{"type":"boolean"},"applicationIds":{"type":"array","items":{"type":"string"}},"contentMarkdown":{"type":"string"}}}'::jsonb, '## aibase_create_skill

- slug 即 Skill ID
- 应用范围：isGlobal 与 isDedicated 互斥
- 专用 Skill 需传 applicationIds', '{}'::jsonb,
  true, '2026-06-24T12:51:20.259Z', '2026-06-27T06:54:25.461Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '88888888-8888-4888-8888-888888888823',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  '创建 Tool', 'aibase-create-tool', 'aibase_create_tool',
  '创建 AI Tool', 'client',
  '{"type":"object","required":["scopeId","name","functionName","executionType"],"properties":{"name":{"type":"string"},"slug":{"type":"string"},"scopeId":{"type":"string"},"description":{"type":"string"},"functionName":{"type":"string"},"serverConfig":{"type":"object"},"executionType":{"enum":["client","server_http","server_builtin"],"type":"string"},"reviewMarkdown":{"type":"string"},"parametersSchema":{"type":"object"}}}'::jsonb, '## aibase_create_tool

- functionName：全局唯一，snake_case
- executionType：client / server_http / server_builtin
- server_builtin 需在 serverConfig 中配置 handler', '{}'::jsonb,
  true, '2026-06-24T12:51:20.259Z', '2026-06-27T06:54:25.461Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '99999999-9999-4999-8999-999999999925',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  '停用 AI 模型', 'aibase-delete-model', 'aibase_delete_model',
  '软删除（停用）AI 模型', 'client',
  '{"type":"object","required":["modelId"],"properties":{"modelId":{"type":"string"}}}'::jsonb, '## aibase_delete_model', '{}'::jsonb,
  true, '2026-06-26T18:36:36.823Z', '2026-06-26T18:56:58.412Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '99999999-9999-4999-8999-999999999915',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  '停用 AI 服务商', 'aibase-delete-provider', 'aibase_delete_provider',
  '软删除（停用）AI 服务商', 'client',
  '{"type":"object","required":["providerId"],"properties":{"providerId":{"type":"string"}}}'::jsonb, '## aibase_delete_provider', '{}'::jsonb,
  true, '2026-06-26T18:36:36.823Z', '2026-06-26T18:56:58.412Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '99999999-9999-4999-8999-999999999922',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  '获取 AI 模型', 'aibase-get-model', 'aibase_get_model',
  '按 ID 获取 AI 模型详情', 'client',
  '{"type":"object","required":["modelId"],"properties":{"modelId":{"type":"string"}}}'::jsonb, '## aibase_get_model

含 capabilities、inputTags、outputTags、defaultParams。', '{}'::jsonb,
  true, '2026-06-26T18:36:36.823Z', '2026-06-26T18:56:58.412Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '99999999-9999-4999-8999-999999999912',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  '获取 AI 服务商', 'aibase-get-provider', 'aibase_get_provider',
  '按 ID 获取 AI 服务商详情', 'client',
  '{"type":"object","required":["providerId"],"properties":{"providerId":{"type":"string"}}}'::jsonb, '## aibase_get_provider

返回 apiKeySet 表示是否已配置密钥，不含明文。', '{}'::jsonb,
  true, '2026-06-26T18:36:36.823Z', '2026-06-26T18:56:58.412Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '88888888-8888-4888-8888-888888888812',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  '获取 Scope 详情', 'aibase-get-scope', 'aibase_get_scope',
  '按 ID 获取 Scope 详情', 'client',
  '{"type":"object","required":["scopeId"],"properties":{"scopeId":{"type":"string"}}}'::jsonb, '## aibase_get_scope', '{}'::jsonb,
  true, '2026-06-24T12:51:20.259Z', '2026-06-27T06:54:25.461Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '88888888-8888-4888-8888-888888888832',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  '获取 Skill 详情', 'aibase-get-skill', 'aibase_get_skill',
  '按 ID 获取 Skill 详情（含关联 Tool）', 'client',
  '{"type":"object","required":["skillId"],"properties":{"skillId":{"type":"string"}}}'::jsonb, '## aibase_get_skill', '{}'::jsonb,
  true, '2026-06-24T12:51:20.259Z', '2026-06-27T06:54:25.461Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '88888888-8888-4888-8888-888888888822',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  '获取 Tool 详情', 'aibase-get-tool', 'aibase_get_tool',
  '按 ID 获取 Tool 详情', 'client',
  '{"type":"object","required":["toolId"],"properties":{"toolId":{"type":"string"}}}'::jsonb, '## aibase_get_tool', '{}'::jsonb,
  true, '2026-06-24T12:51:20.259Z', '2026-06-27T06:54:25.461Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '99999999-9999-4999-8999-999999999921',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  '列出 AI 模型', 'aibase-list-models', 'aibase_list_models',
  '列出 AI 模型，可按 providerId 过滤', 'client',
  '{"type":"object","properties":{"page":{"type":"integer"},"size":{"type":"integer"},"isActive":{"type":"boolean"},"providerId":{"type":"string"}}}'::jsonb, '## aibase_list_models', '{}'::jsonb,
  true, '2026-06-26T18:36:36.823Z', '2026-06-26T18:56:58.412Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '99999999-9999-4999-8999-999999999911',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  '列出 AI 服务商', 'aibase-list-providers', 'aibase_list_providers',
  '列出 AI 服务商配置', 'client',
  '{"type":"object","properties":{"page":{"type":"integer"},"size":{"type":"integer"},"isActive":{"type":"boolean"}}}'::jsonb, '## aibase_list_providers', '{}'::jsonb,
  true, '2026-06-26T18:36:36.823Z', '2026-06-26T18:56:58.412Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '88888888-8888-4888-8888-888888888811',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  '列出 Scope', 'aibase-list-scopes', 'aibase_list_scopes',
  '列出 AI Scope 配置', 'client',
  '{"type":"object","properties":{"page":{"type":"integer"},"size":{"type":"integer"},"isActive":{"type":"boolean"}}}'::jsonb, '## aibase_list_scopes', '{}'::jsonb,
  true, '2026-06-24T12:51:20.259Z', '2026-06-27T06:54:25.461Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '88888888-8888-4888-8888-888888888831',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  '列出 Skill', 'aibase-list-skills', 'aibase_list_skills',
  '列出 AI Skill 配置', 'client',
  '{"type":"object","properties":{"page":{"type":"integer"},"size":{"type":"integer"},"isActive":{"type":"boolean"}}}'::jsonb, '## aibase_list_skills', '{}'::jsonb,
  true, '2026-06-24T12:51:20.259Z', '2026-06-27T06:54:25.461Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '88888888-8888-4888-8888-888888888821',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  '列出 Tool', 'aibase-list-tools', 'aibase_list_tools',
  '列出 AI Tool 配置', 'client',
  '{"type":"object","properties":{"page":{"type":"integer"},"size":{"type":"integer"},"scopeId":{"type":"string"},"isActive":{"type":"boolean"},"executionType":{"type":"string"}}}'::jsonb, '## aibase_list_tools', '{}'::jsonb,
  true, '2026-06-24T12:51:20.259Z', '2026-06-27T06:54:25.461Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-777777777701',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  '读取页面 Surface', 'aibase-read-surfaces', 'aibase_read_surfaces',
  '读取当前页面已注册的 AI Surface 快照', 'client',
  '{"type":"object","properties":{"domain":{"type":"string"},"surfaceId":{"type":"string"}}}'::jsonb, '## aibase_read_surfaces

返回当前页面注册的 Surface 列表（表单值、SQL 等）。

可选过滤：
- domain：如 bizdata
- surfaceId：如 api-services.create', '{}'::jsonb,
  true, '2026-06-26T14:21:23.952Z', '2026-07-10T15:16:57.980Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '99999999-9999-4999-8999-999999999924',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  '更新 AI 模型', 'aibase-update-model', 'aibase_update_model',
  '更新 AI 模型配置', 'client',
  '{"type":"object","required":["modelId"],"properties":{"slug":{"type":"string"},"modelId":{"type":"string"},"isActive":{"type":"boolean"},"inputTags":{"type":"array","items":{"type":"string"}},"outputTags":{"type":"array","items":{"type":"string"}},"providerId":{"type":"string"},"displayName":{"type":"string"},"capabilities":{"type":"array","items":{"type":"string"}},"defaultParams":{"type":"object"},"modelIdUpstream":{"type":"string"}}}'::jsonb, '## aibase_update_model

- 更新上游 modelId 时使用参数 `modelIdUpstream`
- 修改 inputTags 会影响聊天面板附件按钮与可上传类型', '{}'::jsonb,
  true, '2026-06-26T18:36:36.823Z', '2026-06-26T18:56:58.412Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '99999999-9999-4999-8999-999999999914',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  '更新 AI 服务商', 'aibase-update-provider', 'aibase_update_provider',
  '更新 AI 服务商配置或启用状态', 'client',
  '{"type":"object","required":["providerId"],"properties":{"name":{"type":"string"},"slug":{"type":"string"},"apiKey":{"type":"string"},"baseUrl":{"type":"string"},"isActive":{"type":"boolean"},"providerId":{"type":"string"},"adapterType":{"type":"string"}}}'::jsonb, '## aibase_update_provider

传 apiKey 时将覆盖原密钥。', '{}'::jsonb,
  true, '2026-06-26T18:36:36.823Z', '2026-06-26T18:56:58.412Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '88888888-8888-4888-8888-888888888814',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  '更新 Scope', 'aibase-update-scope', 'aibase_update_scope',
  '更新 Scope 信息或启用状态', 'client',
  '{"type":"object","required":["scopeId"],"properties":{"name":{"type":"string"},"slug":{"type":"string"},"scopeId":{"type":"string"},"isActive":{"type":"boolean"},"description":{"type":"string"}}}'::jsonb, '## aibase_update_scope', '{}'::jsonb,
  true, '2026-06-24T12:51:20.259Z', '2026-06-27T06:54:25.461Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '88888888-8888-4888-8888-888888888834',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  '更新 Skill', 'aibase-update-skill', 'aibase_update_skill',
  '更新 Skill 内容、关联 Tool 或启用状态', 'client',
  '{"type":"object","required":["skillId"],"properties":{"name":{"type":"string"},"slug":{"type":"string"},"scopeId":{"type":"string"},"skillId":{"type":"string"},"toolIds":{"type":"array","items":{"type":"string"}},"isActive":{"type":"boolean"},"isGlobal":{"type":"boolean"},"description":{"type":"string"},"isDedicated":{"type":"boolean"},"applicationIds":{"type":"array","items":{"type":"string"}},"contentMarkdown":{"type":"string"}}}'::jsonb, '## aibase_update_skill', '{}'::jsonb,
  true, '2026-06-24T12:51:20.259Z', '2026-06-27T06:54:25.461Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '88888888-8888-4888-8888-888888888824',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  '更新 Tool', 'aibase-update-tool', 'aibase_update_tool',
  '更新 Tool 配置或启用状态', 'client',
  '{"type":"object","required":["toolId"],"properties":{"name":{"type":"string"},"slug":{"type":"string"},"toolId":{"type":"string"},"scopeId":{"type":"string"},"isActive":{"type":"boolean"},"description":{"type":"string"},"functionName":{"type":"string"},"serverConfig":{"type":"object"},"executionType":{"type":"string"},"reviewMarkdown":{"type":"string"},"parametersSchema":{"type":"object"}}}'::jsonb, '## aibase_update_tool', '{}'::jsonb,
  true, '2026-06-24T12:51:20.259Z', '2026-06-27T06:54:25.461Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666637',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '检查 TypeScript Handler', 'apiservice-check-handler', 'apiservice_check_handler',
  '对 TypeScript Handler 做语法/类型检查（行级诊断）；保存与测试前必须先通过', 'client',
  '{"type":"object","required":["handlerScript"],"properties":{"handlerScript":{"type":"string","description":"Handler 脚本（推荐只写函数体）"},"requestParameterInterface":{"type":"string","description":"请求参数 TS interface，用于 params 类型"}}}'::jsonb, '## apiservice_check_handler

返回 `{ ok, diagnostics }`。

### 何时调用
1. 修改 handler 后、create/update **之前**
2. `apiservice_run_test` **之前**（typescript）
3. **禁止**在 run_test 已成功后再调用本 Tool「再确认一遍」

### TypeScript Handler 契约（权威源 — Skill / 其他 Tool 勿重复展开全文）
- 推荐**只写函数体**（无需 export handler）；用只读 `params` + `db(实体code)`
- 示例：`await db(''fmms:WorkCard'').where({ status: params.status }).take(20).getMany()`
- **禁止** `queryPg`、手写 SQL、物化表名
- `requestParameterInterface` 声明全部 `params.xxx`
- 保存/测试前必须本 Tool 通过（按行修复）
- 创建/更新时同步 interface + handlerScript + requestOverrides

### Handler SDK（paginate / join / count）
- 分页+计数：`.paginate({ limit: params.limit, skip: params.skip })` → 响应须含 `pagination`（`total, page, pageSize, totalPages, hasNext`）；禁止 where 写两遍
- **禁止**仅返回 `{ items, total }` / `{ items, count }`
- `count()` 别名可用（=`getCount()`）；`leftJoin(entity, alias, leftCol, rightCol)` 仅等值 ON
- where：`$gte/$in/$ilike/$isNull`；params 经 SDK 参数化，禁止拼字符串 / queryPg
', '{}'::jsonb,
  true, '2026-07-17T05:39:21.147Z', '2026-07-30T20:29:17.296Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666622',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '创建 API 服务', 'apiservice-create-service', 'apiservice_create_service',
  '创建 API 服务；须传 entityId（主实体必选）；短名默认实体末段+Create/Find；sql 用 targetSchema', 'client',
  '{"type":"object","properties":{"code":{"type":"string","description":"可省略，优先 scopeCode+serviceSlug"},"name":{"type":"string"},"tags":{"type":"array","items":{"type":"string"}},"publish":{"type":"boolean","description":"创建后立即发布"},"entityId":{"type":"string"},"entityIds":{"type":"array","items":{"type":"string"}},"scopeCode":{"type":"string"},"scriptMode":{"enum":["sql","typescript"],"type":"string"},"description":{"type":"string"},"entityCodes":{"type":"array","items":{"type":"string"}},"serviceSlug":{"type":"string"},"connectionId":{"type":"string","description":"禁止索要，省略时自动推断"},"handlerScript":{"type":"string"},"definitionScript":{"type":"string"},"accessRestriction":{"type":"object","properties":{"mode":{"enum":["none","role","department"],"type":"string"},"roleIds":{"type":"array","items":{"type":"string"}},"departmentIds":{"type":"array","items":{"type":"string"}}}},"enabledOperations":{"type":"array","items":{"type":"string"},"description":"只传一个主 operation"},"requestParameterInterface":{"type":"string","description":"设计期 TS interface（编辑页「请求参数结构」唯一来源）；有实体时须按字段编写；省略且能解析实体时 Tool 会自动生成。Example 不能代替本字段"}}}'::jsonb, '## apiservice_create_service

- 一个服务 = 一个主 operation；禁止索要 connectionId
- typescript：函数体 + params + db(实体code)；**Handler 契约见 `apiservice_check_handler` review**
- **推荐**传 entityId；省略 connectionId 时按主实体物化推断
- 保存前必须 `apiservice_check_handler` 通过

### 响应文档（find 必遵）
- `responseOverrides`：`data.items` + `data.pagination{ total, page, pageSize, totalPages, hasNext }`
- Tool 未传时会自动补全默认 Schema/Example；仍须回读确认

### 成功判定
- `_verification.verified=true`；find 时 `hasPaginationDocs=true`
', '{}'::jsonb,
  true, '2026-06-26T14:21:10.590Z', '2026-07-30T20:29:17.296Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666630',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '批量创建 API 服务', 'apiservice-create-services-batch', 'apiservice_create_services_batch',
  '按实体批量创建 CRUD 等多个 API 服务（每个服务一个 operation）', 'client',
  '{"type":"object","properties":{"tags":{"type":"array","items":{"type":"string"}},"publish":{"type":"boolean"},"entityId":{"type":"string"},"services":{"type":"array","items":{"type":"object","properties":{"code":{"type":"string"},"name":{"type":"string"},"operation":{"type":"string"},"definitionScript":{"type":"string"}}}},"scopeCode":{"type":"string"},"entityCode":{"type":"string","description":"实体 code"},"namePrefix":{"type":"string"},"operations":{"type":"array","items":{"type":"string"},"description":"默认 find,create,updateOne,deleteOne"},"entityCodes":{"type":"array","items":{"type":"string"}},"connectionId":{"type":"string"}}}'::jsonb, '## apiservice_create_services_batch

用户要「CRUD / 全套 API」时使用此工具。

### 创建前
先 `apiservice_list_services`（codePrefix）避免重复。

### 编码
- 须有实体：`entityCode` / `entityCodes`
- 每个 operation 的 code = 实体前缀 + `:` + `末段+后缀`（如 EquipmentFind / EquipmentCreate）
- 后缀驼峰：Find、Create、Update、Delete…

### 自动生成
```json
{ "entityCodes": ["equipment:Equipment"], "namePrefix": "设备" }
```

### 返回
- created / skipped（已存在非失败）/ failed', '{}'::jsonb,
  true, '2026-06-26T17:02:19.867Z', '2026-07-23T10:29:53.183Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666626',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '删除 API 服务', 'apiservice-delete-service', 'apiservice_delete_service',
  '永久删除 API 服务（物理删除，不可恢复）', 'client',
  '{"type":"object","properties":{"code":{"type":"string"},"serviceId":{"type":"string"}}}'::jsonb, '## apiservice_delete_service', '{}'::jsonb,
  true, '2026-06-26T14:21:10.590Z', '2026-07-10T15:16:57.987Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666625',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '禁用 API 服务', 'apiservice-disable-service', 'apiservice_disable_service',
  '禁用已发布的 API 服务', 'client',
  '{"type":"object","properties":{"code":{"type":"string"},"serviceId":{"type":"string"}}}'::jsonb, '## apiservice_disable_service', '{}'::jsonb,
  true, '2026-06-26T14:21:10.590Z', '2026-07-10T15:16:57.987Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666636',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '过滤 API 服务', 'apiservice-filter-services', 'apiservice_filter_services',
  '按 status/codePrefix 过滤 API 服务（与 list_services 同源，默认 size=-1）。status=ALL 不过滤；找 draft 须传 status=draft 或改用 apiservice_list_draft_services', 'client',
  '{"type":"object","properties":{"tag":{"type":"string","description":"标签精确匹配"},"status":{"enum":["draft","published","disabled"],"type":"string"},"codePrefix":{"type":"string","description":"code 前缀，如 equipment"},"connectionId":{"type":"string"}}}'::jsonb, '## apiservice_filter_services

与 **`apiservice_list_services` 同源**（同一查询）。

### 参数
- `codePrefix`：前缀匹配（精确 / `prefix:` 域段 / 末段软前缀）。例 `IPS:production`、`IPS:production:BomInstance`（可匹配 `BomInstanceCreate`）
- `status`：`draft` | `published` | `disabled` | **`ALL`（不过滤）**；省略等同 ALL
- `size` / `page`：默认 size=-1 全量

### 注意
- **禁止**用本 Tool 替代实体覆盖率对比（须 `list_services` + `bizdata_list_entity_summaries`）
- 找 draft 优先 `apiservice_list_draft_services`
- 超预算时结果含 `truncated` / `hint`，勿把半截 JSON 当成 total=0
', '{}'::jsonb,
  true, '2026-07-10T15:16:57.987Z', '2026-07-23T03:42:20.055Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666621',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '获取 API 服务详情', 'apiservice-get-service', 'apiservice_get_service',
  '获取 API 服务详情；默认省略脚本正文，改 SQL/Handler 时传 includeScripts=true', 'client',
  '{"type":"object","properties":{"code":{"type":"string"},"scopeCode":{"type":"string"},"serviceId":{"type":"string"},"serviceSlug":{"type":"string"}}}'::jsonb, '## apiservice_get_service

定位：serviceId / code / scopeCode+serviceSlug。

### 调用时机
- **允许**：完善流程中、`run_test` **之前**，确认脚本非占位、interface 完整
- **禁止**：`run_test` 已 success 后再调用「查看完整 handler」——会导致无意义循环

### 脚本正文
默认不返回 `definitionScript` / `handlerScript`；需要全文时传 `includeScripts=true`。
', '{}'::jsonb,
  true, '2026-06-26T14:21:10.590Z', '2026-07-23T03:42:20.075Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666631',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '获取 API 测试上下文', 'apiservice-get-test-profile', 'apiservice_get_test_profile',
  '获取 API 服务测试 profile：参数结构、mock 参数、请求预览', 'client',
  '{"type":"object","properties":{"code":{"type":"string"},"serviceId":{"type":"string"}}}'::jsonb, '## apiservice_get_test_profile

返回 enabledOperations 列表，每项含 parameterSchema、mockParameters、requestPreview。

测试弹窗打开时可用 aibase_read_surfaces（surfaceId=api-services.test）读取当前选中 operation。', '{}'::jsonb,
  true, '2026-06-28T07:48:06.574Z', '2026-07-10T15:16:57.987Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666628',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  'API 服务域树', 'apiservice-get-tree', 'apiservice_get_tree',
  '按 code 域层级获取 API 服务树', 'client',
  '{"type":"object","properties":{"codePrefix":{"type":"string"}}}'::jsonb, '## apiservice_get_tree', '{}'::jsonb,
  true, '2026-06-26T14:21:10.590Z', '2026-07-10T15:16:57.987Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666627',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  'Operation 目录', 'apiservice-list-operations', 'apiservice_list_operations',
  '获取 API 服务可用 operation 元数据目录', 'client',
  '{"type":"object","properties":{}}'::jsonb, '## apiservice_list_operations', '{}'::jsonb,
  true, '2026-06-26T14:21:10.590Z', '2026-07-10T15:16:57.987Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666620',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '列出 API 服务', 'apiservice-list-services', 'apiservice_list_services',
  '列出 API 服务（默认 size=-1）。status=ALL 不过滤；找 draft 须传 status=draft 或用 apiservice_list_draft_services', 'client',
  '{"type":"object","properties":{"tag":{"type":"string"},"page":{"type":"integer"},"size":{"type":"integer"},"status":{"enum":["draft","published","disabled"],"type":"string"},"codePrefix":{"type":"string"},"connectionId":{"type":"string"}}}'::jsonb, '## apiservice_list_services

返回 items 与 total。size=-1 可拉取全部。

### status / codePrefix
- `status=ALL` 或省略 = 不过滤（勿把 ALL 当成字面状态）
- `codePrefix` 支持末段软前缀，如 `scope:Entity` 匹配 `scope:EntityCreate`
', '{}'::jsonb,
  true, '2026-06-26T14:21:10.590Z', '2026-07-23T03:42:20.072Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666634',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  'API 服务页面跳转', 'apiservice-navigate', 'apiservice_navigate',
  '在 list / test 页面间跳转，支持返回测试页后 autoRunTest', 'client',
  '{"type":"object","required":["target"],"properties":{"code":{"type":"string"},"target":{"enum":["list","test"],"type":"string"},"serviceId":{"type":"string"},"fixContext":{"type":"object"},"autoRunTest":{"type":"boolean"}}}'::jsonb, '## apiservice_navigate

- target=test：跳转测试页；autoRunTest=true 时落地后自动执行测试
- target=list：服务列表

配置/SQL 修复流程：update_service（执行后自动跳转至服务列表） → test(autoRunTest=true)', '{}'::jsonb,
  true, '2026-06-28T07:48:06.574Z', '2026-07-10T15:16:57.987Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666624',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '发布 API 服务', 'apiservice-publish-service', 'apiservice_publish_service',
  '将 draft 服务发布为 published', 'client',
  '{"type":"object","properties":{"code":{"type":"string"},"serviceId":{"type":"string"}}}'::jsonb, '## apiservice_publish_service', '{}'::jsonb,
  true, '2026-06-26T14:21:10.590Z', '2026-07-10T15:16:57.987Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666629',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '推断数据库连接与 Schema', 'apiservice-resolve-connection', 'apiservice_resolve_connection',
  '按主实体/Scope 物化记录推断 connectionId 与 targetSchema；禁止向用户索要 connectionId。写 SQL 必须使用返回的 targetSchema', 'client',
  '{"type":"object","properties":{"entityIds":{"type":"array","items":{"type":"string"}},"scopeCode":{"type":"string","description":"Scope 引用 code"},"entityCodes":{"type":"array","items":{"type":"string"}},"connectionId":{"type":"string","description":"通常无需传入"}}}'::jsonb, '## apiservice_resolve_connection

**禁止**向用户询问 connectionId。

### 推断规则
1. 仅一个连接 → 直接使用
2. 有 **主实体**（entityId / entityCodes）→ 按该实体物化记录选连接，并返回物化 `targetSchema`
3. 仅有 Scope → 选 Scope 下已物化实体最多的连接
4. 仍无法区分 → 默认连接或 PostgreSQL 连接

### 返回（重要）
- `connectionId` / `connectionName` / `dbType`
- **`targetSchema`**：写 `definitionScript`（SQL）时 **必须** 使用 `"<targetSchema>"."<table>"`
- **禁止**默认写死 `bizdata_mat`；以本 Tool 或 Surface 的 `targetSchema` 为准

### 入参优先级
- 推荐传 entityId / entityCodes（表单「主实体」）
- Chat 引用：type=entity → entityCodes；type=scope → scopeCode', '{}'::jsonb,
  true, '2026-06-26T16:58:01.402Z', '2026-07-23T10:09:21.920Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666633',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '执行 API 服务测试', 'apiservice-run-test', 'apiservice_run_test',
  '执行 API 测试；success+verified 后立即收束，禁止再 get_service 看 handler', 'client',
  '{"type":"object","required":["operation"],"properties":{"code":{"type":"string"},"operation":{"type":"string"},"serviceId":{"type":"string"},"parameters":{"type":"object"}}}'::jsonb, '## apiservice_run_test

### 成功判定
- `success: true` 且 `verified: true`（或等价成功信封）才可声称测试通过
- `executable: false` / 仅校验 **不算** 测试通过

### 收束（必遵，防循环）
- 测试**成功后立即向用户汇报并结束本轮**，可附带 preview 摘要
- **禁止**成功后再调用 `apiservice_get_service` / `aibase_read_surfaces` / `apiservice_check_handler`「确认完整 handler」
- **禁止**成功后再改 handler 除非用户明确要求继续修改
- `get_service` 只允许在**测试前**（update 之后）用于确认非占位脚本', '{}'::jsonb,
  true, '2026-06-28T07:48:06.574Z', '2026-07-17T12:47:27.050Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666635',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '设置 API 测试 mock 参数', 'apiservice-set-test-params', 'apiservice_set_test_params',
  '将 AI 修正后的 mock 参数写入测试页（不调用 suggest 接口）', 'client',
  '{"type":"object","properties":{"code":{"type":"string"},"operation":{"type":"string"},"serviceId":{"type":"string"},"parameters":{"type":"object"},"mockParameters":{"type":"object"}}}'::jsonb, '## apiservice_set_test_params

传 operation（必填）+ parameters 或 mockParameters（完整 JSON 对象）。

### 作用
- **持久化**到服务 security_config.testMockParameters（按 operation 存储）
- mutation 同步到 surfaceId=api-services.test 的表单

### 调用时机（重要）
- 参数类问题：`run_test` **执行成功后**必须调用本 Tool 保存已通过测试的 mock
- 生成/完善 mock 后测试通过，同样必须保存
- 禁止仅 run_test 成功就结束而不保存 mock', '{}'::jsonb,
  true, '2026-06-28T07:48:06.574Z', '2026-07-10T15:16:57.987Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666632',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '生成 API 测试 mock 参数', 'apiservice-suggest-test-params', 'apiservice_suggest_test_params',
  '按实体字段、Handler params 与 requestParameterInterface 生成测试 mock', 'client',
  '{"type":"object","properties":{"code":{"type":"string"},"operation":{"type":"string"},"serviceId":{"type":"string"}}}'::jsonb, '## apiservice_suggest_test_params

调用后通过 mutation 将 mockParameters 写入测试弹窗。

优先根据：实体字段、`requestParameterInterface`、Handler 中 `params.xxx` 生成示例值。typescript 模式务必覆盖 interface 自定义字段。', '{}'::jsonb,
  true, '2026-06-28T07:48:06.574Z', '2026-07-17T05:39:21.169Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666623',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '更新 API 服务', 'apiservice-update-service', 'apiservice_update_service',
  '更新 API 服务；find 须补全 items+pagination 响应文档；测前可 get_service，测过后禁止循环回读', 'client',
  '{"type":"object","properties":{"code":{"type":"string","description":"服务 code（非实体 code）；也可用 serviceId 或 scopeCode+serviceSlug"},"name":{"type":"string"},"tags":{"type":"array","items":{"type":"string"}},"scopeCode":{"type":"string"},"serviceId":{"type":"string"},"scriptMode":{"enum":["sql","typescript"],"type":"string"},"description":{"type":"string"},"serviceSlug":{"type":"string"},"connectionId":{"type":"string"},"handlerScript":{"type":"string"},"definitionScript":{"type":"string"},"accessRestriction":{"type":"object","properties":{"mode":{"enum":["none","role","department"],"type":"string"},"roleIds":{"type":"array","items":{"type":"string"}},"departmentIds":{"type":"array","items":{"type":"string"}}}},"enabledOperations":{"type":"array","items":{"type":"string"}},"requestParameterInterface":{"type":"string","description":"设计期 TS interface；补全请求结构时必须传非空字符串"}}}'::jsonb, '## apiservice_update_service

定位：serviceId / code / scopeCode+serviceSlug。

### TypeScript Handler
- **契约权威源**：`apiservice_check_handler` review；保存前必须 check 通过
- 用 `paginate` → 含 `pagination`；禁止双重 where / queryPg

### 响应文档（完善时必遵）
- find：**必须**写入 `responseOverrides`，形状为 `data.items` + `data.pagination`
- pagination 字段：`total, page, pageSize, totalPages, hasNext`
- **禁止**仅平铺 `total`/`count`；**禁止** `"item": null`

### 更新后校验顺序（必遵）
1. （可选）测前 `apiservice_get_service` 确认非占位
2. `apiservice_run_test`
3. **一旦 success=true（及 verified）→ 立即汇报并 STOP**
4. **禁止**测试成功后再 `get_service` / `read_surfaces`「查看完整 handler」
', '{}'::jsonb,
  true, '2026-06-26T14:21:10.590Z', '2026-07-30T20:29:17.296Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666607',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '添加关系', 'bizdata-add-relation', 'bizdata_add_relation',
  '添加实体关系；必须传 fromEntityCode/toEntityCode；manyToOne/oneToOne 前源实体须有外键字段；成功以 _verification.verified 为准', 'client',
  '{"type":"object","required":["type","name","fromEntityCode","toEntityCode"],"properties":{"name":{"type":"string","description":"同一 from 实体内唯一；推荐目标短名 camelCase 或外键去 Id"},"type":{"enum":["oneToMany","manyToOne","oneToOne","manyToMany"],"type":"string"},"config":{"type":"object","description":"可选 foreignKey=源实体外键 fieldKey"},"joinTable":{"type":"string"},"toEntityId":{"type":"string"},"inverseName":{"type":"string"},"fromEntityId":{"type":"string"},"toEntityCode":{"type":"string","description":"目标实体 code（必填）"},"fromEntityCode":{"type":"string","description":"源实体 code（必填）"}}}'::jsonb, '## bizdata_add_relation

**必须**传 `fromEntityCode` / `toEntityCode`（禁止编造 UUID）。

### 添加前（必遵）
1. `bizdata_get_entity(fromEntityCode)` 确认外键字段
2. **manyToOne / oneToOne**：from 侧须有 `name` / `nameId` / `name_id` 或 `config.foreignKey`；没有则先 `bizdata_update_entity`
3. name：同一 from 内唯一；推荐目标短名 camelCase（`Customer`→`customer`）或外键去 Id（`materialId`→`material`）；禁止 `bomSchemeNode_material` 拼接

### type（from → to）
- **manyToOne**：多方 → 一方（Order → Customer）
- **oneToMany** / **oneToOne** / **manyToMany**

### 添加后
- 以 `_verification.verified=true` 为准；再用 `bizdata_list_relations({ entityCode })` 核对
- **禁止**口头声称「已生效」
- 重名错误会带上已有边的 from/to code；重名 ≠ 要加的边已存在', '{}'::jsonb,
  true, '2026-06-22T11:33:21.115Z', '2026-07-22T18:58:20.919Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666639',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '浏览物化表数据', 'bizdata-browse-materialized-rows', 'bizdata_browse_materialized_rows',
  '分页读取已物化物理表数据（开发预览）', 'server_builtin',
  '{"type":"object","required":["connectionId"],"properties":{"page":{"type":"integer"},"entityId":{"type":"string"},"pageSize":{"type":"integer"},"entityCode":{"type":"string"},"connectionId":{"type":"string"}}}'::jsonb, '## bizdata_browse_materialized_rows

传 connectionId + entityCode，可选 page/pageSize。插入 MOCK 前可先查看现有数据。', '{"handler":"bizdata_browse_materialized_rows"}'::jsonb,
  true, '2026-06-29T10:42:50.620Z', '2026-06-29T10:42:50.620Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666638',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '浏览物化表结构', 'bizdata-browse-materialized-schema', 'bizdata_browse_materialized_schema',
  '读取已物化物理表/集合/Redis 结构的字段定义', 'server_builtin',
  '{"type":"object","required":["connectionId"],"properties":{"entityId":{"type":"string"},"entityCode":{"type":"string"},"connectionId":{"type":"string"}}}'::jsonb, '## bizdata_browse_materialized_schema

**插入 MOCK 前必调**。传 connectionId + entityCode。

返回 columns 数组，rows 的 key 须与 columns.name 一致（通常等于 fieldKey）。', '{"handler":"bizdata_browse_materialized_schema"}'::jsonb,
  true, '2026-06-29T10:42:50.620Z', '2026-06-30T05:14:33.652Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666614',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '创建数据标准', 'bizdata-create-data-standard', 'bizdata_create_data_standard',
  '创建数据标准记录（name/code/version 必填）', 'client',
  '{"type":"object","required":["name","code","version"],"properties":{"code":{"type":"string"},"name":{"type":"string"},"status":{"enum":["enabled","disabled"],"type":"string"},"version":{"type":"string"},"description":{"type":"string"}}}'::jsonb, '## bizdata_create_data_standard

同一 code+version 不可重复。', '{}'::jsonb,
  true, '2026-06-27T16:36:07.478Z', '2026-06-27T17:19:42.420Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666603',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '创建实体', 'bizdata-create-entity', 'bizdata_create_entity',
  '创建 ER/JSON 实体；status/state/*_type 须先 create_enum，字段 type=adb-enum + enumCode', 'client',
  '{"type":"object","required":["code","label"],"properties":{"code":{"type":"string"},"label":{"type":"string"},"fields":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string","description":"同 fieldKey"},"type":{"type":"string","description":"varchar/int/uuid/decimal 等；有限取值须用 adb-enum（配合 enumCode）"},"label":{"type":"string"},"length":{"type":"integer"},"unique":{"type":"boolean"},"primary":{"type":"boolean"},"enumCode":{"type":"string","description":"枚举 code（如 production:WorkOrderStatus）；type=adb-enum 时必填"},"fieldKey":{"type":"string"},"nullable":{"type":"boolean"},"columnInfo":{"type":"object"},"enumConfig":{"type":"object","properties":{"enumCode":{"type":"string"},"isMultiple":{"type":"boolean"}}},"extendType":{"type":"string","description":"扩展类型；枚举可写 adb-enum（与 type=adb-enum 等价）"},"typeormConfig":{"type":"object"}}},"description":"字段列表；status/state/*_type 等须 type=adb-enum 并指定 enumCode（先 bizdata_create_enum）"},"indexes":{"type":"array","items":{"type":"object"}},"relations":{"type":"array","items":{"type":"object"}},"tableName":{"type":"string"},"entityKind":{"enum":["er_table","json_schema"],"type":"string"}}}'::jsonb, '## bizdata_create_entity

code 格式 `Scope1[:Scope2...]:EntityName`。**仅用于 code 不存在的新实体**；若已存在请用 `bizdata_rename_entity_code`。推荐同时传 fields、indexes、relations；分步则须 upsert_entity_indexes 与 add_relation。**禁止** delete + create 改 Scope。

### 枚举字段（status/state/*_type 等）
**禁止**用 varchar。流程：
1. `bizdata_list_enums`
2. 无则 `bizdata_create_enum`（code + values）
3. 字段**同时**传 `type` 与 `enumCode`：
```json
{ "fieldKey": "station_type", "type": "adb-enum", "enumCode": "fmms:StationType", "label": "站点类型" }
```
禁止只改 `typeormConfig.type`，或只传 `type=adb-enum` 不传 `enumCode`。', '{}'::jsonb,
  true, '2026-06-22T11:33:21.115Z', '2026-07-17T01:04:29.077Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666606',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '创建枚举', 'bizdata-create-enum', 'bizdata_create_enum',
  '创建 ADB 枚举；有限取值字段须先建枚举，再在实体字段用 type=adb-enum + enumCode 引用', 'client',
  '{"type":"object","required":["code","values"],"properties":{"code":{"type":"string"},"items":{"type":"object"},"label":{"type":"string"},"values":{"type":"object"}}}'::jsonb, '## bizdata_create_enum

code 如 `production:WorkOrderStatus` / `fmms:StationType`。推荐同时传 values + items；仅 values 时服务端补 items。

### 引用到实体字段（create/update_entity 时必传 enumCode）
```json
{ "fieldKey": "station_type", "type": "adb-enum", "enumCode": "fmms:StationType", "label": "站点类型" }
```
禁止只传 `type=adb-enum` 而不传 `enumCode`。', '{}'::jsonb,
  true, '2026-06-22T11:33:21.115Z', '2026-07-17T01:04:29.088Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666616',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '删除数据标准', 'bizdata-delete-data-standard', 'bizdata_delete_data_standard',
  '删除数据标准（被元数据引用时失败）', 'client',
  '{"type":"object","required":["id"],"properties":{"id":{"type":"string"}}}'::jsonb, '## bizdata_delete_data_standard', '{}'::jsonb,
  true, '2026-06-27T16:36:07.478Z', '2026-06-27T17:19:42.420Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666605',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '删除实体', 'bizdata-delete-entity', 'bizdata_delete_entity',
  '事务化级联删除实体（含 API 服务/采集管道/指标/元数据目录；可选 DROP 物理表）。可传 deleteEntityIds 批量删除。禁止用于 Scope 调整', 'client',
  '{"type":"object","properties":{"entityId":{"type":"string","description":"根实体 UUID（与 entityCode 二选一）"},"entityCode":{"type":"string","description":"实体 code"},"deleteEntityIds":{"type":"array","items":{"type":"string"},"description":"待删除实体 UUID 列表（优先；来自删除确认）"},"dropPhysicalTables":{"type":"boolean","description":"是否 CASCADE DROP 各物化连接物理表/集合，默认 false"}}}'::jsonb, '## bizdata_delete_entity

**禁止**用于 Scope 调整/code 重命名（用 `bizdata_rename_entity_code`）。

### 参数
- `deleteEntityIds`：待删实体 UUID 列表（删除确认 Modal / 影响分析后优先传）
- 或 `entityId` / `entityCode`：仅删单个实体时使用
- `dropPhysicalTables`：是否 DROP 物化物理表（默认 false）

### 行为
- 事务内删除：API 服务、采集管道绑定、关联指标、逻辑元数据目录（entity/metric）、实体本身（字段/关系/物化明细 CASCADE）
- 可选：各连接上 CASCADE DROP 物理表/集合（best-effort，不可回滚）

须 `_verification.verified=true` 才算成功。', '{}'::jsonb,
  true, '2026-06-22T11:33:21.115Z', '2026-07-14T11:52:27.623Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  'b8a93b0a-d56f-4ccf-b8de-de27df190a13',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '删除关系', 'bizdata-delete-relation', 'bizdata_delete_relation',
  '删除实体关系', 'client',
  '{"type":"object","required":["relationId"],"properties":{"relationId":{"type":"string"}}}'::jsonb, '## bizdata_delete_relation\n\nrelationId 来自 bizdata_list_relations。', '{}'::jsonb,
  true, '2026-06-29T08:39:45.928Z', '2026-06-29T08:39:45.928Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666610',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '执行物化', 'bizdata-execute-materialization', 'bizdata_execute_materialization',
  '执行 DDL 物化并记录 entity_version', 'server_builtin',
  '{"type":"object","properties":{"dryRun":{"type":"boolean","description":"true=仅预览；正式执行须 false"},"entityIds":{"type":"array","items":{"type":"string"}},"connectionId":{"type":"string","description":"数据库连接 UUID"},"targetSchema":{"type":"string","description":"目标 Schema；MySQL 下即库名"},"expectedVersions":{"type":"object"},"createTargetIfMissing":{"type":"boolean","description":"目标不存在时是否自动创建；仅用户确认后为 true"}}}'::jsonb, '## bizdata_execute_materialization\n\n执行前确认 dryRun=false。多连接时传 connectionId。\n\n### 目标 Schema/库不存在（409 TARGET_NOT_FOUND）\n1. 禁止同参重试 / 重载 Skill / http_request 探路\n2. ask_user 确认是否创建目标库（MySQL Schema 即库）\n3. 同意后相同参数 + createTargetIfMissing=true\n4. bizdata_create_database_connection 只登记连接，不建物理库', '{"handler":"bizdata_execute_materialization"}'::jsonb,
  true, '2026-06-22T11:33:21.115Z', '2026-06-22T11:35:04.813Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666602',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '获取实体详情', 'bizdata-get-entity', 'bizdata_get_entity',
  '按 ID 或 code 获取实体详情（含字段）；优先 entityCode', 'client',
  '{"type":"object","properties":{"entityId":{"type":"string","description":"实体 UUID，须来自 list，禁止编造 entity-xxx"},"entityCode":{"type":"string","description":"实体 code，如 equipment:Device"}}}'::jsonb, '## bizdata_get_entity

**优先传 entityCode**（如 `equipment:Device`）。

- entityId 必须是 `bizdata_list_entities` 返回的 UUID
- **禁止**编造 `entity-equipment-device`、`md-xxx` 等假 id
- 完善字段元数据时，更推荐 `bizdata_get_metadata_by_target` + `bizdata_update_metadata_fields`', '{}'::jsonb,
  true, '2026-06-22T11:33:21.115Z', '2026-06-27T17:37:56.015Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666612',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '物化状态', 'bizdata-get-materialization-status', 'bizdata_get_materialization_status',
  '获取各实体当前版本与物化版本对比；可按 entityCodes/entityIds/connectionId 过滤', 'server_builtin',
  '{"type":"object","properties":{"entityIds":{"type":"array","items":{"type":"string"},"description":"按实体 UUID 过滤"},"entityCodes":{"type":"array","items":{"type":"string"},"description":"按实体 code 过滤（如 FPV:Drone）；优先于全量拉取后再 JS walk"},"connectionId":{"type":"string","description":"数据库连接 UUID；多连接时建议传，避免全连接笛卡尔积"}}}'::jsonb, '## bizdata_get_materialization_status

查看实体模型版本 vs 已物化版本（stale / latest / not_materialized）。

### 参数
- `connectionId`：多连接时建议传
- `entityCodes`：指定实体 code 数组（如 `["FPV:Drone","FPV:Mission"]`），**不要**无过滤拉全量再 JS walk
- `entityIds`：可选，按 UUID 过滤

### 返回
每项含 `entityCode`（与 `code` 相同）、`staleStatus`、`currentVersion`、`materializedVersion`、`connectionId` 等。

### 调用方式
- **优先 native** 直接调用本 Tool
- 禁止用 `run_code` 对全量结果做 walk 过滤；若确需编排，`await tools.bizdata_get_materialization_status({ entityCodes, connectionId })` 即可', '{"handler":"bizdata_get_materialization_status"}'::jsonb,
  true, '2026-06-22T11:33:21.115Z', '2026-06-22T11:35:04.813Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666619',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '按 target 获取元数据', 'bizdata-get-metadata-by-target', 'bizdata_get_metadata_by_target',
  '按 entity/metric/enum 目标获取元数据（可选 fieldKey 取字段级）', 'client',
  '{"type":"object","required":["targetType","targetId"],"properties":{"fieldKey":{"type":"string"},"targetId":{"type":"string"},"targetType":{"enum":["entity","metric","enum"],"type":"string"}}}'::jsonb, '## bizdata_get_metadata_by_target

targetType + targetId 定位逻辑对象；fieldKey 可选，返回单字段元数据。', '{}'::jsonb,
  true, '2026-06-27T16:36:07.478Z', '2026-06-27T17:19:42.420Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666618',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '获取元数据表详情', 'bizdata-get-metadata-table', 'bizdata_get_metadata_table',
  '获取元数据表详情（含字段）；可传 code 如 equipment:Device', 'client',
  '{"type":"object","properties":{"id":{"type":"string","description":"元数据表 UUID，须来自 list"},"code":{"type":"string","description":"逻辑编码 equipment:Device"},"entityCode":{"type":"string"}}}'::jsonb, '## bizdata_get_metadata_table

**优先传 code / entityCode**，不要编造 `md-equipment-device`。

批量补字段请用 `bizdata_update_metadata_fields`（传 entityCode + fields）。', '{}'::jsonb,
  true, '2026-06-27T16:36:07.478Z', '2026-06-27T17:37:56.022Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666644',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '读取 Scope 业务说明', 'bizdata-get-scope-description', 'bizdata_get_scope_description',
  '读取 Scope 业务说明（Markdown）及祖先链有内容的说明；对某 Scope 建模前应先调用', 'client',
  '{"type":"object","required":["scopeCode"],"properties":{"scopeCode":{"type":"string","description":"Scope code，如 IPS 或 IPS:bom"}}}'::jsonb, '## bizdata_get_scope_description

读取 Scope 级业务说明（类似 Skill 的领域知识，不是字段 DDL）。

### 参数
- **scopeCode**：与模型树 Scope 节点一致，如 `IPS`、`IPS:bom`

### 返回
- `contentMarkdown`：本 Scope 正文（可空）
- `ancestors`：祖先链上**有内容**的说明（由近及远）

### 何时用
- 对某 Scope 下实体做设计/补齐前，**优先**调用本 Tool
- Surface `scopeDocsSummary` 可提示哪些 Scope 已有说明', '{}'::jsonb,
  true, '2026-07-24T04:54:01.037Z', '2026-07-24T04:54:01.037Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666640',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '插入MOCK数据', 'bizdata-insert-mock-data', 'bizdata_insert_mock_data',
  '向已物化物理表插入 MOCK 测试数据（开发/测试用途）', 'server_builtin',
  '{"type":"object","required":["connectionId","rows"],"properties":{"rows":{"type":"array","items":{"type":"object"},"description":"行对象数组，字段名对应 fieldKey"},"entityId":{"type":"string"},"rowCount":{"type":"integer"},"entityCode":{"type":"string"},"connectionId":{"type":"string"}}}'::jsonb, '## bizdata_insert_mock_data

**仅开发测试**。

1. 必须先 `bizdata_browse_materialized_schema` 获取 columns.name
2. rows 的 key 必须与物理表列名完全一致
3. 传 connectionId + entityCode + rows
4. 枚举用 enum items 的 value；外键引用已插入 id
5. 禁止未调用本 Tool 就声称插入成功；汇总须用返回的 inserted 字段', '{"handler":"bizdata_insert_mock_data"}'::jsonb,
  true, '2026-06-29T10:42:50.620Z', '2026-06-30T05:14:33.652Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666613',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '列出数据标准', 'bizdata-list-data-standards', 'bizdata_list_data_standards',
  '分页列出数据标准（标准名、编码、版本、状态）', 'client',
  '{"type":"object","properties":{"page":{"type":"integer"},"size":{"type":"integer"},"status":{"enum":["enabled","disabled"],"type":"string"},"keyword":{"type":"string"}}}'::jsonb, '## bizdata_list_data_standards

返回 total 与 items。默认 size=50。', '{}'::jsonb,
  true, '2026-06-27T16:36:07.478Z', '2026-06-27T17:19:42.420Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666641',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '列出实体', 'bizdata-list-entity-summaries', 'bizdata_list_entity_summaries',
  '列出业务数据实体（不含 fields，含 fieldCount）；浏览 Scope、子域、批量操作、对照 API 服务时**默认使用本 Tool**', 'client',
  '{"type":"object","properties":{"page":{"type":"integer"},"size":{"type":"integer","description":"默认 500，最大 500"},"codePrefix":{"type":"string","description":"code 前缀，如 fmms 或 fmms:logistics"},"entityKind":{"enum":["er_table","json_schema"],"type":"string"}}}'::jsonb, '## bizdata_list_entity_summaries

**列出 / 浏览实体时的默认 Tool**（响应小，不含 fields）。

返回：`id`、`code`、`label`、`entityKind`、`tableName`、`status`、`version`、`fieldCount`、`modelValidated`。

- 按子域过滤：传 `codePrefix`（如 `fmms:logistics`）
- 需要字段详情：再调 **`bizdata_get_entity`**（entityCode）

**禁止**为列举实体而调用已停用的 `bizdata_list_entities`。', '{}'::jsonb,
  true, '2026-07-13T03:36:23.944Z', '2026-07-13T03:44:59.846Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  'af8d3be3-0494-4d79-b727-d7bb513f52a2',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '列出枚举', 'bizdata-list-enums', 'bizdata_list_enums',
  '列出 ADB 枚举；检查选项时看 items，items 空而 values 有值须用 bizdata_update_enum 补齐', 'client',
  '{"type":"object","properties":{"codePrefix":{"type":"string","description":"如 production:"}}}'::jsonb, '## bizdata_list_enums

创建 status 等字段前先查可复用枚举。

返回每项含 `optionCount`、`itemsEmpty`：
- **itemsEmpty=true**：values 有选项但 items 空 → UI 显示 0，须 **`bizdata_update_enum`** 补齐 items
- 判断「是否有选项」优先看 items，不要只看 values', '{}'::jsonb,
  true, '2026-06-29T08:39:45.928Z', '2026-07-16T12:45:51.685Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666611',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '物化历史', 'bizdata-list-materialization-runs', 'bizdata_list_materialization_runs',
  '查询物化批次历史', 'server_builtin',
  '{"type":"object","properties":{"page":{"type":"integer"},"pageSize":{"type":"integer"}}}'::jsonb, '## bizdata_list_materialization_runs', '{"handler":"bizdata_list_materialization_runs"}'::jsonb,
  true, '2026-06-22T11:33:21.115Z', '2026-06-22T11:35:04.813Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666617',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '列出元数据逻辑表', 'bizdata-list-metadata-tables', 'bizdata_list_metadata_tables',
  '列出逻辑元数据表（entity/metric/enum）', 'client',
  '{"type":"object","properties":{"page":{"type":"integer"},"size":{"type":"integer"},"keyword":{"type":"string"},"targetType":{"enum":["entity","metric","enum"],"type":"string"}}}'::jsonb, '## bizdata_list_metadata_tables

逻辑元数据对应数据模型/指标/枚举，非物理表。', '{}'::jsonb,
  true, '2026-06-27T16:36:07.478Z', '2026-06-27T17:19:42.420Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  'bcc7f2f7-c45b-4b0f-a75b-6a308e934568',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '列出关系', 'bizdata-list-relations', 'bizdata_list_relations',
  '列出实体关系（含 fromEntityCode/toEntityCode/directionSummary）；可传 entityCode 过滤', 'client',
  '{"type":"object","properties":{"entityId":{"type":"string"},"entityCode":{"type":"string","description":"按实体 code 过滤（from 或 to 命中）"}}}'::jsonb, '## bizdata_list_relations

- 不传参：全部关系
- 传 `entityCode`：只返回该实体作为 from 或 to 的边
- 每条含 `fromEntityCode`、`toEntityCode`、`directionSummary`（如 `sale:Order --manyToOne--> sale:Customer (name=customer)`）
- 添加关系后应用本 Tool（带 entityCode）做回读验证', '{}'::jsonb,
  true, '2026-06-29T08:39:45.928Z', '2026-07-22T18:58:20.944Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666676',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '删除指标卡片', 'bizdata-metric-card-delete', 'bizdata_metric_card_delete',
  '删除看板卡片（不删除底层指标）', 'client',
  '{"type":"object","properties":{"code":{"type":"string"},"cardId":{"type":"string"}}}'::jsonb, '## bizdata_metric_card_delete

仅删卡片配置，不影响 metrics 定义。', '{}'::jsonb,
  true, '2026-07-18T00:45:37.814Z', '2026-07-18T21:53:31.010Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666674',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '获取指标卡片', 'bizdata-metric-card-get', 'bizdata_metric_card_get',
  '按 cardId 或 code 获取指标卡片', 'client',
  '{"type":"object","properties":{"code":{"type":"string"},"cardId":{"type":"string"}}}'::jsonb, '## bizdata_metric_card_get', '{}'::jsonb,
  true, '2026-07-18T00:45:37.814Z', '2026-07-18T21:53:31.010Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666673',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '列出指标卡片', 'bizdata-metric-card-list', 'bizdata_metric_card_list',
  '列出【看板卡片】metric_cards。不是指标定义；查指标用 bizdata_metric_list', 'client',
  '{"type":"object","properties":{"page":{"type":"integer"},"size":{"type":"integer"},"status":{"enum":["enabled","disabled"],"type":"string"},"domainCode":{"type":"string"}}}'::jsonb, '## bizdata_metric_card_list

返回 **metric_cards** 配置。

与 `bizdata_metric_list` 完全不同：后者是指标定义。', '{}'::jsonb,
  true, '2026-07-18T00:45:37.814Z', '2026-07-18T21:53:31.010Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666677',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '建议指标卡片', 'bizdata-metric-card-suggest', 'bizdata_metric_card_suggest',
  '根据指标历史建议 vizType 并打开看板新建草稿', 'client',
  '{"type":"object","properties":{"code":{"type":"string"},"metricId":{"type":"string"},"metricCode":{"type":"string"}}}'::jsonb, '## bizdata_metric_card_suggest

根据 metric_values 形状建议 statistic_trend/line/bar/ring；mutation 打开看板表单草稿，用户确认后调用 upsert。', '{}'::jsonb,
  true, '2026-07-18T00:45:37.814Z', '2026-07-18T21:53:31.010Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666675',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '创建或更新指标卡片', 'bizdata-metric-card-upsert', 'bizdata_metric_card_upsert',
  '创建或更新【看板卡片】metric_cards。看板要出现内容必须用本 Tool，禁止用 bizdata_metric_upsert 代替', 'client',
  '{"type":"object","required":["code","title","domainCode","vizType"],"properties":{"code":{"type":"string"},"title":{"type":"string"},"cardId":{"type":"string"},"config":{"type":"object"},"status":{"enum":["enabled","disabled"],"type":"string"},"vizType":{"enum":["statistic_trend","line","bar","ring"],"type":"string"},"metricId":{"type":"string"},"sortOrder":{"type":"integer"},"domainCode":{"type":"string"},"metricCode":{"type":"string"},"description":{"type":"string"}}}'::jsonb, '## bizdata_metric_card_upsert

**唯一**写入看板卡片的 Tool。

- 有 cardId 则更新，否则创建
- 须 metricId 或 metricCode（绑定已有指标定义）
- code=卡片 code（建议 `{metricCode}:{viz}`）；与指标 code 不同
- domainCode=看板分层（如 fmms）
- vizType：statistic_trend | line | bar | ring
- 成功=响应含卡片 `id`；再 `get_dashboard`/`card_list` 验收
- **禁止**未调用本 Tool 或未验收就声称卡片已创建
- **禁止**用 `bizdata_metric_upsert` 冒充创建卡片', '{}'::jsonb,
  true, '2026-07-18T00:45:37.814Z', '2026-07-18T21:53:31.010Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666663',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '删除指标', 'bizdata-metric-delete', 'bizdata_metric_delete',
  '删除业务指标', 'client',
  '{"type":"object","properties":{"code":{"type":"string"},"metricId":{"type":"string"}}}'::jsonb, '## bizdata_metric_delete', '{}'::jsonb,
  true, '2026-06-30T19:12:58.837Z', '2026-07-18T21:53:31.010Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666664',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '执行指标', 'bizdata-metric-execute', 'bizdata_metric_execute',
  '手动执行单个指标计算', 'client',
  '{"type":"object","properties":{"code":{"type":"string"},"metricId":{"type":"string"}}}'::jsonb, '## bizdata_metric_execute

- 成功返回 success=true 与 value
- 公式指标依赖项须已有 lastValue
- **禁止**未调用本 Tool 就声称执行成功', '{}'::jsonb,
  true, '2026-06-30T19:12:58.837Z', '2026-07-18T21:53:31.010Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666665',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '批量执行指标', 'bizdata-metric-execute-batch', 'bizdata_metric_execute_batch',
  '按 code 前缀批量执行（先 SQL 后 formula）', 'client',
  '{"type":"object","properties":{"codePrefix":{"type":"string"}}}'::jsonb, '## bizdata_metric_execute_batch

传 codePrefix 如 sales；系统按依赖顺序执行。', '{}'::jsonb,
  true, '2026-06-30T19:12:58.837Z', '2026-07-18T21:53:31.010Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666672',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '过滤业务指标', 'bizdata-metric-filter', 'bizdata_metric_filter',
  '按页面过滤项检索指标：code 前缀 + 状态，返回全部命中项（size=-1）。与 list 的区别：面向检索而非分页浏览。', 'client',
  '{"type":"object","properties":{"status":{"enum":["enabled","disabled"],"type":"string"},"codePrefix":{"type":"string","description":"code 前缀，如 sales"}}}'::jsonb, '## bizdata_metric_filter

参数全可选；不传则返回全部。返回 { items, total }。code 形如 sales:order:total_count。', '{}'::jsonb,
  true, '2026-07-10T15:16:57.050Z', '2026-07-18T21:53:31.010Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666661',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '获取指标详情', 'bizdata-metric-get', 'bizdata_metric_get',
  '按 metricId 或 code 获取指标详情', 'client',
  '{"type":"object","properties":{"code":{"type":"string"},"metricId":{"type":"string"}}}'::jsonb, '## bizdata_metric_get

优先从 Surface 读取 metricId；含 queryScript、formulaConfig、调度信息。', '{}'::jsonb,
  true, '2026-06-30T19:12:58.837Z', '2026-07-18T21:53:31.010Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666669',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '指标看板', 'bizdata-metric-get-dashboard', 'bizdata_metric_get_dashboard',
  '读取看板 domains[].cards。空 cards=尚未建卡片（有指标也不显示）。创建卡片后必须用本 Tool 验收', 'client',
  '{"type":"object","properties":{"refresh":{"type":"boolean"},"codePrefix":{"type":"string"},"domainCode":{"type":"string"}}}'::jsonb, '## bizdata_metric_get_dashboard

返回 `domains[].cards`（含水合 value/trend/series）。

- **空 cards ≠ 失败列出指标**；表示还没有 metric_cards
- 声称「卡片已创建」前必须本 Tool 或 `card_list` 看到非空 cards
- refresh=true 对 on_demand 即时重算', '{}'::jsonb,
  true, '2026-06-30T19:12:58.837Z', '2026-07-18T21:53:31.010Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666668',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '指标最新值', 'bizdata-metric-get-value', 'bizdata_metric_get_value',
  '获取指标最新值，可选 refresh 先执行', 'client',
  '{"type":"object","properties":{"code":{"type":"string"},"refresh":{"type":"boolean"},"metricId":{"type":"string"}}}'::jsonb, '## bizdata_metric_get_value

refresh=true 时先执行再返回值。', '{}'::jsonb,
  true, '2026-06-30T19:12:58.837Z', '2026-07-18T21:53:31.010Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666660',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '列出业务指标', 'bizdata-metric-list', 'bizdata_metric_list',
  '列出【指标定义】metrics（怎么算）。不是看板卡片；卡片用 bizdata_metric_card_list / get_dashboard', 'client',
  '{"type":"object","properties":{"page":{"type":"integer"},"size":{"type":"integer"},"status":{"enum":["enabled","disabled"],"type":"string"},"codePrefix":{"type":"string"}}}'::jsonb, '## bizdata_metric_list

返回【指标定义】items/total。

**不是**看板卡片列表。列出指标 ≠ 看板有内容。创建看板展示须 `bizdata_metric_card_upsert`。', '{}'::jsonb,
  true, '2026-06-30T19:12:58.837Z', '2026-07-18T21:53:31.010Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666666',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '指标执行记录', 'bizdata-metric-list-runs', 'bizdata_metric_list_runs',
  '分页获取指标 run 记录', 'client',
  '{"type":"object","properties":{"code":{"type":"string"},"page":{"type":"integer"},"size":{"type":"integer"},"metricId":{"type":"string"}}}'::jsonb, '## bizdata_metric_list_runs', '{}'::jsonb,
  true, '2026-06-30T19:12:58.837Z', '2026-07-18T21:53:31.010Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666667',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '指标历史值', 'bizdata-metric-list-values', 'bizdata_metric_list_values',
  '分页获取指标历史计算值', 'client',
  '{"type":"object","properties":{"to":{"type":"string"},"code":{"type":"string"},"from":{"type":"string"},"page":{"type":"integer"},"size":{"type":"integer"},"metricId":{"type":"string"},"dimensionKey":{"type":"string"}}}'::jsonb, '## bizdata_metric_list_values', '{}'::jsonb,
  true, '2026-06-30T19:12:58.837Z', '2026-07-18T21:53:31.010Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666671',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '指标页面跳转', 'bizdata-metric-navigate', 'bizdata_metric_navigate',
  '在 list / dashboard / create / edit 间跳转', 'client',
  '{"type":"object","required":["target"],"properties":{"target":{"enum":["list","dashboard","create","edit"],"type":"string"},"metricId":{"type":"string"}}}'::jsonb, '## bizdata_metric_navigate

路径前缀 `/business_data/metrics`：
- list → 指标管理
- dashboard → 指标看板
- create / edit', '{}'::jsonb,
  true, '2026-06-30T19:12:58.837Z', '2026-07-18T21:53:31.010Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666670',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '写入指标定义草稿', 'bizdata-metric-suggest-definition', 'bizdata_metric_suggest_definition',
  '将 SQL / 公式同步到编辑页表单', 'client',
  '{"type":"object","properties":{"unit":{"type":"string"},"metricId":{"type":"string"},"description":{"type":"string"},"queryScript":{"type":"string"},"formulaConfig":{"type":"object"}}}'::jsonb, '## bizdata_metric_suggest_definition

通过 mutation 同步 queryScript / formulaConfig 到 edit/create Surface；用户仍须保存表单或调用 upsert。', '{}'::jsonb,
  true, '2026-06-30T19:12:58.837Z', '2026-07-18T21:53:31.010Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666662',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '创建或更新指标', 'bizdata-metric-upsert', 'bizdata_metric_upsert',
  '创建或更新【指标定义】SQL/公式。不会出现在看板。看板卡片请用 bizdata_metric_card_upsert', 'client',
  '{"type":"object","properties":{"code":{"type":"string"},"unit":{"type":"string"},"label":{"type":"string"},"status":{"enum":["enabled","disabled"],"type":"string"},"metricId":{"type":"string"},"metricType":{"enum":["sql","formula"],"type":"string"},"computeMode":{"enum":["scheduled","on_demand","both"],"type":"string"},"description":{"type":"string"},"queryScript":{"type":"string"},"connectionId":{"type":"string"},"scheduleType":{"enum":["manual","hourly","daily","cron"],"type":"string"},"formulaConfig":{"type":"object"},"scheduleConfig":{"type":"object"}}}'::jsonb, '## bizdata_metric_upsert

**只写指标定义（metrics）**，看板不会自动出现。

- 有 metricId 则更新，否则创建
- SQL 型须 connectionId + queryScript；公式型须 formulaConfig
- **成功判定**：信封 `verified===true`（写后 get+list 回读）；否则禁止声称创建成功
- **禁止**用本 Tool 代替「创建看板卡片」', '{}'::jsonb,
  true, '2026-06-30T19:12:58.837Z', '2026-07-18T21:53:31.010Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666609',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '物化预览', 'bizdata-preview-materialization', 'bizdata_preview_materialization',
  '预览 SQL 与 TypeScript 代码', 'server_builtin',
  '{"type":"object","properties":{"entityIds":{"type":"array","items":{"type":"string"}},"targetSchema":{"type":"string"}}}'::jsonb, '## bizdata_preview_materialization', '{"handler":"bizdata_preview_materialization"}'::jsonb,
  true, '2026-06-22T11:33:21.115Z', '2026-06-22T11:35:04.813Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666643',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '查询关系图谱', 'bizdata-query-relation-graph', 'bizdata_query_relation_graph',
  '查询实体关系图谱（节点+边）；可传 scope（一级 Scope）或 codePrefix；含 orphan 实体', 'client',
  '{"type":"object","properties":{"scope":{"type":"string","description":"一级 Scope（code 第一段），如 IPS、fmms；不传则全库"},"codePrefix":{"type":"string","description":"更细 code 前缀，如 IPS:bom；可与 scope 同时用"}}}'::jsonb, '## bizdata_query_relation_graph

总览某 Scope 下实体关系（与「关系图谱」页过滤一致）。

### 参数
- **scope**：一级 Scope（code 第一段），如 `IPS`、`fmms`
- **codePrefix**：可选更细前缀，如 `IPS:bom`（与 scope 同时传时取交集）

### 返回
- `nodes` / `edges`（含 cardinality、directionSummary）
- `orphanNodes`：无关系边的实体（建模缺口）
- `availableScopes`：当前库已有一级 Scope

### 何时用
- 添加关系前先摸清现有边与缺口
- 用户问「某 Scope 关系是否完整」时优先本 Tool（比全量 list_relations 更适合总览）', '{}'::jsonb,
  true, '2026-07-22T19:25:07.184Z', '2026-07-22T19:25:07.184Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-66666666661e',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '同步元数据骨架', 'bizdata-sync-metadata-from-schema', 'bizdata_sync_metadata_from_schema',
  '从实体/指标/枚举结构同步元数据目录骨架', 'client',
  '{"type":"object","properties":{}}'::jsonb, '## bizdata_sync_metadata_from_schema

为所有 entity/metric/enum 创建缺失的 metadata_tables 与 fields 骨架，不覆盖已有 standardId。', '{}'::jsonb,
  true, '2026-06-27T16:36:07.478Z', '2026-06-27T17:19:42.420Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666615',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '更新数据标准', 'bizdata-update-data-standard', 'bizdata_update_data_standard',
  '更新数据标准', 'client',
  '{"type":"object","required":["id"],"properties":{"id":{"type":"string"},"code":{"type":"string"},"name":{"type":"string"},"status":{"enum":["enabled","disabled"],"type":"string"},"version":{"type":"string"},"description":{"type":"string"}}}'::jsonb, '## bizdata_update_data_standard', '{}'::jsonb,
  true, '2026-06-27T16:36:07.478Z', '2026-06-27T17:19:42.420Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666604',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '更新实体', 'bizdata-update-entity', 'bizdata_update_entity',
  '更新实体信息与字段；有限取值字段须 type=adb-enum + enumCode（先 create_enum）', 'client',
  '{"type":"object","properties":{"code":{"type":"string","description":"新 code，如 fmms:production:WorkCard"},"label":{"type":"string"},"fields":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string","description":"同 fieldKey"},"type":{"type":"string","description":"varchar/int/uuid/decimal 等；有限取值须用 adb-enum（配合 enumCode）"},"label":{"type":"string"},"length":{"type":"integer"},"unique":{"type":"boolean"},"primary":{"type":"boolean"},"enumCode":{"type":"string","description":"枚举 code（如 production:WorkOrderStatus）；type=adb-enum 时必填"},"fieldKey":{"type":"string"},"nullable":{"type":"boolean"},"columnInfo":{"type":"object"},"enumConfig":{"type":"object","properties":{"enumCode":{"type":"string"},"isMultiple":{"type":"boolean"}}},"extendType":{"type":"string","description":"扩展类型；枚举可写 adb-enum（与 type=adb-enum 等价）"},"typeormConfig":{"type":"object"}}},"description":"字段列表；status/state/*_type 等须 type=adb-enum 并指定 enumCode（先 bizdata_create_enum）"},"layout":{"type":"object","description":"实体 layout，含 indexes 等"},"status":{"enum":["enabled","disabled","archived"],"type":"string"},"entityId":{"type":"string"},"tableName":{"type":"string","description":"ER 物理表名；默认推导时随 code 变"},"entityCode":{"type":"string","description":"定位用：当前/旧 code"},"jsonSchema":{"type":"object","description":"JSON Schema 结构"},"replaceFields":{"type":"boolean"}}}'::jsonb, '## bizdata_update_entity

保存后 version 自增，**页面 UI 会自动同步**，无需用户手动刷新。

### 定位实体
- entityId 或 **entityCode**（当前/旧 code，如 `fmms:WorkCard`）二选一

### 修改 Code（重要）
- 传 `code` 为新 code，格式 `Scope1[:Scope2...]:EntityName`（如 `fmms:production:WorkCard`）
- 可选 `tableName`（ER）；不填且原表名为默认推导值时随 code 同步
- 后端**同一事务**级联更新：元数据、绑定 API 服务、采集管道、物化记录、关系 config、字段/脚本引用
- **任一步失败则全部回滚**；须向用户展示 Tool 错误原文，禁止声称成功
- 成功后用**新 code** 调 `bizdata_get_entity` / `bizdata_list_entity_summaries` 验证，并重跑 `bizdata_validate_model`
- **禁止**为改 Scope 而 delete + create

### 字段格式
普通字段：
```json
{ "fieldKey": "company_name", "label": "公司名称", "type": "varchar", "length": 255, "nullable": false }
```

### 枚举字段（status/state/*_type 等，必遵）
**禁止**用 varchar。修复/新增流程：
1. `bizdata_list_enums` → 无则 `bizdata_create_enum`（code + values）
2. `bizdata_update_entity` **同时**传 `type` 与 `enumCode`：
```json
{ "fieldKey": "station_type", "type": "adb-enum", "enumCode": "fmms:StationType", "label": "站点类型" }
```
3. 再 `bizdata_validate_model`

**禁止**：只改 `typeormConfig.type`；只传 `type=adb-enum` 不传 `enumCode`；用 varchar 建 status/*_type。

### 索引与关系
- 索引请用 **bizdata_upsert_entity_indexes**
- 关系请按「关系添加五步法」：`bizdata_add_relation`（code）+ `_verification` + `bizdata_list_relations({ entityCode })`

### 合并策略
- 默认 merge：只传新增/修改字段，保留已有字段
- replaceFields=true：全量替换

### 页面上下文
- 可用 `aibase_read_surfaces` 读取当前选中实体等页面状态', '{}'::jsonb,
  true, '2026-06-22T11:33:21.115Z', '2026-07-22T18:58:20.948Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666642',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '更新枚举', 'bizdata-update-enum', 'bizdata_update_enum',
  '更新已有 ADB 枚举（label/values/items）；items 为空但 values 有值时须用本 Tool 补齐', 'client',
  '{"type":"object","properties":{"id":{"type":"string"},"code":{"type":"string"},"items":{"type":"object"},"label":{"type":"string"},"values":{"type":"object"},"description":{"type":"string"}}}'::jsonb, '## bizdata_update_enum

按 **id** 或 **code** 定位已有枚举。

### 修复「UI 选项数为 0」
list 若 `itemsEmpty=true`（items 空、values 有键）：传 `code` + 完整 `items`（或只重传 `values`，服务端会补 items）。

### 字段
- **items**：UI 选项列表来源 `{ "KEY": { "label": "中文", "sort": 1 } }`
- **values**：键值映射；可与 items 同时更新', '{}'::jsonb,
  true, '2026-07-16T12:45:51.679Z', '2026-07-16T12:45:51.679Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-66666666661d',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '批量更新元数据字段', 'bizdata-update-metadata-fields', 'bizdata_update_metadata_fields',
  '批量更新某逻辑表下字段元数据', 'client',
  '{"type":"object","required":["metadataTableId","fields"],"properties":{"fields":{"type":"array","items":{"type":"object","properties":{"alias":{"type":"string"},"dataType":{"type":"string"},"enumCode":{"type":"string"},"fieldKey":{"type":"string"},"standardId":{"type":"string"},"metadataCode":{"type":"string"},"businessMeaning":{"type":"string"},"sensitivityLevel":{"type":"string"}}}},"metadataTableId":{"type":"string"}}}'::jsonb, '## bizdata_update_metadata_fields', '{}'::jsonb,
  true, '2026-06-27T16:36:07.478Z', '2026-06-27T17:19:42.420Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-66666666661b',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '更新元数据表', 'bizdata-update-metadata-table', 'bizdata_update_metadata_table',
  '更新元数据逻辑表（表级）', 'client',
  '{"type":"object","required":["id"],"properties":{"id":{"type":"string"},"status":{"enum":["enabled","disabled"],"type":"string"},"standardId":{"type":"string"},"metadataCode":{"type":"string"},"businessMeaning":{"type":"string"}}}'::jsonb, '## bizdata_update_metadata_table', '{}'::jsonb,
  true, '2026-06-27T16:36:07.478Z', '2026-06-27T17:19:42.420Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  'a16e2b6d-0045-4090-8e34-0e988b7e95a6',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '更新实体索引', 'bizdata-upsert-entity-indexes', 'bizdata_upsert_entity_indexes',
  '创建或合并实体 layout.indexes', 'client',
  '{"type":"object","required":["indexes"],"properties":{"indexes":{"type":"array","items":{"type":"object","required":["name","fields"],"properties":{"name":{"type":"string"},"type":{"enum":["btree","hash","gin","gist"],"type":"string"},"fields":{"type":"array","items":{"type":"string"}},"unique":{"type":"boolean"}}}},"entityId":{"type":"string"},"entityCode":{"type":"string"},"replaceIndexes":{"type":"boolean"}}}'::jsonb, '## bizdata_upsert_entity_indexes

**每个实体建完字段后必做**。主键/唯一/外键/status 等查询字段均需索引。', '{}'::jsonb,
  true, '2026-06-29T08:39:45.928Z', '2026-06-29T08:39:45.928Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-66666666661c',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '保存元数据字段', 'bizdata-upsert-metadata-field', 'bizdata_upsert_metadata_field',
  '保存单条字段级元数据', 'client',
  '{"type":"object","required":["metadataTableId","fieldKey"],"properties":{"alias":{"type":"string"},"dataType":{"type":"string"},"enumCode":{"type":"string"},"fieldKey":{"type":"string"},"standardId":{"type":"string"},"metadataCode":{"type":"string"},"businessMeaning":{"type":"string"},"metadataTableId":{"type":"string"},"sensitivityLevel":{"type":"string"}}}'::jsonb, '## bizdata_upsert_metadata_field

先 `bizdata_get_metadata_by_target` 或 `bizdata_list_metadata_tables` 取得 metadataTableId。', '{}'::jsonb,
  true, '2026-06-27T16:36:07.478Z', '2026-06-27T17:19:42.420Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-66666666661a',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '保存元数据表', 'bizdata-upsert-metadata-table', 'bizdata_upsert_metadata_table',
  '按 target 创建或更新逻辑元数据表', 'client',
  '{"type":"object","required":["targetType","targetId","code"],"properties":{"code":{"type":"string"},"status":{"enum":["enabled","disabled"],"type":"string"},"targetId":{"type":"string"},"standardId":{"type":"string","description":"数据标准 UUID"},"targetType":{"enum":["entity","metric","enum"],"type":"string"},"metadataCode":{"type":"string"},"businessMeaning":{"type":"string"}}}'::jsonb, '## bizdata_upsert_metadata_table

standardId 关联 bizdata.data_standards.id，勿填纯文本编码。', '{}'::jsonb,
  true, '2026-06-27T16:36:07.478Z', '2026-06-27T17:19:42.420Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666645',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '写入 Scope 业务说明', 'bizdata-upsert-scope-description', 'bizdata_upsert_scope_description',
  '写入/更新 Scope 业务说明；合并已有内容，禁止无故清空；空字符串删除', 'client',
  '{"type":"object","required":["scopeCode","contentMarkdown"],"properties":{"scopeCode":{"type":"string","description":"Scope code，如 IPS 或 IPS:bom"},"contentMarkdown":{"type":"string","description":"完整 Markdown；空字符串删除"}}}'::jsonb, '## bizdata_upsert_scope_description

沉淀该 Scope 的**稳定领域知识**，供后续建模复用。

### 应写入（重要信息）
- 业务目标、边界与术语表
- 关键业务规则/约束（状态机、编号规则、权限边界等）
- 实体职责划分与建模约定（哪些该建表、哪些不该）
- 与上下游 Scope / 外部系统的关系说明

### 不应写入
- 具体字段类型/长度、索引明细（仍落实体模型）
- 临时调试笔记

### 写法
- 先 `bizdata_get_scope_description`，在已有正文上**合并**更新，禁止无故整篇覆盖清空
- 传空 `contentMarkdown` 会删除该 Scope 说明
- 以 `_verification.verified=true` 为准', '{}'::jsonb,
  true, '2026-07-24T04:54:01.037Z', '2026-07-24T04:54:01.037Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666608',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '校验模型', 'bizdata-validate-model', 'bizdata_validate_model',
  '校验实体模型完整性；status/*_type 须为 adb-enum+enumCode；失败时按 errors 先 create_enum 再 update', 'client',
  '{"type":"object","properties":{"entityId":{"type":"string"},"entityCode":{"type":"string","description":"如 production:WorkOrder"},"markValidated":{"type":"boolean","description":"为 true 时根据校验结果更新是否验证通过，默认 true"}}}'::jsonb, '## bizdata_validate_model

**每个实体创建/修改后必须调用**（传 entityCode）。

- 默认 markValidated=true：isValid 为 true 时自动标记「验证通过」
- 若报「疑似状态/类型字段」或「缺少 enumCode」：先 `bizdata_list_enums` / `bizdata_create_enum`，再 `bizdata_update_entity` **同时**传 `type=adb-enum` + `enumCode`，然后重跑本 Tool
- 批量创建后须对每个实体各调用一次', '{}'::jsonb,
  true, '2026-06-22T11:33:21.115Z', '2026-07-17T01:04:29.089Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666655',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '删除采集管道', 'collection-pipeline-delete', 'collection_pipeline_delete',
  '软删除采集管道', 'client',
  '{"type":"object","properties":{"code":{"type":"string"},"pipelineId":{"type":"string"}}}'::jsonb, '## collection_pipeline_delete', '{}'::jsonb,
  true, '2026-06-29T10:59:13.541Z', '2026-07-19T11:53:02.362Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666654',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '禁用采集管道', 'collection-pipeline-disable', 'collection_pipeline_disable',
  '禁用已发布的采集管道', 'client',
  '{"type":"object","properties":{"code":{"type":"string"},"pipelineId":{"type":"string"}}}'::jsonb, '## collection_pipeline_disable', '{}'::jsonb,
  true, '2026-06-29T10:59:13.541Z', '2026-07-19T11:53:02.362Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-66666666665a',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '过滤采集管道', 'collection-pipeline-filter', 'collection_pipeline_filter',
  '按页面过滤项检索采集管道：code 前缀 + 状态 + 协议类型，返回全部命中项（size=-1）。', 'client',
  '{"type":"object","properties":{"status":{"enum":["draft","published","disabled"],"type":"string"},"codePrefix":{"type":"string","description":"code 前缀"},"protocolType":{"enum":["serial","modbus_rtu","modbus_tcp"],"type":"string"}}}'::jsonb, '## collection_pipeline_filter

参数全可选；不传则返回全部。返回 { items, total }。', '{}'::jsonb,
  true, '2026-07-10T15:16:57.583Z', '2026-07-19T11:53:02.362Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666651',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '获取采集管道详情', 'collection-pipeline-get', 'collection_pipeline_get',
  '按 ID 或 code 获取采集管道详情', 'client',
  '{"type":"object","properties":{"code":{"type":"string"},"pipelineId":{"type":"string"}}}'::jsonb, '## collection_pipeline_get

pipelineId 或 code 二选一；优先从 Surface 读取 pipelineId。', '{}'::jsonb,
  true, '2026-06-29T10:59:13.541Z', '2026-07-19T11:53:02.362Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666656',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '获取采集测试配置', 'collection-pipeline-get-test-profile', 'collection_pipeline_get_test_profile',
  '获取样本、脚本、ingest URL 等测试上下文', 'client',
  '{"type":"object","properties":{"code":{"type":"string"},"pipelineId":{"type":"string"}}}'::jsonb, '## collection_pipeline_get_test_profile

测试页优先从 Surface 读取 pipelineId。', '{}'::jsonb,
  true, '2026-06-29T10:59:13.541Z', '2026-07-19T11:53:02.362Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666650',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '列出采集管道', 'collection-pipeline-list', 'collection_pipeline_list',
  '列出采集管道，可按 code 前缀、状态、协议类型过滤', 'client',
  '{"type":"object","properties":{"page":{"type":"integer"},"size":{"type":"integer"},"status":{"enum":["draft","published","disabled"],"type":"string"},"codePrefix":{"type":"string"},"protocolType":{"enum":["serial","modbus_rtu","modbus_tcp"],"type":"string"}}}'::jsonb, '## collection_pipeline_list

返回 items 与 total。', '{}'::jsonb,
  true, '2026-06-29T10:59:13.541Z', '2026-07-19T11:53:02.362Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666659',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '采集管道页面跳转', 'collection-pipeline-navigate', 'collection_pipeline_navigate',
  '跳转 list / create / edit / test', 'client',
  '{"type":"object","required":["target"],"properties":{"target":{"enum":["list","create","edit","test"],"type":"string"},"pipelineId":{"type":"string"}}}'::jsonb, '## collection_pipeline_navigate

前缀 `/api_services/collection-pipelines`：
- list / create / edit / test
- 创建成功后应 navigate list，并说明左侧选域', '{}'::jsonb,
  true, '2026-06-29T10:59:13.541Z', '2026-07-19T11:53:02.362Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666653',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '发布采集管道', 'collection-pipeline-publish', 'collection_pipeline_publish',
  '发布 draft 采集管道，对外暴露 ingest API', 'client',
  '{"type":"object","properties":{"code":{"type":"string"},"pipelineId":{"type":"string"}}}'::jsonb, '## collection_pipeline_publish

发布前须有 parseScript、storeScript 与 entityId。', '{}'::jsonb,
  true, '2026-06-29T10:59:13.541Z', '2026-07-19T11:53:02.362Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666657',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '执行采集管道测试', 'collection-pipeline-run-test', 'collection_pipeline_run_test',
  '执行测试（读库内已持久化脚本）。须先 upsert；仅 suggest 不会生效', 'client',
  '{"type":"object","properties":{"code":{"type":"string"},"runType":{"enum":["test","ai_test"],"type":"string"},"rawInput":{"type":"string"},"pipelineId":{"type":"string"}}}'::jsonb, '## collection_pipeline_run_test

- 执行的是**数据库中**的 parseScript/storeScript
- 若刚 suggest_scripts 未 upsert，测到的是旧脚本
- rawInput 省略时用 sampleData；rolledBack 表示存储已回滚
- 失败返回 success=false 与 error（如 ReferenceError: xxx is not defined = 脚本用了未声明变量）', '{}'::jsonb,
  true, '2026-06-29T10:59:13.541Z', '2026-07-19T11:53:02.362Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666658',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '写入脚本草稿', 'collection-pipeline-suggest-scripts', 'collection_pipeline_suggest_scripts',
  '仅同步草稿到编辑页（不写库）。测试前必须 upsert 持久化', 'client',
  '{"type":"object","required":["parseScript","storeScript"],"properties":{"pipelineId":{"type":"string"},"parseScript":{"type":"string"},"storeScript":{"type":"string"},"targetStructure":{"type":"string"}}}'::jsonb, '## collection_pipeline_suggest_scripts

**不持久化**。只 mutation 到 create/edit 表单。

返回 persisted=false。下一步必须 `collection_pipeline_upsert` 带上同一 parseScript/storeScript，再 `run_test`。

### 脚本契约
- parse(raw, ctx) → 对象
- store(data, ctx) 用 ctx.queryPg、ctx.tableQualified
- 禁止 store(ctx, data)；禁止 ctx.bizdata；禁止未声明变量', '{}'::jsonb,
  true, '2026-06-29T10:59:13.541Z', '2026-07-19T11:53:02.362Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666652',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '创建或更新采集管道', 'collection-pipeline-upsert', 'collection_pipeline_upsert',
  '创建或更新采集管道并持久化（含脚本）。suggest_scripts 仅草稿不能代替；成功须 verified=true', 'client',
  '{"type":"object","properties":{"name":{"type":"string"},"entityId":{"type":"string"},"scopeCode":{"type":"string"},"pipelineId":{"type":"string"},"sampleData":{"type":"string"},"parseScript":{"type":"string"},"storeScript":{"type":"string"},"pipelineSlug":{"type":"string"},"protocolType":{"enum":["serial","modbus_rtu","modbus_tcp"],"type":"string"},"applicationIds":{"type":"array","items":{"type":"string"}},"restrictSources":{"type":"boolean"},"targetStructure":{"type":"string"}}}'::jsonb, '## collection_pipeline_upsert

**唯一**持久化管道配置/脚本的 Tool。

### 参数
- 有 pipelineId → 更新；否则创建（须 scopeCode + pipelineSlug → code）
- parseScript / storeScript：写入数据库，供 run_test / ingest 使用

### 脚本契约（纯 JS；禁止未声明标识符）
```javascript
function parse(raw, ctx) {
  // 仅可用 raw、ctx（protocolType/pipeline/entity）
  // 禁止全局 channel/val/idx
  return { field1: 1 };
}
async function store(data, ctx) {
  const { queryPg, tableQualified } = ctx;
  const rows = await queryPg(
    `INSERT INTO ${tableQualified} (id, col1) VALUES (gen_random_uuid(), $1) RETURNING id`,
    [data.field1],
  );
  return { insertedId: rows[0]?.id };
}
```
- 禁止 store(ctx, data)；禁止 ctx.bizdata

### 成功判定
- verified===true 且 listedOk；列表 `/api_services/collection-pipelines`，左侧选域如 fmms
- 禁止未 verified 声称创建完成', '{}'::jsonb,
  true, '2026-06-29T10:59:13.541Z', '2026-07-19T11:53:02.362Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-6666666666b8',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '检查钩子脚本', 'hook-check-script', 'hook_check_script',
  '对钩子 TypeScript 脚本做语法/类型检查。保存 script 类型前必须通过', 'client',
  '{"type":"object","required":["source"],"properties":{"source":{"type":"string"}}}'::jsonb, '## hook_check_script', '{}'::jsonb,
  true, '2026-08-31T12:00:00.000Z', '2026-08-31T12:00:00.000Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-6666666666b3',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '创建钩子', 'hook-create-hook', 'hook_create_hook',
  '创建钩子（草稿）。script 动作须先 hook_check_script；创建后建议 hook_test_hook', 'client',
  '{"type":"object","required":["name","eventType","actionType","actionConfig"],"properties":{"name":{"type":"string"},"eventType":{"type":"string"},"actionType":{"type":"string"},"description":{"type":"string"},"eventFilter":{"type":"object"},"actionConfig":{"type":"object"},"conditionExpr":{"type":"string"},"failurePolicy":{"type":"object"}}}'::jsonb, '## hook_create_hook', '{}'::jsonb,
  true, '2026-08-31T12:00:00.000Z', '2026-08-31T12:00:00.000Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-6666666666b5',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '删除钩子', 'hook-delete-hook', 'hook_delete_hook',
  '软删钩子（运行历史保留）', 'client',
  '{"type":"object","required":["hookId"],"properties":{"hookId":{"type":"string"}}}'::jsonb, '## hook_delete_hook', '{}'::jsonb,
  true, '2026-08-31T12:00:00.000Z', '2026-08-31T12:00:00.000Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-6666666666b7',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '禁用钩子', 'hook-disable-hook', 'hook_disable_hook',
  '禁用钩子', 'client',
  '{"type":"object","required":["hookId"],"properties":{"hookId":{"type":"string"}}}'::jsonb, '## hook_disable_hook', '{}'::jsonb,
  true, '2026-08-31T12:00:00.000Z', '2026-08-31T12:00:00.000Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-6666666666b6',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '启用钩子', 'hook-enable-hook', 'hook_enable_hook',
  '启用钩子（清零连续失败计数）', 'client',
  '{"type":"object","required":["hookId"],"properties":{"hookId":{"type":"string"}}}'::jsonb, '## hook_enable_hook', '{}'::jsonb,
  true, '2026-08-31T12:00:00.000Z', '2026-08-31T12:00:00.000Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-6666666666b2',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '获取钩子详情', 'hook-get-hook', 'hook_get_hook',
  '获取钩子完整配置（触发条件、动作、失败策略；密钥已脱敏）', 'client',
  '{"type":"object","required":["hookId"],"properties":{"hookId":{"type":"string"}}}'::jsonb, '## hook_get_hook', '{}'::jsonb,
  true, '2026-08-31T12:00:00.000Z', '2026-08-31T12:00:00.000Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-6666666666b0',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '列出钩子事件目录', 'hook-list-event-types', 'hook_list_event_types',
  '列出钩子可用的事件类型目录（含负载 JSON Schema 与示例）。创建钩子前必须先调用', 'client',
  '{"type":"object","required":[],"properties":{}}'::jsonb, '## hook_list_event_types', '{}'::jsonb,
  true, '2026-08-31T12:00:00.000Z', '2026-08-31T12:00:00.000Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-6666666666b1',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '列出钩子', 'hook-list-hooks', 'hook_list_hooks',
  '列出钩子（可按状态过滤），含最近运行与近7天成功率', 'client',
  '{"type":"object","required":[],"properties":{"status":{"type":"string","description":"draft|enabled|disabled|auto_disabled，不传查全部"}}}'::jsonb, '## hook_list_hooks', '{}'::jsonb,
  true, '2026-08-31T12:00:00.000Z', '2026-08-31T12:00:00.000Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-6666666666ba',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '列出钩子运行历史', 'hook-list-runs', 'hook_list_runs',
  '查询钩子运行历史（可按状态过滤）', 'client',
  '{"type":"object","required":["hookId"],"properties":{"hookId":{"type":"string"},"status":{"type":"string"}}}'::jsonb, '## hook_list_runs', '{}'::jsonb,
  true, '2026-08-31T12:00:00.000Z', '2026-08-31T12:00:00.000Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-6666666666bd',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '跳转钩子页', 'hook-navigate', 'hook_navigate',
  '跳转到钩子管理相关页面（列表/新建/编辑/运行历史）', 'client',
  '{"type":"object","required":["target"],"properties":{"hookId":{"type":"string"},"target":{"type":"string","description":"list|create|edit|runs"}}}'::jsonb, '## hook_navigate', '{}'::jsonb,
  true, '2026-08-31T12:00:00.000Z', '2026-08-31T12:00:00.000Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-6666666666bb',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '重放钩子运行', 'hook-retry-run', 'hook_retry_run',
  '用历史运行的原始负载重放（新 event_id，trigger_source=replay）', 'client',
  '{"type":"object","required":["runId"],"properties":{"runId":{"type":"string"}}}'::jsonb, '## hook_retry_run', '{}'::jsonb,
  true, '2026-08-31T12:00:00.000Z', '2026-08-31T12:00:00.000Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-6666666666bc',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '建议钩子配置草稿', 'hook-suggest-config', 'hook_suggest_config',
  '将钩子配置草稿同步到当前打开的钩子表单（不保存）', 'client',
  '{"type":"object","required":["name","eventType","actionType","actionConfig"],"properties":{"name":{"type":"string"},"eventType":{"type":"string"},"actionType":{"type":"string"},"description":{"type":"string"},"eventFilter":{"type":"object"},"actionConfig":{"type":"object"},"conditionExpr":{"type":"string"},"failurePolicy":{"type":"object"}}}'::jsonb, '## hook_suggest_config', '{}'::jsonb,
  true, '2026-08-31T12:00:00.000Z', '2026-08-31T12:00:00.000Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-6666666666b9',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '试跑钩子', 'hook-test-hook', 'hook_test_hook',
  '用 mock 负载试跑钩子（不计入正式成功率）', 'client',
  '{"type":"object","required":["hookId"],"properties":{"hookId":{"type":"string"},"mockPayload":{"type":"object"}}}'::jsonb, '## hook_test_hook', '{}'::jsonb,
  true, '2026-08-31T12:00:00.000Z', '2026-08-31T12:00:00.000Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-6666666666b4',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '更新钩子', 'hook-update-hook', 'hook_update_hook',
  '更新钩子配置（version+1；密钥留空保留）', 'client',
  '{"type":"object","required":["hookId","name","eventType","actionType","actionConfig"],"properties":{"name":{"type":"string"},"hookId":{"type":"string"},"eventType":{"type":"string"},"actionType":{"type":"string"},"description":{"type":"string"},"eventFilter":{"type":"object"},"actionConfig":{"type":"object"},"conditionExpr":{"type":"string"},"failurePolicy":{"type":"object"}}}'::jsonb, '## hook_update_hook', '{}'::jsonb,
  true, '2026-08-31T12:00:00.000Z', '2026-08-31T12:00:00.000Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666683',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '创建提交外部API', 'outbound-webhook-create', 'outbound_webhook_create',
  '创建提交外部API配置（新建，不传 webhookId）', 'client',
  '{"type":"object","required":["name","targetUrl"],"properties":{"code":{"type":"string"},"name":{"type":"string"},"mockData":{"type":"string"},"targetUrl":{"type":"string"},"description":{"type":"string"},"transformScript":{"type":"string"},"requestStructure":{"type":"string"},"triggerApiServiceId":{"type":"string"},"triggerApiServiceCode":{"type":"string"}}}'::jsonb, '## outbound_webhook_create

- 须传 name、targetUrl
- code 格式 `域:slug`（如 equipment:notify）
- 创建后状态为 draft，须 outbound_webhook_publish 发布', '{}'::jsonb,
  true, '2026-07-10T15:17:40.526Z', '2026-07-10T15:17:40.526Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666686',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '删除提交外部API', 'outbound-webhook-delete', 'outbound_webhook_delete',
  '删除提交外部API配置', 'client',
  '{"type":"object","required":["webhookId"],"properties":{"webhookId":{"type":"string"}}}'::jsonb, '## outbound_webhook_delete', '{}'::jsonb,
  true, '2026-07-10T15:17:40.526Z', '2026-07-10T15:17:40.526Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666688',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '禁用提交外部API', 'outbound-webhook-disable', 'outbound_webhook_disable',
  '禁用提交外部API（published → disabled）', 'client',
  '{"type":"object","required":["webhookId"],"properties":{"webhookId":{"type":"string"}}}'::jsonb, '## outbound_webhook_disable', '{}'::jsonb,
  true, '2026-07-10T15:17:40.526Z', '2026-07-10T15:17:40.526Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666681',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '过滤提交外部API', 'outbound-webhook-filter', 'outbound_webhook_filter',
  '按页面过滤项检索提交外部API：code 前缀 + 状态，返回全部命中项（size=-1）。与 list 区别：面向检索而非分页浏览。', 'client',
  '{"type":"object","properties":{"status":{"enum":["draft","published","disabled"],"type":"string"},"codePrefix":{"type":"string","description":"code 前缀"}}}'::jsonb, '## outbound_webhook_filter

参数全可选；不传则返回全部。返回 { items, total }。', '{}'::jsonb,
  true, '2026-07-10T15:17:40.526Z', '2026-07-10T15:17:40.526Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666682',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '获取提交外部API详情', 'outbound-webhook-get', 'outbound_webhook_get',
  '按 webhookId 获取提交外部API详情', 'client',
  '{"type":"object","required":["webhookId"],"properties":{"webhookId":{"type":"string"}}}'::jsonb, '## outbound_webhook_get

含 requestStructure、transformScript、mockData 等。', '{}'::jsonb,
  true, '2026-07-10T15:17:40.526Z', '2026-07-10T15:17:40.526Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666689',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '获取提交外部API测试配置', 'outbound-webhook-get-test-profile', 'outbound_webhook_get_test_profile',
  '获取测试配置（含 mockData、请求结构、触发 API 信息）', 'client',
  '{"type":"object","required":["webhookId"],"properties":{"webhookId":{"type":"string"}}}'::jsonb, '## outbound_webhook_get_test_profile', '{}'::jsonb,
  true, '2026-07-10T15:17:40.526Z', '2026-07-10T15:17:40.526Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666680',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '列出提交外部API', 'outbound-webhook-list', 'outbound_webhook_list',
  '列出提交外部API配置，可按 code 前缀与状态过滤', 'client',
  '{"type":"object","properties":{"page":{"type":"integer"},"size":{"type":"integer"},"status":{"enum":["draft","published","disabled","ALL"],"type":"string"},"codePrefix":{"type":"string"}}}'::jsonb, '## outbound_webhook_list

返回 { items, total }。size=-1 拉取全部。', '{}'::jsonb,
  true, '2026-07-10T15:17:40.526Z', '2026-07-10T15:17:40.526Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-66666666668d',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '提交外部API页面跳转', 'outbound-webhook-navigate', 'outbound_webhook_navigate',
  '导航到提交外部API页面（列表/编辑/测试/创建）', 'client',
  '{"type":"object","properties":{"target":{"enum":["list","edit","test","create"],"type":"string"},"webhookId":{"type":"string"}}}'::jsonb, '## outbound_webhook_navigate

页面路径前缀 `/api_services/outbound-webhooks`：
- list → 列表
- create → 新建
- edit → /{id}/edit
- test → /{id}/test', '{}'::jsonb,
  true, '2026-07-10T15:17:40.526Z', '2026-07-10T15:17:40.526Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666687',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '发布提交外部API', 'outbound-webhook-publish', 'outbound_webhook_publish',
  '发布提交外部API（draft → published）', 'client',
  '{"type":"object","required":["webhookId"],"properties":{"webhookId":{"type":"string"}}}'::jsonb, '## outbound_webhook_publish

发布前置：须已配置 targetUrl、triggerApiServiceId、transformScript', '{}'::jsonb,
  true, '2026-07-10T15:17:40.526Z', '2026-07-10T15:17:40.526Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-66666666668a',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '运行提交外部API测试', 'outbound-webhook-run-test', 'outbound_webhook_run_test',
  '用 Mock Data 运行处置脚本并真实 POST 外部 API', 'client',
  '{"type":"object","required":["webhookId"],"properties":{"mockData":{"type":"string"},"webhookId":{"type":"string"}}}'::jsonb, '## outbound_webhook_run_test

- 用 mockData（可选覆盖）运行 transform 脚本并真实 POST targetUrl
- 返回 responseStatus、responseBody、transformedBody、status', '{}'::jsonb,
  true, '2026-07-10T15:17:40.526Z', '2026-07-10T15:17:40.526Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-66666666668b',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '设置提交外部API Mock Data', 'outbound-webhook-set-mock-data', 'outbound_webhook_set_mock_data',
  '将 Mock Data 写入当前编辑/测试页（通过 mutation 同步，不持久化）', 'client',
  '{"type":"object","required":["mockData"],"properties":{"mockData":{"type":"string"},"webhookId":{"type":"string"}}}'::jsonb, '## outbound_webhook_set_mock_data

通过 mutation 同步到编辑器；用户仍须保存表单或调用 create/update 持久化。', '{}'::jsonb,
  true, '2026-07-10T15:17:40.526Z', '2026-07-10T15:17:40.526Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-66666666668c',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '建议提交外部API脚本', 'outbound-webhook-suggest-scripts', 'outbound_webhook_suggest_scripts',
  '将请求结构、处置脚本和 Mock Data 草稿写入当前编辑页（通过 mutation 同步，不持久化）', 'client',
  '{"type":"object","required":["transformScript"],"properties":{"mockData":{"type":"string"},"webhookId":{"type":"string"},"transformScript":{"type":"string"},"requestStructure":{"type":"string"}}}'::jsonb, '## outbound_webhook_suggest_scripts

通过 mutation 同步到编辑器；用户仍须保存表单或调用 create/update 持久化。', '{}'::jsonb,
  true, '2026-07-10T15:17:40.526Z', '2026-07-10T15:17:40.526Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666684',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '更新提交外部API', 'outbound-webhook-update', 'outbound_webhook_update',
  '更新已有提交外部API配置（必传 webhookId）', 'client',
  '{"type":"object","required":["webhookId"],"properties":{"code":{"type":"string"},"name":{"type":"string"},"mockData":{"type":"string"},"targetUrl":{"type":"string"},"webhookId":{"type":"string"},"description":{"type":"string"},"transformScript":{"type":"string"},"requestStructure":{"type":"string"},"triggerApiServiceId":{"type":"string"},"triggerApiServiceCode":{"type":"string"}}}'::jsonb, '## outbound_webhook_update

- 必传 webhookId
- 仅传需改动的字段即可', '{}'::jsonb,
  true, '2026-07-10T15:17:40.526Z', '2026-07-10T15:17:40.526Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '66666666-6666-4666-8666-666666666685',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '创建或更新提交外部API', 'outbound-webhook-upsert', 'outbound_webhook_upsert',
  '创建或更新提交外部API配置（有 webhookId 更新，无则创建；向后兼容）', 'client',
  '{"type":"object","required":["name","targetUrl"],"properties":{"code":{"type":"string"},"name":{"type":"string"},"mockData":{"type":"string"},"targetUrl":{"type":"string"},"webhookId":{"type":"string","description":"更新时传入；创建时省略"},"description":{"type":"string"},"transformScript":{"type":"string"},"requestStructure":{"type":"string"},"triggerApiServiceId":{"type":"string"},"triggerApiServiceCode":{"type":"string"}}}'::jsonb, '## outbound_webhook_upsert

- 有 webhookId 则更新，否则创建（与 create/update 等价，保留向后兼容）', '{}'::jsonb,
  true, '2026-07-10T15:17:40.526Z', '2026-07-10T15:17:40.526Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-777777777716',
  (SELECT id FROM aibase.scopes WHERE slug = 'member-org'),
  '分配用户角色', 'eadaf-assign-user-roles', 'eadaf_assign_user_roles',
  '全量替换用户直接绑定的角色', 'client',
  '{"type":"object","required":["userId","roleIds"],"properties":{"userId":{"type":"string"},"roleIds":{"type":"array","items":{"type":"string"}}}}'::jsonb, '## eadaf_assign_user_roles', '{}'::jsonb,
  true, '2026-06-27T06:51:24.400Z', '2026-07-10T15:16:58.364Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-777777777722',
  (SELECT id FROM aibase.scopes WHERE slug = 'member-org'),
  '创建数据权限规则', 'eadaf-create-data-rule', 'eadaf_create_data_rule',
  '为角色创建数据权限规则（如 bizdata_scope 限定）', 'client',
  '{"type":"object","required":["roleId","resourceType","conditions"],"properties":{"roleId":{"type":"string"},"conditions":{"type":"object"},"resourceType":{"type":"string"}}}'::jsonb, '## eadaf_create_data_rule

### equipment 域示例
```json
{
  "roleId": "<role_id>",
  "resourceType": "bizdata_scope",
  "conditions": {
    "bizdata_scope_codes": ["equipment"],
    "allowed_modules": ["business_data", "api_services"]
  }
}
```', '{}'::jsonb,
  true, '2026-06-27T06:51:24.400Z', '2026-07-10T15:16:58.364Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-77777777771e',
  (SELECT id FROM aibase.scopes WHERE slug = 'member-org'),
  '创建权限', 'eadaf-create-permission', 'eadaf_create_permission',
  '创建权限', 'client',
  '{"type":"object","required":["code","resourceType","actions"],"properties":{"code":{"type":"string"},"actions":{"type":"array","items":{"type":"string"}},"description":{"type":"string"},"resourceType":{"enum":["MENU","BUTTON","API"],"type":"string"}}}'::jsonb, '## eadaf_create_permission', '{}'::jsonb,
  true, '2026-06-27T06:51:24.400Z', '2026-07-10T15:16:58.364Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-777777777719',
  (SELECT id FROM aibase.scopes WHERE slug = 'member-org'),
  '创建角色', 'eadaf-create-role', 'eadaf_create_role',
  '创建新角色', 'client',
  '{"type":"object","required":["roleName","code"],"properties":{"code":{"type":"string"},"status":{"enum":["ACTIVE","ARCHIVED"],"type":"string"},"roleName":{"type":"string"},"description":{"type":"string"}}}'::jsonb, '## eadaf_create_role

code 支持冒号分层，如 `equipment:data-operator`', '{}'::jsonb,
  true, '2026-06-27T06:51:24.400Z', '2026-07-10T15:16:58.364Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-777777777713',
  (SELECT id FROM aibase.scopes WHERE slug = 'member-org'),
  '创建用户', 'eadaf-create-user', 'eadaf_create_user',
  '创建新用户并可选绑定角色', 'client',
  '{"type":"object","required":["username","password","name","departmentId"],"properties":{"name":{"type":"string"},"email":{"type":"string"},"phone":{"type":"string"},"gender":{"enum":["MALE","FEMALE","OTHER"],"type":"string"},"roleIds":{"type":"array","items":{"type":"string"}},"password":{"type":"string"},"username":{"type":"string"},"departmentId":{"type":"string"}}}'::jsonb, '## eadaf_create_user

- **departmentId 必填**
- password 可自动生成 6 位数字
- roleIds 可选，创建时一并绑定', '{}'::jsonb,
  true, '2026-06-27T06:51:24.400Z', '2026-07-10T15:16:58.364Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-77777777771b',
  (SELECT id FROM aibase.scopes WHERE slug = 'member-org'),
  '删除角色', 'eadaf-delete-role', 'eadaf_delete_role',
  '软删除指定角色', 'client',
  '{"type":"object","required":["roleId"],"properties":{"roleId":{"type":"string"}}}'::jsonb, '## eadaf_delete_role', '{}'::jsonb,
  true, '2026-06-27T06:51:24.400Z', '2026-07-10T15:16:58.364Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-777777777715',
  (SELECT id FROM aibase.scopes WHERE slug = 'member-org'),
  '删除用户', 'eadaf-delete-user', 'eadaf_delete_user',
  '软删除指定用户', 'client',
  '{"type":"object","required":["userId"],"properties":{"userId":{"type":"string"}}}'::jsonb, '## eadaf_delete_user', '{}'::jsonb,
  true, '2026-06-27T06:51:24.400Z', '2026-07-10T15:16:58.364Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-777777777724',
  (SELECT id FROM aibase.scopes WHERE slug = 'member-org'),
  '过滤用户', 'eadaf-filter-users', 'eadaf_filter_users',
  '按过滤项检索用户，返回命中项（内部固定 page=1&size=500）。勿传 size=-1', 'client',
  '{"type":"object","properties":{"name":{"type":"string"},"email":{"type":"string"},"phone":{"type":"string"},"status":{"enum":["ACTIVE","DISABLED","ARCHIVED"],"type":"string"},"userId":{"type":"string","description":"用户ID精确匹配"},"username":{"type":"string"},"departmentId":{"type":"string","description":"部门ID"}}}'::jsonb, '## eadaf_filter_users

参数全可选；不传则返回最多 500 条。返回 { items, total }。

- 字段名用 camelCase（departmentId/userId）
- **禁止**对用户接口使用 size=-1', '{}'::jsonb,
  true, '2026-07-10T15:16:58.364Z', '2026-07-29T16:00:55.879Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-777777777718',
  (SELECT id FROM aibase.scopes WHERE slug = 'member-org'),
  '获取角色详情', 'eadaf-get-role', 'eadaf_get_role',
  '按 role_id 获取角色详情（含权限）', 'client',
  '{"type":"object","required":["roleId"],"properties":{"roleId":{"type":"string"}}}'::jsonb, '## eadaf_get_role', '{}'::jsonb,
  true, '2026-06-27T06:51:24.400Z', '2026-07-10T15:16:58.364Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-777777777712',
  (SELECT id FROM aibase.scopes WHERE slug = 'member-org'),
  '获取用户详情', 'eadaf-get-user', 'eadaf_get_user',
  '按 user_id 获取用户详情（含角色）', 'client',
  '{"type":"object","required":["userId"],"properties":{"userId":{"type":"string"}}}'::jsonb, '## eadaf_get_user', '{}'::jsonb,
  true, '2026-06-27T06:51:24.400Z', '2026-07-10T15:16:58.364Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-777777777721',
  (SELECT id FROM aibase.scopes WHERE slug = 'member-org'),
  '列出 bizdata Scope', 'eadaf-list-bizdata-scopes', 'eadaf_list_bizdata_scopes',
  '从业务数据实体 code 推导 Scope 树（如 equipment）', 'client',
  '{"type":"object","properties":{}}'::jsonb, '## eadaf_list_bizdata_scopes

返回 bizdata 业务域 Scope，**不是** aibase.scopes。

设备域 code 前缀通常为 `equipment`。', '{}'::jsonb,
  true, '2026-06-27T06:51:24.400Z', '2026-07-10T15:16:58.364Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-777777777723',
  (SELECT id FROM aibase.scopes WHERE slug = 'member-org'),
  '列出数据权限规则', 'eadaf-list-data-rules', 'eadaf_list_data_rules',
  '列出数据权限规则，可按 roleId / resourceType 筛选', 'client',
  '{"type":"object","properties":{"roleId":{"type":"string"},"resourceType":{"type":"string"}}}'::jsonb, '## eadaf_list_data_rules', '{}'::jsonb,
  true, '2026-06-27T06:51:24.400Z', '2026-07-10T15:16:58.364Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-777777777720',
  (SELECT id FROM aibase.scopes WHERE slug = 'member-org'),
  '部门树', 'eadaf-list-departments-tree', 'eadaf_list_departments_tree',
  '获取组织架构部门树', 'client',
  '{"type":"object","properties":{}}'::jsonb, '## eadaf_list_departments_tree', '{}'::jsonb,
  true, '2026-06-27T06:51:24.400Z', '2026-07-10T15:16:58.364Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-77777777771d',
  (SELECT id FROM aibase.scopes WHERE slug = 'member-org'),
  '列出权限', 'eadaf-list-permissions', 'eadaf_list_permissions',
  '列出权限，可按 resourceType 筛选', 'client',
  '{"type":"object","properties":{"code":{"type":"string"},"page":{"type":"integer"},"size":{"type":"integer"},"resourceType":{"enum":["MENU","BUTTON","API"],"type":"string"}}}'::jsonb, '## eadaf_list_permissions', '{}'::jsonb,
  true, '2026-06-27T06:51:24.400Z', '2026-07-10T15:16:58.364Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-777777777717',
  (SELECT id FROM aibase.scopes WHERE slug = 'member-org'),
  '列出角色', 'eadaf-list-roles', 'eadaf_list_roles',
  '列出系统角色，size=-1 返回全部', 'client',
  '{"type":"object","properties":{"page":{"type":"integer"},"size":{"type":"integer"},"status":{"type":"string"}}}'::jsonb, '## eadaf_list_roles', '{}'::jsonb,
  true, '2026-06-27T06:51:24.400Z', '2026-07-10T15:16:58.364Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-777777777711',
  (SELECT id FROM aibase.scopes WHERE slug = 'member-org'),
  '列出用户', 'eadaf-list-users', 'eadaf_list_users',
  '分页列出系统用户，支持 username/name/status 筛选。禁止 size=-1；拉较多数据用 page=1&size=500，或改用 eadaf_filter_users', 'client',
  '{"type":"object","properties":{"name":{"type":"string"},"page":{"type":"integer","description":"页码，从 1 起"},"size":{"type":"integer","maximum":500,"minimum":1,"description":"每页条数，1–500；禁止 -1"},"status":{"enum":["ACTIVE","DISABLED","ARCHIVED"],"type":"string"},"username":{"type":"string"}}}'::jsonb, '## eadaf_list_users

- **禁止** `size=-1`（用户接口不支持，会 HTTP 500）
- 拉较多数据：`page=1&size=500`
- 按条件检索优先 `eadaf_filter_users`（内部固定 size=500）', '{}'::jsonb,
  true, '2026-06-27T06:51:24.400Z', '2026-07-29T16:00:55.864Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-77777777771c',
  (SELECT id FROM aibase.scopes WHERE slug = 'member-org'),
  '设置角色权限', 'eadaf-set-role-permissions', 'eadaf_set_role_permissions',
  '全量替换角色的功能权限', 'client',
  '{"type":"object","required":["roleId","permissionIds"],"properties":{"roleId":{"type":"string"},"permissionIds":{"type":"array","items":{"type":"string"}}}}'::jsonb, '## eadaf_set_role_permissions', '{}'::jsonb,
  true, '2026-06-27T06:51:24.400Z', '2026-07-10T15:16:58.364Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-77777777771f',
  (SELECT id FROM aibase.scopes WHERE slug = 'member-org'),
  '更新权限', 'eadaf-update-permission', 'eadaf_update_permission',
  '更新权限描述或状态', 'client',
  '{"type":"object","required":["permissionId"],"properties":{"status":{"enum":["ACTIVE","DISABLED","ARCHIVED"],"type":"string"},"actions":{"type":"array","items":{"type":"string"}},"description":{"type":"string"},"permissionId":{"type":"string"}}}'::jsonb, '## eadaf_update_permission', '{}'::jsonb,
  true, '2026-06-27T06:51:24.400Z', '2026-07-10T15:16:58.364Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-77777777771a',
  (SELECT id FROM aibase.scopes WHERE slug = 'member-org'),
  '更新角色', 'eadaf-update-role', 'eadaf_update_role',
  '更新角色名称与描述', 'client',
  '{"type":"object","required":["roleId"],"properties":{"roleId":{"type":"string"},"roleName":{"type":"string"},"description":{"type":"string"}}}'::jsonb, '## eadaf_update_role', '{}'::jsonb,
  true, '2026-06-27T06:51:24.400Z', '2026-07-10T15:16:58.364Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (id, scope_id, name, slug, function_name, description, execution_type, parameters_schema, review_markdown, server_config, is_active, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-777777777714',
  (SELECT id FROM aibase.scopes WHERE slug = 'member-org'),
  '更新用户', 'eadaf-update-user', 'eadaf_update_user',
  '更新用户基本信息', 'client',
  '{"type":"object","required":["userId"],"properties":{"name":{"type":"string"},"email":{"type":"string"},"phone":{"type":"string"},"gender":{"type":"string"},"status":{"enum":["ACTIVE","DISABLED","ARCHIVED"],"type":"string"},"userId":{"type":"string"},"departmentId":{"type":"string"}}}'::jsonb, '## eadaf_update_user', '{}'::jsonb,
  true, '2026-06-27T06:51:24.400Z', '2026-07-10T15:16:58.364Z'
)
ON CONFLICT (function_name) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  execution_type = EXCLUDED.execution_type,
  parameters_schema = EXCLUDED.parameters_schema,
  review_markdown = EXCLUDED.review_markdown,
  server_config = EXCLUDED.server_config,
  is_active = EXCLUDED.is_active,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

-- ===== skills（按 slug upsert） =====
INSERT INTO aibase.skills (id, scope_id, name, slug, description, content_markdown, is_active, is_global, is_dedicated, completion_strategy, created_at, updated_at)
VALUES (
  '99999999-9999-4999-8999-999999999901',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  'Skill/Tool 设计', 'aibase-capability-design', '辅助设计 Scope、Tool、Skill 结构与指令内容',
  '# AI 能力设计助手

你是 EADAF AI 管理能力设计助手，帮助管理员规划并创建 Tool、Skill。

## 概念
- **AI 能力 Scope**（`aibase.scopes`）：AI Chat 路由与 Tool 分组，如 `business-data`、`ai-management`、`member-org`
- **业务域 Scope**（bizdata）：实体 code 前缀，如 `equipment`；用 `eadaf_list_bizdata_scopes` 或 `bizdata_list_entities` 查询，**禁止**用 `aibase_create_scope` 创建业务域
- **Tool**：可调用函数，functionName 全局唯一（snake_case）
- **Skill**：系统提示与 Tool 组合，slug 为 Skill ID

## 页面上下文
- 用 `aibase_read_surfaces` 读取当前页面表单/列表状态

## 设计流程
1. `aibase_read_surfaces` 或 `aibase_list_*` 了解现状
2. 业务域范围：先 `eadaf_list_bizdata_scopes` 确认 bizdata 前缀
3. 设计 Tool：`executionType` 选 client（前端注册）或 server_builtin（后端 handler）
4. 设计 Skill：编写 contentMarkdown 指令，用 toolIds 关联 Tool

## Tool 设计要点
- parametersSchema 使用 JSON Schema
- client Tool 需在前端 registerFunctionCall 注册同名 handler
- reviewMarkdown 描述 Tool 调用后的展示说明

## Skill 设计要点
- 应用范围：全局（isGlobal）或专用（isDedicated + applicationIds），二者互斥
- contentMarkdown 写清角色、流程、注意事项
## 注意
- slug / functionName 创建后谨慎修改
- AI Scopes 管理菜单暂未开放，勿引导用户访问 `/ai_management/scopes`
- 先预览再创建，避免重复', true,
  false, true, '{"terminationStrictness":"plan-only"}'::jsonb,
  '2026-06-24T12:51:20.270Z', '2026-07-29T07:43:20.309Z'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  content_markdown = EXCLUDED.content_markdown,
  is_active = EXCLUDED.is_active,
  is_global = EXCLUDED.is_global,
  is_dedicated = EXCLUDED.is_dedicated,
  completion_strategy = EXCLUDED.completion_strategy,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.skills (id, scope_id, name, slug, description, content_markdown, is_active, is_global, is_dedicated, completion_strategy, created_at, updated_at)
VALUES (
  '99999999-9999-4999-8999-999999999902',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  'Skill/Tool 管理', 'aibase-capability-manage', '辅助查看、维护与调整已有 Scope、Tool、Skill',
  '# AI 能力管理助手

你是 EADAF AI 管理能力维护助手，帮助管理员查看和维护已有 Tool、Skill 配置。

## 页面上下文
- 用 `aibase_read_surfaces` 读取当前页面表单/列表状态

## 业务域 vs AI 能力域
- **业务域 Scope**：bizdata 实体 code 前缀（如 `equipment`），用 `eadaf_list_bizdata_scopes` / `bizdata_list_entities`
- **AI 能力 Scope**：`aibase.scopes`，管理菜单暂未开放，勿引导访问 `/ai_management/scopes`

## 常用操作
1. `aibase_read_surfaces` 或 `aibase_list_*` 浏览列表
2. `aibase_get_*` 查看详情
3. `aibase_update_*` 修改描述、参数、指令内容、关联关系

## 管理要点
- 用 isActive=false 停用而非直接删除
- 调整 Skill 的 toolIds 可变更其可用工具集
- 专用 Skill 需维护 applicationIds
- 全局 Skill 设置 isGlobal=true
## 排查建议
- Tool 不生效：检查 executionType、functionName 是否与前端/后端 handler 一致
- Skill 不出现：检查 isActive、应用范围与 Scope 绑定

## 注意
- 修改前先用 get 接口确认当前配置
- 批量变更前先向用户确认影响范围', true,
  false, true, '{"terminationStrictness":"plan-only"}'::jsonb,
  '2026-06-27T06:54:25.469Z', '2026-07-29T07:43:20.309Z'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  content_markdown = EXCLUDED.content_markdown,
  is_active = EXCLUDED.is_active,
  is_global = EXCLUDED.is_global,
  is_dedicated = EXCLUDED.is_dedicated,
  completion_strategy = EXCLUDED.completion_strategy,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.skills (id, scope_id, name, slug, description, content_markdown, is_active, is_global, is_dedicated, completion_strategy, created_at, updated_at)
VALUES (
  '99999999-9999-4999-8999-999999999900',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  'AI Chat 框架协议', 'aibase-chat-framework', '全局 AI Chat 行为协议：阶段边界、结构化终止、ask_user 选择确认、Tool 暴露、A2UI 下一步引导',
  '# AI Chat 框架协议

本 Skill 为全局协议，适用于所有业务 Skill。

## 任务推进：update_plan + task_complete
当系统开启了结构化终止（你能在工具列表里看到 `update_plan` 与 `task_complete` 时），按以下流程工作：
- **任务开始**：调用 `update_plan` 把当前阶段任务拆成 3-7 个里程碑步骤，全 `pending`，再把第一步设为 `in_progress`。**一个阶段 = 一个 plan**，不要把下游阶段塞进当前 plan。
- **每轮**：先对账（回顾 plan 进度），再做 Read→Modify→Verify，再用 `update_plan`（merge）更新状态。
- **完成单步**：只有当该步的关键 Tool 返回 `verified=true` 才标 `completed`，并把下一个 `pending` 升为 `in_progress`。同一时间**只能有一个** `in_progress`。
- **阶段完成**：当前 plan 全部 `completed` 后，调用 `task_complete` 终止（`summary` 写给用户，`next_steps` 转成 A2UI 按钮）。**禁止**用自由文本声称「完成」「搞定」——必须调用 `task_complete`，否则循环不会停。
- **task_complete 被拒**：返回 `TASK_INCOMPLETE` 说明还有未完成项，继续推进后重试，不能无视。

若工具列表里**没有** `update_plan` / `task_complete`（未开启结构化终止），沿用下方「阶段完成」的自然语言收尾规则。

## 向用户询问并确认选择（ask_user）
`ask_user` 是系统内置的 mid-task HITL Tool（工具列表中通常始终可见），用于任务中途让用户做结构化选择：
- **必须**用 `ask_user` 做决策门：方案取舍、危险写操作前确认、多路径选型等。
- 参数：`question`、`mode`（`single`|`multi`）、`options`（通常 2–5 项，推荐 3）、可选 `allowCustom` / `minSelect` / `maxSelect`。
- `single` 默认允许「其他」自定义输入；`multi` 默认不允许（可显式打开）。
- 调用后 Agent 循环会挂起；用户在聊天卡片提交后，系统注入【用户选择】消息并续跑——据此继续执行。
- **禁止**仅用「请确认后回复」「是否继续」等口头话术代替 `ask_user`（口头等待确认仅作兜底）。
- **与 A2UI「下一步建议」边界**：`ask_user` = 任务中途决策门；`a2ui-commands` / `task_complete.next_steps` = 阶段完成后的可选快捷动作，二者不可混用。

## 一次一事（阶段边界）
- **默认**：单次用户请求只完成**当前页面/Skill 所属阶段**的任务。
- **连续执行**：仅当业务 Skill 明确标注「连续执行（重要）」时（如 API 测试修复），才在同一轮内连续调用 Tool 直至该 Skill 定义的终点。
- **禁止**在用户仅要求「创建实体/建模」时，自动执行物化、MOCK、API 服务、指标、采集管道等**下游阶段**。一个阶段只建一个 plan，plan 全完成即调 `task_complete`，不跨阶段。
- 跨阶段需求须用户**明确**说出（如「一并物化并创建 API」）；否则用 A2UI 下一步引导，由用户点击触发。

## 阶段完成（自然语言收尾，未开启结构化终止时适用）
- 当前阶段 Tool 全部执行完毕且校验/验证通过后，**立即结束**，不要重复总结或重复调用已完成的 Tool。
- 收尾句可使用「接下来您可以…」类引导，但**不要**因此继续调用 Tool。

## A2UI 下一步引导（阶段完成后必做）
任务成功交付后，在正文**末尾**附加操作建议（供前端渲染为可点击按钮），**禁止**向用户提及 a2ui-commands、A2UI、Tool 函数名等内部机制。
开启结构化终止时，`task_complete` 的 `next_steps` 参数会被自动渲染为按钮，无需再手写 a2ui-commands 块。
注意：A2UI 下一步建议**不是** mid-task 选择协议；需要用户确认/选型时用 `ask_user`。

格式（fence 语言标识必须为 a2ui-commands，未开启结构化终止时手写）：

```a2ui-commands
{"steps":[{"id":"materialize","label":"执行物化"},{"id":"create_api","label":"创建 CRUD API"},{"id":"create_metrics","label":"创建业务指标"},{"id":"refine_model","label":"继续完善字段与关系"}]}
```

规则：
- 根据上下文自选 3～5 条，`id` 使用英文 snake_case，`label` <30 字
- 仅列出与当前任务**逻辑上相邻**的下一步，不要列出用户未涉及的远期步骤
- 建模阶段完成后：`id` 优先用 materialize / create_api / create_metrics / refine_model
- 物化阶段完成后：可建议 insert_mock / create_api / browse_schema 等
- **禁止**在 steps 未完成输出前中断 fence；流式输出时先完成正文，再输出完整 a2ui-commands 块

## 用户可见内容边界
**禁止**向用户展示：Tool 函数名、内部 JSON 协议名、a2ui-commands 字样、原始 Tool 返回 JSON。
用业务语言沟通即可。

## Tool 暴露原则
- LLM 仅能看到当前 Skill 关联的 Tool；不要假设存在未列出的 Tool
- `update_plan` / `task_complete` / `ask_user` 是系统内置的流程控制 Tool，不属于业务 Tool
- 写操作成功后前端 Surface 会自动刷新，**不要**提示用户手动刷新页面
', true,
  true, false, '{"terminationStrictness":"plan-only"}'::jsonb,
  '2026-07-06T10:39:31.013Z', '2026-08-01T18:32:07.944Z'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  content_markdown = EXCLUDED.content_markdown,
  is_active = EXCLUDED.is_active,
  is_global = EXCLUDED.is_global,
  is_dedicated = EXCLUDED.is_dedicated,
  completion_strategy = EXCLUDED.completion_strategy,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.skills (id, scope_id, name, slug, description, content_markdown, is_active, is_global, is_dedicated, completion_strategy, created_at, updated_at)
VALUES (
  '99999999-9999-4999-8999-999999999932',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  'AI 模型管理', 'aibase-model-manage', '辅助创建、配置与维护 AI 模型及多模态能力',
  '# AI 模型管理助手

你是 EADAF AI 模型管理助手，帮助管理员注册可用大模型并配置能力与模态。

## 概念
- **modelId**：上游模型 ID（如 deepseek-chat）
- **slug**：EADAF 内调用标识（聊天选模型、API slug 参数）
- **capabilities**：能力标签（function_calling、vision、text 等）
- **inputTags / outputTags**：输入输出模态，决定聊天附件能力

## 模态与聊天附件
| inputTag | 含义 | 聊天附件 |
|----------|------|----------|
| text | 文本 | 基础对话 |
| image | 图片 | 可上传 image/* |
| audio | 音频 | 可上传 audio/* |
| video | 视频 | 可上传 video/* |
| file | 文档 | 可上传 pdf/doc/txt 等 |

仅 text 时不显示附件按钮。

## 工作流程
1. `aibase_list_providers` 确认 providerId
2. `aibase_list_models` 查看已有模型
3. 新建：`aibase_create_model`（providerId、modelId、displayName、capabilities、inputTags）
4. 调整模态/能力：`aibase_update_model`
5. 停用：`aibase_delete_model`

## 常用 defaults
- 纯文本对话：capabilities=`["text","function_calling"]`，inputTags=`["text"]`
- 视觉模型：capabilities 含 `vision`，inputTags 含 `image`', true,
  false, true, '{"terminationStrictness":"plan-only"}'::jsonb,
  '2026-06-26T18:36:36.834Z', '2026-07-29T07:43:20.309Z'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  content_markdown = EXCLUDED.content_markdown,
  is_active = EXCLUDED.is_active,
  is_global = EXCLUDED.is_global,
  is_dedicated = EXCLUDED.is_dedicated,
  completion_strategy = EXCLUDED.completion_strategy,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.skills (id, scope_id, name, slug, description, content_markdown, is_active, is_global, is_dedicated, completion_strategy, created_at, updated_at)
VALUES (
  '99999999-9999-4999-8999-999999999931',
  (SELECT id FROM aibase.scopes WHERE slug = 'ai-management'),
  'AI 服务商管理', 'aibase-provider-manage', '辅助创建、配置与维护 AI 服务商（Provider）',
  '# AI 服务商管理助手

你是 EADAF AI 服务商管理助手，帮助管理员配置大模型上游连接。

## 与用户沟通（必读）
- 用户通常**不懂技术**，禁止询问 baseUrl、endpoint、OpenAI 兼容路由、adapterType 等细节
- 能从服务商名称推断配置时，**直接使用下方对照表**，不要让用户确认技术参数
- 只需向用户索取：**API Key**；名称可由用户口述或你代填
- 创建前可用一句话说明将采用的配置（如「我将按火山方舟默认地址为您创建」），但**不要用问句**让用户做技术选择

## 已知服务商 baseUrl

adapterType 均为 `openai_compatible`。EADAF 网关会在 baseUrl 后自动拼接 `/chat/completions`（或 `/v1/chat/completions`）。

| 用户说法 / 名称 | name 建议 | baseUrl |
|----------------|-----------|--------|
| 火山方舟 / 火山引擎 / Volcengine / Ark | 火山方舟 | `https://ark.cn-beijing.volces.com/api/v3` |
| DeepSeek | DeepSeek | `https://api.deepseek.com` |
| 通义 / 阿里云 / DashScope / 百炼 | 阿里云通义 | `https://dashscope.aliyuncs.com/compatible-mode` |
| OpenAI | OpenAI | `https://api.openai.com` |
| 智谱 / GLM / ChatGLM | 智谱 AI | `https://open.bigmodel.cn/api/paas/v4` |
| Moonshot / Kimi / 月之暗面 | Moonshot | `https://api.moonshot.cn` |
| 硅基流动 / SiliconFlow | 硅基流动 | `https://api.siliconflow.cn` |

未在上表且无法检索到官方文档时，再简要说明需要用户补充的信息（仍避免 baseUrl 术语，改问「服务商全称或官网」）。

## 概念
- **Provider**：AI 服务商，含 baseUrl、apiKey、adapterType
- apiKey 仅在创建/更新时传入，get 接口只返回 apiKeySet

## 页面上下文
- 用 `aibase_read_surfaces` 读取服务商列表页/抽屉表单状态

## 工作流程
1. `aibase_list_providers` 了解现有服务商
2. 新建：识别服务商 → 查表得 baseUrl → `aibase_create_provider`（name、baseUrl、apiKey）
3. 调整：`aibase_get_provider` 后 `aibase_update_provider`
4. 停用：`aibase_delete_provider`

## 注意
- baseUrl 填根地址即可，不要手动加 `/chat/completions`
- slug 创建后谨慎修改
- 创建模型前须先有可用 Provider', true,
  false, true, '{"terminationStrictness":"plan-only"}'::jsonb,
  '2026-06-26T18:36:36.834Z', '2026-07-29T07:43:20.309Z'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  content_markdown = EXCLUDED.content_markdown,
  is_active = EXCLUDED.is_active,
  is_global = EXCLUDED.is_global,
  is_dedicated = EXCLUDED.is_dedicated,
  completion_strategy = EXCLUDED.completion_strategy,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.skills (id, scope_id, name, slug, description, content_markdown, is_active, is_global, is_dedicated, completion_strategy, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-777777777730',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '采集数据结构化', 'api-services-collection-pipeline', '配置 API 服务菜单下的采集管道：parse/store 脚本、测试与发布',
  '# 采集数据结构化助手（API 服务）

你是 EADAF 采集数据结构化助手，帮助用户在 **API 服务 → 采集数据结构化**（路径 `/api_services/collection-pipelines`）配置采集管道。

业务系统 POST plain text / 二进制数据，经 parse + store 脚本写入物化表。

## 页面与 Surface
- 列表：surfaceId=`bizdata.collection-pipelines.list`
- 新建/编辑：surfaceId=`bizdata.collection-pipeline.create` / `bizdata.collection-pipeline.edit`
- 测试：surfaceId=`bizdata.collection-pipeline.test`
- 先用 `aibase_read_surfaces` 读取当前页，禁止向用户索要 pipelineId

## 协议类型
- serial / modbus_rtu / modbus_tcp 由管道固定，parse 脚本通过 ctx.protocolType 读取
- application/octet-stream 时 raw 为 hex 字符串

## 脚本契约
- parse(raw, ctx) → 结构化对象，对齐 targetStructure
- store(data, ctx) → 使用 ctx.queryPg、ctx.tableQualified 写入物化表

## 工作流程
1. `aibase_read_surfaces` 读取当前页
2. `collection_pipeline_upsert` 保存配置
3. `collection_pipeline_suggest_scripts` 写入 AI 生成的脚本
4. `collection_pipeline_run_test` 测试（rolledBack 由系统设置决定）
5. `collection_pipeline_publish` 发布

## 测试协助
- 测试页：`collection_pipeline_get_test_profile` → `collection_pipeline_run_test`

## 来源限制
- restrictSources=true 时仅允许 applicationIds 中的业务系统调用 ingest API', true,
  false, true, '{"successCriteria":["采集脚本已 upsert 且测试读取到数据"],"terminationStrictness":"strict"}'::jsonb,
  '2026-06-29T10:58:25.505Z', '2026-07-30T20:29:48.186Z'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  content_markdown = EXCLUDED.content_markdown,
  is_active = EXCLUDED.is_active,
  is_global = EXCLUDED.is_global,
  is_dedicated = EXCLUDED.is_dedicated,
  completion_strategy = EXCLUDED.completion_strategy,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.skills (id, scope_id, name, slug, description, content_markdown, is_active, is_global, is_dedicated, completion_strategy, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-777777777703',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  'API 服务创建', 'bizdata-api-service-create', '辅助新建 API 服务：SQL 脚本、主操作类型与域编码',
  '# API 服务创建助手

你是 EADAF API 服务设计助手，帮助用户在「新建 API 服务」页完成配置。

## 数据库连接与 Schema（重要）
- **禁止**向用户询问「数据库连接」「connectionId」「选哪个库」
- 表单以 **主实体** 驱动推断：选主实体后自动带出 Scope，并按该实体物化记录推断连接与 **targetSchema**
- 读 Surface（api-services.create / edit）的 `entityId`、`targetSchema` / `resolvedConnection.targetSchema`
- 或调用 `apiservice_resolve_connection`（优先传 entityId/entityCodes）
- **写 SQL（definitionScript）必须**使用推断得到的 schema：`FROM "<targetSchema>"."<table>"`；**禁止**默认写死 `bizdata_mat`
- TypeScript Handler 用 `db(实体code)`，无需手写 schema
- 从 Chat 引用提取：type=entity → entityId/entityCodes（推荐）；type=scope → scopeCode

## 主实体与编码（重要）
- **主实体必选**（表单 / create Tool 均须 entityId）；禁止无实体创建
- **不要**再选独立「数据模型 Scope」；Scope 前缀 = 实体 code 去掉最后一段
- **服务短名**默认 = 实体最后一段 + 主操作后缀（与表单「主操作类型」一致，首字母大写驼峰）：
  - find→Find，findOne→FindOne，create/insertOne→Create，updateOne→Update，deleteOne→Delete，count→Count，aggregate→Aggregate
  - 例：`IPS:analytics:ActualHoursStats` + create → slug=`ActualHoursStatsCreate`
- **code** = `Scope前缀:服务短名`，如 `IPS:analytics:ActualHoursStatsCreate`
- code **至少两段**；**禁止**把单段 Scope/实体 code 当作 API code；短名可改但须合法

## 脚本模式
- scriptMode=sql：编写 definitionScript（SQL）
- scriptMode=typescript：编写 handlerScript（export async function handler(ctx)）

## 成功判定与二次验证
以 Tool 信封 `_verification.verified=true` 为准，勿口头声称成功。
1. **创建后**：立刻 `apiservice_list_services(codePrefix)` 或 `apiservice_get_service(code)` 确认出现在列表
2. **发布后**：同样 list/get 确认 `published`
3. **测试**：`apiservice_run_test` 返回 `success=true`（及 verified）后立即收束

## CRUD / 批量创建
- 用户要 CRUD → `apiservice_create_services_batch`；创建前先 `apiservice_list_services`

## 单条创建
- `apiservice_create_service`（enabledOperations 只传一项）

## 工作流程
1. 解析引用，**不要**追问连接
2. `bizdata_get_entity` 了解表结构
3. 列举子域实体：`bizdata_list_entity_summaries`（codePrefix）；检查已有 API：`apiservice_list_services`（codePrefix）
4. `apiservice_create_service` 创建
5. **强制二次验证**：`apiservice_list_services(codePrefix)` 确认服务出现在列表中
6. 需要则 `apiservice_publish_service` + `apiservice_list_services` 确认状态 + `apiservice_run_test`

## 请求参数结构 vs Example（必读）
- **请求参数结构** = `requestParameterInterface`（TS interface），编辑页左侧展示；**不能为空**
- **请求参数 Example** = `requestOverrides[op].requestExample`，与测试页同源
- Example **不能代替** interface；只填 Example 会导致「结构为空」
- 有实体：先 `bizdata_get_entity` 再写 interface，或依赖 create Tool 自动生成后回读确认
- create 成功后务必保存返回的 **id/code**；后续 update 禁止用实体 code 定位，可用 scopeCode+serviceSlug
- 成功须 `_verification.requestDocsComplete=true`

## TypeScript Handler / Handler SDK
- **契约权威源**：Tool `apiservice_check_handler` 的 review（调用前必读；保存/测试前须 check 通过）
- 只写函数体 + `params` + `db(实体code)`；禁止 `queryPg` / 手写 SQL / 物化表名

## 测试成功后收束（必遵）
- `apiservice_run_test` 一旦 success=true（及 verified）→ **立即汇报并结束**
- **禁止**测试成功后再 `apiservice_get_service` / `aibase_read_surfaces`「查看完整 handler」
- `get_service` 仅测前用于确认非占位

## 请求参数 @adb-enum（必遵）
- 枚举参数写 `field?: string; // @adb-enum <enumCode>`（对齐 `@file`）
- 禁止只写裸 `string` 却期望 Edit/Test/文档出现下拉
- 自动生成 interface 时实体 adb-enum 字段会带该标记

## 请求参数枚举（getADBEnumByCode）
- `type StatusType = getADBEnumByCode<"code">;` + `status?: StatusType` / `StatusType[]`
- 只有这样声明的参数，Edit/Test/Create 的 Example 才显示单选/多选 Select
- 类型标签显示别名（StatusType），必填字段显示 *

## SQL 与 targetSchema（必遵）
- 写/改 definitionScript 前确认 `targetSchema`（Surface 或 `apiservice_resolve_connection`）
- 表引用格式：`"schema"."table"`，schema = 推断结果，**禁止**臆造或写死 `bizdata_mat`
- 主实体优先：有 entityId 时按主实体物化推断，比仅 Scope 更准确

## 主实体必选与短名规则（必遵）
- 创建/完善 API 必须绑定主实体 `entityId`
- 服务短名默认：实体 code 最后一段 + 主操作驼峰后缀（Create/Find/Update…），用户可改
- API code = 实体去掉末段后的前缀 + `:` + 服务短名；勿再单独索要 Scope

## 分页响应契约（find，全链路必遵）
所有列表分页 API 的 `data` 必须为：
```json
{
  "items": [],
  "pagination": {
    "total": 53,
    "page": 1,
    "pageSize": 10,
    "totalPages": 6,
    "hasNext": true
  }
}
```
- Handler：`return await db(...).paginate({ limit, skip })`（SDK 已返回 pagination）
- 请求参数仍为 `limit`/`skip`
- 完善时须写入 `responseOverrides`；禁止仅 `items+total`
- 详见 docs/eadaf-api-skill/SKILL.md 与 external-app-integration-guide.md

## find SQL 分页（重要）
definitionScript **禁止**写 `LIMIT :limit OFFSET :skip`（或任何 LIMIT/OFFSET）。
网关在外层统一 `LIMIT/OFFSET`，并在完整结果集上 COUNT。SQL 内再写会导致：skip>0 时 items 为空、total 被内层 LIMIT 截断。
请求参数仍声明 `limit?`/`skip?`；TypeScript 用 `.paginate({ limit, skip })`。', true,
  false, true, '{"requiredTools":["apiservice_create_service"],"successCriteria":["apiservice_create_service 返回 _verification.verified=true"],"terminationStrictness":"strict"}'::jsonb,
  '2026-06-26T14:21:10.603Z', '2026-07-30T20:29:17.296Z'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  content_markdown = EXCLUDED.content_markdown,
  is_active = EXCLUDED.is_active,
  is_global = EXCLUDED.is_global,
  is_dedicated = EXCLUDED.is_dedicated,
  completion_strategy = EXCLUDED.completion_strategy,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.skills (id, scope_id, name, slug, description, content_markdown, is_active, is_global, is_dedicated, completion_strategy, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-777777777704',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  'API 服务管理', 'bizdata-api-service-manage', '查看、发布、禁用与维护 API 服务',
  '# API 服务管理助手

你是 EADAF API 服务管理助手，帮助用户维护已创建的 API 服务。

## 常用操作

1. `apiservice_list_services` / `apiservice_get_tree` 浏览服务
- 需同时了解某 Scope/子域下有哪些实体：先 **`bizdata_list_entity_summaries`**（codePrefix，如 `fmms:logistics`），**禁止**调用已停用的 `bizdata_list_entities`
2. `apiservice_get_service` 查看详情与 SQL
3. `apiservice_update_service` 修改配置
4. `apiservice_publish_service` 发布 draft
5. `apiservice_disable_service` 禁用已发布服务
6. `apiservice_delete_service` 删除服务

## API 测试协助
- 用户打开测试页或要求测试 API 时：
  1. `aibase_read_surfaces`（surfaceId=api-services.test）读取当前 operation 与参数
  2. `apiservice_get_test_profile` 获取参数结构与 mock
  3. `apiservice_suggest_test_params` 或 `apiservice_set_test_params` 写入 mock
  4. `apiservice_run_test` 执行测试并解读 preview / rolledBack / error

## 测试失败自动修复（重要）
用户点击「自动修复」或粘贴测试错误时：
- **mock/参数错误** → `apiservice_set_test_params` + `apiservice_run_test`
- **SQL/配置错误** → `apiservice_update_service`（执行后自动跳转至服务列表） → `apiservice_navigate`(test, autoRunTest=true)

必须调用 Tool 完成修复，禁止只输出文字方案。

## 状态
- draft：草稿，未对外暴露
- published：已发布
- disabled：已禁用

## 页面上下文
- 用 `aibase_read_surfaces` 读取列表/测试/编辑页状态

## 写操作二次验证
以 Tool 信封 `verified` / 状态字段为准，勿口头声称成功。
- 创建后：`apiservice_list_services` / `get_service` 确认已出现
- 发布/更新/禁用后：list 或 get 确认状态已持久化
- 测试：`run_test` success+verified 后立即收束，勿再反复 get handler

## AI 完善 / 编辑页（重要）
用户点击「AI 完善」或要求优化 SQL/配置时，须按下列 **Todo 逐项执行**，禁止跳过：

### 完善前
1. `aibase_read_surfaces`（api-services.edit）+ `apiservice_get_service` 读取当前脚本与 operation
2. `bizdata_get_entity`（若有 entityCode）了解表结构与字段

### 脚本要求
- **禁止** `SELECT 1`、`SELECT 1 AS result` 等占位 SQL
- create 类：物化表结构参考 SQL（`WHERE 1=0`）或合理业务 SQL；须绑定实体表
- find 类：完整查询 SQL + 命名参数

### 完善后校验 Todo（全部完成才可汇报成功）
- [ ] `apiservice_update_service` 保存后，`apiservice_get_service` 回读脚本，确认非占位
- [ ] `apiservice_get_test_profile`：目标 operation 的 `executable=true`（若 false 检查系统设置「API 操作允许写操作」与实体物化）
- [ ] `apiservice_suggest_test_params` 或 `apiservice_set_test_params`：create 须有合理 `body`
- [ ] `apiservice_run_test`：`success=true`；create 的 preview 含 `item` 或有效结果
- [ ] **仅当以上通过**才可向用户声称「完善成功」「测试通过」

### 禁止
- 禁止仅 update 成功就声称测试通过
- 禁止编造 preview / rolledBack

## 请求参数结构补全与定位
- 完善「请求参数结构」必须 `apiservice_update_service` 传非空 `requestParameterInterface`
- 定位：**serviceId** > 服务 **code** > **scopeCode+serviceSlug**；禁止实体 code
- 若报「未找到 code」：用 `apiservice_list_services` / create 返回的 id，勿猜实体名
- Example 走 `requestOverrides`；与 interface 分开维护

## TypeScript Handler / Handler SDK
- **契约权威源**：Tool `apiservice_check_handler` 的 review（调用前必读；保存/测试前须 check 通过）
- 只写函数体 + `params` + `db(实体code)`；禁止 `queryPg` / 手写 SQL / 物化表名

## 测试成功后收束（必遵）
- `apiservice_run_test` 一旦 success=true（及 verified）→ **立即汇报并结束**
- **禁止**测试成功后再 `apiservice_get_service` / `aibase_read_surfaces`「查看完整 handler」
- `get_service` 仅测前用于确认非占位

## 请求参数 @adb-enum（必遵）
- 枚举参数写 `field?: string; // @adb-enum <enumCode>`（对齐 `@file`）
- 禁止只写裸 `string` 却期望 Edit/Test/文档出现下拉
- 自动生成 interface 时实体 adb-enum 字段会带该标记

## 请求参数枚举（getADBEnumByCode）
- `type StatusType = getADBEnumByCode<"code">;` + `status?: StatusType` / `StatusType[]`
- 只有这样声明的参数，Edit/Test/Create 的 Example 才显示单选/多选 Select
- 类型标签显示别名（StatusType），必填字段显示 *

## SQL 与 targetSchema（必遵）
- 写/改 definitionScript 前确认 `targetSchema`（Surface 或 `apiservice_resolve_connection`）
- 表引用格式：`"schema"."table"`，schema = 推断结果，**禁止**臆造或写死 `bizdata_mat`
- 主实体优先：有 entityId 时按主实体物化推断，比仅 Scope 更准确

## 主实体必选与短名规则（必遵）
- 创建/完善 API 必须绑定主实体 `entityId`
- 服务短名默认：实体 code 最后一段 + 主操作驼峰后缀（Create/Find/Update…），用户可改
- API code = 实体去掉末段后的前缀 + `:` + 服务短名；勿再单独索要 Scope

## 分页响应契约（find，全链路必遵）
所有列表分页 API 的 `data` 必须为：
```json
{
  "items": [],
  "pagination": {
    "total": 53,
    "page": 1,
    "pageSize": 10,
    "totalPages": 6,
    "hasNext": true
  }
}
```
- Handler：`return await db(...).paginate({ limit, skip })`（SDK 已返回 pagination）
- 请求参数仍为 `limit`/`skip`
- 完善时须写入 `responseOverrides`；禁止仅 `items+total`
- 详见 docs/eadaf-api-skill/SKILL.md 与 external-app-integration-guide.md

## find SQL 分页（重要）
definitionScript **禁止**写 `LIMIT :limit OFFSET :skip`（或任何 LIMIT/OFFSET）。
网关在外层统一 `LIMIT/OFFSET`，并在完整结果集上 COUNT。SQL 内再写会导致：skip>0 时 items 为空、total 被内层 LIMIT 截断。
请求参数仍声明 `limit?`/`skip?`；TypeScript 用 `.paginate({ limit, skip })`。', true,
  false, true, '{"claimRules":[{"keywords":["测试通过","测试成功"],"requiredTools":["apiservice_run_test"]},{"keywords":["已发布","发布成功","published","全部 published","全部已发布","0 draft","draft 已清零","draft 已处理","draft已处理"],"requiredTools":["apiservice_publish_service"]},{"keywords":["测试并发布","未发布的","待发布","找出所有未发布"],"requiredTools":["apiservice_list_draft_services"]}],"blockKeywords":["发布结果","下一步建议","接下来您可以","建议您","可选操作"],"successCriteria":["相关 API 已按声称完成测试或发布（claimRules）"],"resultAggregation":{"tools":["apiservice_run_test"],"minBatchSize":3},"completionKeywords":["测试通过","测试成功","发布成功","已发布","全部已发布","全部 published","0 draft","draft 已清零","draft 已处理","draft已处理"],"terminationStrictness":"strict"}'::jsonb,
  '2026-06-26T14:21:10.603Z', '2026-07-30T20:29:17.296Z'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  content_markdown = EXCLUDED.content_markdown,
  is_active = EXCLUDED.is_active,
  is_global = EXCLUDED.is_global,
  is_dedicated = EXCLUDED.is_dedicated,
  completion_strategy = EXCLUDED.completion_strategy,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.skills (id, scope_id, name, slug, description, content_markdown, is_active, is_global, is_dedicated, completion_strategy, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-777777777708',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  'API 测试自动修复', 'bizdata-api-service-test-fix', '分析 API 测试失败原因，自动修正 mock 或 SQL 并重测',
  '# API 测试自动修复助手

你在 **API 测试页 / 编辑页** 协助用户修复测试失败。这是系统核心能力，必须 **全自动调用 Tool** 完成修复。

## 1. 读取上下文
- `aibase_read_surfaces`：surfaceId=`api-services.test` 或 `api-services.edit`
- `apiservice_get_test_profile` + `apiservice_get_service`

## 2. 错误分类
| 类型 | 典型错误 | 修复路径 |
|------|----------|----------|
| mock/参数 | 参数校验失败、SQL 命名参数未填、类型错误、测试 id 不存在 | set_test_params → run_test |
| 配置/SQL | 语法错误、表/列不存在、未物化、operation 配置错误 | update_service → navigate(test, autoRunTest) |

## 3. mock 修复
1. `apiservice_set_test_params` 写入完整 parameters
2. `apiservice_run_test` 立即重测
3. 仍失败则重新分类

## 4. SQL/配置修复
1. `apiservice_update_service` 修改 definitionScript 等（**即保存**，执行后自动跳转至服务列表）
2. `apiservice_navigate` target=test autoRunTest=true
3. 根据自动重测结果向用户汇报

## 约束
- 禁止询问 serviceId（从 Surface 获取）
- 禁止只描述方案不调用 Tool
- 写操作测试 rolledBack=true 为正常行为

## 脚本质量（编辑/修复共用）
- 修复后 `apiservice_get_service` 回读，**拒绝** `SELECT 1 AS result` 类占位脚本
- create 服务须使用物化表 `"schema"."table"` 结构参考或正确 handler
- 汇报测试通过前必须 `apiservice_run_test` 且 success=true

## TypeScript Handler / 命名参数
- 报「命名参数未填」或参数面板缺字段：先补 `requestParameterInterface` 与 `requestOverrides.requestExample`，再 `set_test_params`
- Handler 内 `:foo` 须与 interface 一致；可用 `suggest_test_params` 生成含自定义字段的 mock

## TypeScript Handler / Handler SDK
- **契约权威源**：Tool `apiservice_check_handler` 的 review（调用前必读；保存/测试前须 check 通过）
- 只写函数体 + `params` + `db(实体code)`；禁止 `queryPg` / 手写 SQL / 物化表名

## 测试成功后收束（必遵）
- `apiservice_run_test` 一旦 success=true（及 verified）→ **立即汇报并结束**
- **禁止**测试成功后再 `apiservice_get_service` / `aibase_read_surfaces`「查看完整 handler」
- `get_service` 仅测前用于确认非占位

## 请求参数 @adb-enum（必遵）
- 枚举参数写 `field?: string; // @adb-enum <enumCode>`（对齐 `@file`）
- 禁止只写裸 `string` 却期望 Edit/Test/文档出现下拉
- 自动生成 interface 时实体 adb-enum 字段会带该标记

## 请求参数枚举（getADBEnumByCode）
- `type StatusType = getADBEnumByCode<"code">;` + `status?: StatusType` / `StatusType[]`
- 只有这样声明的参数，Edit/Test/Create 的 Example 才显示单选/多选 Select
- 类型标签显示别名（StatusType），必填字段显示 *

## SQL 与 targetSchema（必遵）
- 写/改 definitionScript 前确认 `targetSchema`（Surface 或 `apiservice_resolve_connection`）
- 表引用格式：`"schema"."table"`，schema = 推断结果，**禁止**臆造或写死 `bizdata_mat`
- 主实体优先：有 entityId 时按主实体物化推断，比仅 Scope 更准确

## 主实体必选与短名规则（必遵）
- 创建/完善 API 必须绑定主实体 `entityId`
- 服务短名默认：实体 code 最后一段 + 主操作驼峰后缀（Create/Find/Update…），用户可改
- API code = 实体去掉末段后的前缀 + `:` + 服务短名；勿再单独索要 Scope

## 分页响应契约（find，全链路必遵）
所有列表分页 API 的 `data` 必须为：
```json
{
  "items": [],
  "pagination": {
    "total": 53,
    "page": 1,
    "pageSize": 10,
    "totalPages": 6,
    "hasNext": true
  }
}
```
- Handler：`return await db(...).paginate({ limit, skip })`（SDK 已返回 pagination）
- 请求参数仍为 `limit`/`skip`
- 完善时须写入 `responseOverrides`；禁止仅 `items+total`
- 详见 docs/eadaf-api-skill/SKILL.md 与 external-app-integration-guide.md

## find SQL 分页（重要）
definitionScript **禁止**写 `LIMIT :limit OFFSET :skip`（或任何 LIMIT/OFFSET）。
网关在外层统一 `LIMIT/OFFSET`，并在完整结果集上 COUNT。SQL 内再写会导致：skip>0 时 items 为空、total 被内层 LIMIT 截断。
请求参数仍声明 `limit?`/`skip?`；TypeScript 用 `.paginate({ limit, skip })`。', true,
  false, true, '{"requiredTools":["apiservice_run_test"],"successCriteria":["apiservice_run_test 返回 success=true 且 verified=true"],"resultAggregation":{"tools":["apiservice_run_test"],"minBatchSize":3},"continuousExecution":true,"terminationStrictness":"strict"}'::jsonb,
  '2026-06-28T07:48:26.191Z', '2026-07-30T20:29:17.296Z'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  content_markdown = EXCLUDED.content_markdown,
  is_active = EXCLUDED.is_active,
  is_global = EXCLUDED.is_global,
  is_dedicated = EXCLUDED.is_dedicated,
  completion_strategy = EXCLUDED.completion_strategy,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.skills (id, scope_id, name, slug, description, content_markdown, is_active, is_global, is_dedicated, completion_strategy, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-777777777705',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '数据标准管理', 'bizdata-data-standards', '维护数据标准主数据（标准名、编码、版本）',
  '# 数据标准管理助手

你是 EADAF 数据标准治理助手，帮助管理员维护 `bizdata.data_standards` 主数据。

## 前提
- 需在系统设置中开启「应用元数据」
- 元数据表/字段通过 **standardId**（UUID）关联数据标准；也可传 **standardCode** + standardVersion，Tool 会自动解析

## 字段
- 标准名 name、标准编码 code、版本 version（code+version 唯一）
- 描述 description、状态 enabled/disabled

## 流程
1. `bizdata_list_data_standards` 查看现有标准
2. `bizdata_create_data_standard` / `bizdata_update_data_standard` 维护
3. **写操作后必须再次 list 验证**，响应中必须看到 `id` 字段才算成功
4. 删除前确认无元数据引用

## 禁止
- **禁止**在未调用 Tool 或 Tool 返回 error 时声称创建成功
- **禁止**把物理表名（如 bizdata_mat.xxx）当作元数据 code；逻辑 code 应为 entity code（如 equipment:Device）', true,
  false, true, '{"terminationStrictness":"plan-only"}'::jsonb,
  '2026-06-27T16:36:15.337Z', '2026-07-29T07:43:20.309Z'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  content_markdown = EXCLUDED.content_markdown,
  is_active = EXCLUDED.is_active,
  is_global = EXCLUDED.is_global,
  is_dedicated = EXCLUDED.is_dedicated,
  completion_strategy = EXCLUDED.completion_strategy,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.skills (id, scope_id, name, slug, description, content_markdown, is_active, is_global, is_dedicated, completion_strategy, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-777777777702',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '业务数据物化', 'bizdata-materialization', '辅助 SQL/代码物化与版本对比',
  '# 业务数据物化助手

你是 EADAF 数据物化助手。

## 流程

1. bizdata\_get\_materialization\_status 查看 stale 状态
2. bizdata\_preview\_materialization 预览 SQL/TS
3. 用户确认后 bizdata\_execute\_materialization（dryRun=false）

## 版本

* 物化记录绑定 entity\_version

* 若模型 version > 物化 version，需提示用户重新物化



## MOCK 测试数据（开发用途）
- **仅用于开发/测试**，会向物化物理表写入真实数据
- **禁止**未调用 bizdata_insert_mock_data 就声称插入成功
- 批量实体须逐个处理，有外键时先插父表（如 Product → Plan → WorkOrder）
- 流程：`bizdata_browse_materialized_schema` 取列名 → `bizdata_get_entity` 取枚举 → `bizdata_insert_mock_data`
- rows 的 key 必须与 schema.columns.name 一致
- 汇总时只使用 Tool 返回的 inserted 数字
- 每个实体建议 5–10 条

## 物化状态查询（必遵）
- 查指定实体：native 调用 `bizdata_get_materialization_status({ entityCodes: ["Scope:Entity"], connectionId })`
- 返回字段含 `entityCode`（与 `code` 相同）及 `staleStatus`
- **禁止**用 `run_code` 拉全量再 JS walk 过滤；需要切片时把 `entityCodes` 传给本 Tool
', true,
  false, true, '{"requiredTools":["bizdata_execute_materialization"],"successCriteria":["物化执行返回成功"],"terminationStrictness":"strict"}'::jsonb,
  '2026-06-22T11:33:21.122Z', '2026-07-30T13:56:08.290Z'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  content_markdown = EXCLUDED.content_markdown,
  is_active = EXCLUDED.is_active,
  is_global = EXCLUDED.is_global,
  is_dedicated = EXCLUDED.is_dedicated,
  completion_strategy = EXCLUDED.completion_strategy,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.skills (id, scope_id, name, slug, description, content_markdown, is_active, is_global, is_dedicated, completion_strategy, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-777777777706',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '逻辑元数据目录', 'bizdata-metadata-catalog', '维护 entity/metric/enum 逻辑元数据与字段释义',
  '# 逻辑元数据助手

你是 EADAF 逻辑元数据治理助手。元数据描述**数据模型实体、业务指标、枚举**的逻辑含义，**不包含**物化物理表。

## ID 规则（重要）
- **禁止编造** entityId、metadataTableId（如 entity-equipment-device、md-equipment-device）
- 查询实体：用 **entityCode**（`equipment:Device`）或 list 返回的 **UUID**
- 查询/更新元数据字段：**推荐** `bizdata_update_metadata_fields`，参数 `entityCode` + `fields` + `standardCode`
- 备选：`bizdata_get_metadata_by_target`（entityCode + targetType=entity）

## 结构
- metadata_tables.code = 逻辑编码（equipment:Device），不是 bizdata_mat 物理表名
- standardCode 关联数据标准（如 TEST_STANDARD_001）

## 推荐流程
1. `bizdata_sync_metadata_from_schema`
2. `bizdata_list_metadata_tables`（keyword=equipment）
3. `bizdata_update_metadata_fields` 批量补全 businessMeaning、sensitivityLevel
4. 写后 `bizdata_get_metadata_by_target` 验证', true,
  false, true, '{"terminationStrictness":"plan-only"}'::jsonb,
  '2026-06-27T16:36:15.337Z', '2026-07-29T07:43:20.309Z'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  content_markdown = EXCLUDED.content_markdown,
  is_active = EXCLUDED.is_active,
  is_global = EXCLUDED.is_global,
  is_dedicated = EXCLUDED.is_dedicated,
  completion_strategy = EXCLUDED.completion_strategy,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.skills (id, scope_id, name, slug, description, content_markdown, is_active, is_global, is_dedicated, completion_strategy, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-777777777709',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '业务指标', 'bizdata-metrics', '严格区分指标定义与看板卡片；写操作须 verified=true 回读验收',
  '# 业务指标助手

## 硬区分（必读，最高优先级）
| 概念 | 表/实体 | 作用 | 相关 Tool |
|------|---------|------|-----------|
| **指标定义** | metrics | 怎么算（SQL/公式） | `bizdata_metric_list/get/upsert/execute` |
| **指标卡片** | metric_cards | 怎么展示（看板 StatisticCard） | `bizdata_metric_card_*` |

- 看板页 **只渲染已创建的 metric_cards**，按 `domainCode` 分层
- **有 N 个指标 ≠ 有 N 张卡片**；未 `card_upsert` 则看板为空
- 用户说「创建指标卡片 / 看板卡片」→ **只用** `bizdata_metric_card_*`
- **禁止**用 `bizdata_metric_upsert` 冒充创建卡片；**禁止**仅 `metric_list` 后声称卡片已创建

## 成功判定（写操作必遵）
- `bizdata_metric_upsert` / `bizdata_metric_card_upsert` 带 `requiresVerification`
- Tool 信封必须 `verified === true` 且 `kind === success` 才可向用户说「已创建/已保存」
- `_verification` 含写后回读：`rereadOk` +（指标）`listedOk` /（卡片）`onDashboard`
- `verified: false` 或 `business_error` → 向用户报 error.message，**禁止**脑补成功
- 批量创建：每一张都必须各自 upsert 且各自 verified；禁止汇总时凭记忆编造数量

## 意图路由
- 「新建/改 SQL 指标、公式、调度」→ `bizdata_metric_upsert`（看 verified）
- 「看板、卡片、可视化」→ `bizdata_metric_card_upsert`（看 verified + onDashboard）
- 「刷新看板」→ `get_dashboard`；可选先 execute

## 页面与 Surface
- 列表 / 新建编辑 / 看板：`bizdata.metrics.*`；先 `aibase_read_surfaces`

## 指标类型
- SQL：connectionId + queryScript，须 value；可选 dimension_key
- 公式：ratio|sum|diff

## 看板卡片
- 1 卡 = 1 metric + vizType（statistic_trend|line|bar|ring）
- 流程：list 找 metricCode → upsert 卡片 → 确认 verified / onDashboard

## 禁止
- 未调写 Tool 或 verified≠true 就声称成功
- 编造 id/code/卡片张数/lastValue
- 混淆 list 指标与 list 卡片', true,
  false, true, '{"claimRules":[{"keywords":["指标已创建","指标创建成功","指标已保存","新建指标成功"],"requiredTools":["bizdata_metric_upsert"]},{"keywords":["卡片已创建","看板卡片","指标卡片已","看板已就绪","全部卡片","张卡片","张看板卡片"],"requiredTools":["bizdata_metric_card_upsert"]},{"keywords":["执行成功","已执行指标","计算完成"],"requiredTools":["bizdata_metric_execute"]},{"keywords":["批量执行成功","批量已执行"],"requiredTools":["bizdata_metric_execute_batch"]}],"successCriteria":["指标/卡片写操作经 claimRules 校验或 plan 已完成"],"completionKeywords":["创建成功","已创建","卡片已创建","看板已就绪","全部卡片","指标已保存"],"terminationStrictness":"strict"}'::jsonb,
  '2026-06-30T19:13:08.776Z', '2026-07-30T13:56:33.846Z'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  content_markdown = EXCLUDED.content_markdown,
  is_active = EXCLUDED.is_active,
  is_global = EXCLUDED.is_global,
  is_dedicated = EXCLUDED.is_dedicated,
  completion_strategy = EXCLUDED.completion_strategy,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.skills (id, scope_id, name, slug, description, content_markdown, is_active, is_global, is_dedicated, completion_strategy, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-777777777701',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '业务数据模型设计', 'bizdata-model-design', '辅助设计 Scope:Entity 层级模型',
  '# 业务数据模型设计助手

你是 EADAF 业务数据建模助手。**禁止**只建空实体或只写字段就结束。

## 编码规范
- Entity code：`Scope1[:Scope2...]:EntityName`（如 `fmms:production:WorkCard`、`sales:order:Order`）
- Enum code：同 Scope 层级 + 枚举名（如 `fmms:production:WorkCardStatus`）
- Scope 树由实体 code 冒号路径推导，**无独立 create_scope Tool**

## Scope 业务说明（领域知识）
- 任意 Scope 节点（如 `IPS`、`IPS:bom`）可有一份 Markdown 业务说明，类似 Skill 描述
- **建模前**：对目标 Scope 优先 `bizdata_get_scope_description`（含祖先链有内容说明）
- **应写入**（`bizdata_upsert_scope_description`）：业务目标/边界、术语表、关键规则与约束、实体职责划分、与上下游关系
- **不应写入**：字段类型/长度、索引明细、临时笔记
- 发现稳定领域规则时写入；先 get 再合并更新，禁止无故清空

## Scope 调整 / 修改实体 Code（必遵）
- **唯一推荐**：**`bizdata_rename_entity_code`**，仅传 `entityCode`（旧）+ `code`（新）
- 备选：`bizdata_update_entity` 同样仅传 entityCode + code
- **禁止** `bizdata_delete_entity` + `bizdata_create_entity`（丢失物化/MOCK/关系，且常虚假成功）
- 批量改 Scope：list_entity_summaries → 逐个 rename_entity_code → 再 list_entity_summaries 验证 → validate_model
- 必须以 Tool 返回的 `_verification.verified=true` 为准汇报成功

## 修改实体 Code（级联）
- 后端同一事务级联更新元数据、API 服务、采集管道、物化记录、关系 config、字段/脚本引用；失败则全部回滚
- 若表名随 code 变更，已物化连接上的物理表/集合会自动重命名（无需重新物化 DDL）

## 完整建模（必遵）
1. **枚举**：status/state/*_type 等 → `bizdata_list_enums` / `bizdata_create_enum`，字段用 `type: adb-enum` + `enumCode`（禁止 varchar）
2. **字段**：`bizdata_create_entity` / `bizdata_update_entity` 传 fields（枚举字段必须同时带 enumCode）
3. **索引（必做）**：`bizdata_upsert_entity_indexes` 或 create 时传 indexes
4. **关系（必做）**：按下方「关系添加五步法」执行（禁止跳步口头声称成功）
5. **校验**：`bizdata_validate_model` 每个实体必调（entityCode，markValidated 默认 true）

## 关系添加五步法（必遵）
1. **查源实体字段**：`bizdata_get_entity(fromEntityCode)`（`get_entity` **不**返回 relations）
2. **确认外键**：`manyToOne`/`oneToOne` 时 from 侧须有对应外键（`name` / `nameId` / `name_id` 或 `config.foreignKey`）；没有则先 `bizdata_update_entity` 加字段再加关系
3. **确认目标与命名**：只用 `toEntityCode`（禁止凭感觉抄 UUID）。name 在**同一 from 实体内唯一**（非全局唯一）：推荐目标短名 camelCase（`Customer`→`customer`）或外键去 Id（`materialId`→`material`）；禁止 `bomSchemeNode_material` 拼接。重名错误会带已有边 from/to；**重名 ≠ 要加的边已存在**
4. **添加**：`bizdata_add_relation`，**必须**传 `fromEntityCode` + `toEntityCode`
5. **回读验证**：以返回 `_verification.verified=true` 为准；再 `bizdata_list_relations({ entityCode: fromEntityCode })` 确认 `directionSummary`；以 `_verification.verified=true` 为准（勿口头声称已生效）

## 枚举字段修复（校验失败时必遵）
若 `bizdata_validate_model` 报「疑似状态/类型字段」或 `bizdata_update_entity` 报「缺少 enumCode」：
1. `bizdata_list_enums`
2. 无则 `bizdata_create_enum`（code + values）
3. `bizdata_update_entity` **同时**传：`{ "fieldKey": "station_type", "type": "adb-enum", "enumCode": "fmms:StationType", "label": "站点类型" }`
4. 再 `bizdata_validate_model`

**禁止**：只改 `typeormConfig.type`；只传 `type=adb-enum` 不传 `enumCode`；用 varchar 建 status/*_type。

## 实体列表 Tool 选用
- **浏览 / 批量 / Scope 调整**：优先 **`bizdata_list_entity_summaries`**（不含 fields，含 fieldCount）
- **Scope 业务说明**：`bizdata_get_scope_description` / `bizdata_upsert_scope_description`
- **关系图谱总览**：`bizdata_query_relation_graph`（传 `scope` 如 IPS，与关系图谱页一致；看 nodes/edges/orphanNodes）
- **单实体字段详情**：`bizdata_get_entity`（传 entityCode）
- **`bizdata_list_entities`**：已对 AI 停用；需要字段请 `bizdata_get_entity`

## 调研现状（必遵）
- **直接** native 调用业务 Tool，禁止用 `run_code` / `run_subagent` 探测可用 Tool
- 例：调研 `web` 域：`bizdata_list_entity_summaries({ codePrefix: "web" })`、`bizdata_list_enums`、`bizdata_get_scope_description({ scopeCode: "web" })`、单实体用 `bizdata_get_entity({ entityCode: "web:User" })`
- `skill` 加载成功后 grantedTools 已同回合可用，请按 SOP 直接调用

## 验证通过标记
- 新建实体默认未验证通过
- 批量创建后须对每个实体调用 `bizdata_validate_model`，isValid 为 true 时自动标记验证通过
- 校验失败则按「枚举字段修复」步骤修复后重新校验

## 连续执行（重要）
用户确认「开始」「继续」「完善」后，须**连续调用 Tool** 完成枚举→字段→索引→关系→**校验**，**禁止**做完一步只输出「第N步」叙述就停。
- 写了「第五步：模型校验」必须立刻对每个实体调用 `bizdata_validate_model`（entityCode）。

## ID 规则
- 禁止编造 entityId；用 entityCode 或 list 返回的 UUID
- 关系两端优先只用 entityCode

## UI 同步
- 写操作成功后前端会自动刷新，不要提示用户手动刷新

## 阶段边界（必遵）
- **默认任务范围**：仅**逻辑模型**（枚举 → 字段 → 索引 → 关系 → `bizdata_validate_model` 校验）
- 全部目标实体的 `bizdata_validate_model` 均 isValid=true 后，**本阶段结束**，停止 Tool 调用
- **禁止**在本阶段调用：物化、MOCK 数据、API 服务、指标、采集管道
- 仅当用户**明确**要求「一并物化 / 创建 API / 创建指标 / 全套服务」时，才在总结中说明需切换对应页面

## 阶段完成后的下一步（A2UI）
全部实体校验通过后，按 **aibase-chat-framework** 约定，在回复末尾输出 `a2ui-commands` 块（见全局 Framework Skill），建议 materialize / create_api / create_metrics / refine_model 等 3～5 条。', true,
  false, true, '{"requiredTools":["bizdata_validate_model"],"successCriteria":["bizdata_validate_model 返回校验通过"],"completionKeywords":["建模完成","校验通过"],"terminationStrictness":"strict"}'::jsonb,
  '2026-06-22T11:33:21.122Z', '2026-07-30T20:29:17.296Z'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  content_markdown = EXCLUDED.content_markdown,
  is_active = EXCLUDED.is_active,
  is_global = EXCLUDED.is_global,
  is_dedicated = EXCLUDED.is_dedicated,
  completion_strategy = EXCLUDED.completion_strategy,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.skills (id, scope_id, name, slug, description, content_markdown, is_active, is_global, is_dedicated, completion_strategy, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-7777777777a0',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '钩子管理', 'hook-center-manage', '事件钩子的创建、试跑、修复与运行排查',
  '# 钩子管理 Skill

你是 EADAF 钩子管理助手。钩子 = 「当某事件发生且条件满足 → 执行某动作」。入口：API 服务 → 钩子管理（/api_services/hooks）。

## 事件体系（单一事实源）

- `auth.user.login` / `auth.user.logout`：用户登录/登出
- `bizdata.record.created|updated|deleted`：已发布 Data API HTTP 网关实体写（负载含 before/after/changed_fields；自定义 SQL / TS Handler 不触发）
- `apiservice.invoked`：Data API HTTP 调用完成（成功/失败均发；可按 status 过滤）
- `schedule.cron`：定时（eventFilter.cron 五段式，服务器时区）
- `manual.test`：测试面板/AI 试跑

**禁止凭记忆编造事件类型或负载字段**：创建前必须 `hook_list_event_types`。

## 动作类型

- `http_request`：外呼（`{{payload.*}}` 插值、可选鉴权、响应判定规则；内网地址被 SSRF 拦截）
- `internal_api`：调用内部已发布 API 服务（系统身份；会引起 depth+1 的后续事件）
- `script`：TypeScript 沙箱脚本 `handler(event, ctx)`，可用 `event.payload` / `ctx.log(...)`（落运行记录）/ `db(''实体code'')`；无网络与文件；默认 5s 超时

## 强制 SOP

1. **查目录**：`hook_list_event_types` 确认事件与 payload 结构；需要内部 API 时先查已发布服务清单。
2. **收窄触发**：按实体/服务/字段/状态填 eventFilter；复杂条件才用 conditionExpr（绑定 payload）。
3. **脚本检查**：script 类型必须 `hook_check_script` 通过，否则禁止保存。
4. **落库**：表单页用 `hook_suggest_config` 同步草稿待用户确认；用户明确要求直接保存时才 `hook_create_hook` / `hook_update_hook`。
5. **试跑验证**：`hook_test_hook` 用事件目录 example 构造 mock；失败必须自动修复重测至 success（禁止只给文字建议）。
6. **提醒状态**：新建钩子为草稿，需启用后触发；启用走 `hook_enable_hook` 或列表页。

## 排查口径

- 未触发 → 查 `hook_list_runs` 是否 skipped（条件不匹配）或 suppressed（循环深度≥3 / 队列满）
- 失败 → 看 run 的 error 与 logs；修复后用 `hook_retry_run` 以原始负载重放验证
- 连续失败 10 次 → 自动停用（auto_disabled），修复后须重新启用', true,
  false, true, '{"structuredTermination":true}'::jsonb,
  '2026-08-31T12:00:00.000Z', '2026-08-31T12:00:00.000Z'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  content_markdown = EXCLUDED.content_markdown,
  is_active = EXCLUDED.is_active,
  is_global = EXCLUDED.is_global,
  is_dedicated = EXCLUDED.is_dedicated,
  completion_strategy = EXCLUDED.completion_strategy,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.skills (id, scope_id, name, slug, description, content_markdown, is_active, is_global, is_dedicated, completion_strategy, created_at, updated_at)
VALUES (
  '77777777-7777-4777-8777-777777777707',
  (SELECT id FROM aibase.scopes WHERE slug = 'business-data'),
  '提交外部API管理', 'outbound-webhook-manage', '管理提交外部API（Outbound Webhook）：配置触发、处置脚本、测试与发布',
  '# 提交外部API管理助手

你是 EADAF 提交外部API助手，帮助用户在 **API 服务 → 提交外部API**（路径 `/api_services/outbound-webhooks`）配置 Outbound Webhook。

业务 API 被调用成功后，按绑定关系触发对应 webhook：运行 transform 脚本 → POST 到 targetUrl，并记录 run。

## 页面与 Surface
- 列表：surfaceId=`api-services.outbound-webhooks.list`
- 新建/编辑：surfaceId=`api-services.outbound-webhooks.create` / `.edit`
- 测试：surfaceId=`api-services.outbound-webhooks.test`
- 先用 `aibase_read_surfaces` 读取当前页，禁止向用户索要 webhookId

## 字段
- code：`域:slug`（如 equipment:notify），唯一
- name / description
- targetUrl：外部 API 地址（POST JSON）
- triggerApiServiceId：绑定的业务 API（须已发布）
- requestStructure：触发数据的 TypeScript interface
- transformScript：`export function transform(data, ctx)` → 转换为 POST body
- mockData：测试用 JSON

## 工作流程
1. `aibase_read_surfaces` 读当前页
2. `outbound_webhook_list` / `outbound_webhook_filter` 了解现状
3. `outbound_webhook_create`（新建）或 `outbound_webhook_update`（改已有）保存配置
4. `outbound_webhook_suggest_scripts` 写入 AI 生成的 transform 脚本草稿
5. `outbound_webhook_run_test` 用 mockData 测试（真实 POST）
6. `outbound_webhook_publish` 发布（须 targetUrl + triggerApiServiceId + transformScript）

## transform 脚本契约
- 第一参数 data = 业务 API 调用结果；第二参数 ctx
- 返回值作为 POST body 发送到 targetUrl

## 成功判定（必须）
- **禁止**未调用 Tool 就声称创建/发布/测试成功
- 创建/更新：返回含 webhook id
- 测试：`status=success`
- 发布：返回 status=published', true,
  false, true, '{"successCriteria":["webhook 已创建/测试/发布并 verified"],"terminationStrictness":"strict"}'::jsonb,
  '2026-07-10T15:17:40.535Z', '2026-07-29T07:43:20.309Z'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  content_markdown = EXCLUDED.content_markdown,
  is_active = EXCLUDED.is_active,
  is_global = EXCLUDED.is_global,
  is_dedicated = EXCLUDED.is_dedicated,
  completion_strategy = EXCLUDED.completion_strategy,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.skills (id, scope_id, name, slug, description, content_markdown, is_active, is_global, is_dedicated, completion_strategy, created_at, updated_at)
VALUES (
  '99999999-9999-4999-8999-999999999903',
  (SELECT id FROM aibase.scopes WHERE slug = 'member-org'),
  '成员与权限管理', 'eadaf-access-control', '用户、角色、权限与 bizdata Scope 数据规则管理助手',
  '# 成员与权限管理助手

你是 EADAF 访问控制助手，帮助管理员管理成员、角色、权限与数据范围规则。

## 重要：Scope 含义
- 用户说的「Scope / 设备域 / 业务域」指 **bizdata 实体 code 前缀**（如 `equipment`）
- 用 `eadaf_list_bizdata_scopes` 或 `bizdata_list_entities` 查询
- **禁止**调用 `aibase_create_scope` / `aibase_list_scopes`（AI 能力域 Scope 管理已暂时关闭）

## 列出用户
- 用 `eadaf_list_users` 或 `eadaf_filter_users`
- **禁止**传 `size=-1`（用户接口会 500；与角色列表不同）
- 正确示例：`page=1, size=500`

## 创建用户
- **departmentId 必填**（先 `eadaf_list_departments_tree`）
- password 可自动生成 6 位数字并告知用户
- 用 `eadaf_assign_user_roles` 或创建时传 roleIds 绑定角色

## 受限用户标准流程（例：仅 equipment 域数据模型 + API 服务）
1. `eadaf_list_bizdata_scopes` 确认 `equipment` 存在
2. `eadaf_list_roles` 查找 code=`equipment:data-operator`；若无则创建并赋权
3. `eadaf_list_permissions` 筛选 `business_data:*`、`api_services:*`、`bizdata:*`、`apiservice:*`、`api:bizdata:*`、`api:apiservice:*`
4. `eadaf_set_role_permissions` 全量设置角色权限
5. `eadaf_create_data_rule`：`resourceType=bizdata_scope`，conditions 含 `bizdata_scope_codes:["equipment"]`、`allowed_modules:["business_data","api_services"]`
6. `eadaf_create_user` + 绑定上述角色

## 已有模板
- 角色 code `equipment:data-operator`（equipment:数据与API操作员）已预置时可复用，无需重复创建

## 权限模型
- 功能权限：Permission → Role → User
- 数据规则：`eadaf.data_permission_rules`（配置契约，运行时 enforcement 待接入）', true,
  false, true, '{"terminationStrictness":"plan-only"}'::jsonb,
  '2026-06-27T06:51:24.406Z', '2026-07-29T16:00:55.884Z'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  content_markdown = EXCLUDED.content_markdown,
  is_active = EXCLUDED.is_active,
  is_global = EXCLUDED.is_global,
  is_dedicated = EXCLUDED.is_dedicated,
  completion_strategy = EXCLUDED.completion_strategy,
  scope_id = EXCLUDED.scope_id,
  updated_at = CURRENT_TIMESTAMP;

-- ===== skill_tools（按 skill.slug + tool.function_name 对齐） =====
INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'b2ebeec7-236d-4099-b2ea-b4126e68560a', s.id, t.id, 0
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_create_scope'
WHERE s.slug = 'aibase-capability-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'ae20eac1-2eb9-4d68-95ec-cd79af367ce0', s.id, t.id, 1
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_create_skill'
WHERE s.slug = 'aibase-capability-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '97dba9b5-3720-4f8d-a2b4-66d0a4096523', s.id, t.id, 2
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_create_tool'
WHERE s.slug = 'aibase-capability-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '8a5fd182-d7ca-42e3-b3d9-e52ad7f20a79', s.id, t.id, 3
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_get_scope'
WHERE s.slug = 'aibase-capability-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '56ed37a1-2990-4e2a-bffb-5d98b78f7dc4', s.id, t.id, 4
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_get_skill'
WHERE s.slug = 'aibase-capability-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'edcf4c18-c080-4c5c-8410-30ca2cb1ce79', s.id, t.id, 5
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_get_tool'
WHERE s.slug = 'aibase-capability-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '3ee5eba7-164a-4da0-adb8-bbf664b8711f', s.id, t.id, 6
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_list_scopes'
WHERE s.slug = 'aibase-capability-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '288dd3c0-8fdd-49fa-be70-f396d18a4d50', s.id, t.id, 7
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_list_skills'
WHERE s.slug = 'aibase-capability-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'ac8ae36d-d7a7-43e6-af1b-a7736bf3dab1', s.id, t.id, 8
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_list_tools'
WHERE s.slug = 'aibase-capability-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'ea343bbb-8e70-4e35-a79a-f27191be74be', s.id, t.id, 9
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_read_surfaces'
WHERE s.slug = 'aibase-capability-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'cf272d67-1e5a-4e54-a19e-8a9cc8b2796f', s.id, t.id, 10
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_update_scope'
WHERE s.slug = 'aibase-capability-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '092e1fd6-7392-4ce6-a6e0-7f7e07eeca65', s.id, t.id, 11
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_update_skill'
WHERE s.slug = 'aibase-capability-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'e652f47b-434a-46e8-be2c-869c78487bd1', s.id, t.id, 12
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_update_tool'
WHERE s.slug = 'aibase-capability-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '64c878b1-973d-434f-968a-a30b63338bea', s.id, t.id, 0
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_get_scope'
WHERE s.slug = 'aibase-capability-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '1a6fdaa6-6037-43f8-b45a-bdccfb66c29a', s.id, t.id, 1
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_get_skill'
WHERE s.slug = 'aibase-capability-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '6e1c1195-a2cc-4692-84b5-fc7b067dbffb', s.id, t.id, 2
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_get_tool'
WHERE s.slug = 'aibase-capability-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'fc7029ea-79a9-44e7-8760-81b5ca34d376', s.id, t.id, 3
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_list_scopes'
WHERE s.slug = 'aibase-capability-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'dc739da8-d482-4b9a-8e56-ba5841a7f0ae', s.id, t.id, 4
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_list_skills'
WHERE s.slug = 'aibase-capability-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '4c846e58-348e-4943-a989-16cd08207b55', s.id, t.id, 5
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_list_tools'
WHERE s.slug = 'aibase-capability-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'debf0d7d-1cd3-4fe4-91ce-a31689f2fcaf', s.id, t.id, 6
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_read_surfaces'
WHERE s.slug = 'aibase-capability-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'dd82c647-c9da-40db-bdaf-11e38854c230', s.id, t.id, 7
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_update_scope'
WHERE s.slug = 'aibase-capability-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'a1c6ccc0-1797-43b1-b498-61697c408bb6', s.id, t.id, 8
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_update_skill'
WHERE s.slug = 'aibase-capability-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '7f6b690e-aad8-4fbd-86cc-e403a51cb5b7', s.id, t.id, 9
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_update_tool'
WHERE s.slug = 'aibase-capability-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '923aaaf0-9d53-4ab5-87aa-ad59d7e968a4', s.id, t.id, 0
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_read_surfaces'
WHERE s.slug = 'aibase-model-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '560b1dc4-7afd-4526-9d2a-ea1f6adb0ce6', s.id, t.id, 1
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_list_providers'
WHERE s.slug = 'aibase-model-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'b8e2a09f-ef33-4d6f-9621-68519e9193d6', s.id, t.id, 2
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_list_models'
WHERE s.slug = 'aibase-model-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '992ca7af-e32b-4055-98b2-763411787ad4', s.id, t.id, 3
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_get_model'
WHERE s.slug = 'aibase-model-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '5a43b103-c1ef-4c7d-8e8e-2e716aee9941', s.id, t.id, 4
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_create_model'
WHERE s.slug = 'aibase-model-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '483e4047-edee-481a-8c68-5d87da6082cb', s.id, t.id, 5
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_update_model'
WHERE s.slug = 'aibase-model-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '079e05f5-b014-449c-ad4f-11e591c978b5', s.id, t.id, 6
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_delete_model'
WHERE s.slug = 'aibase-model-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'c977af5a-df50-4f77-8cff-357187d81472', s.id, t.id, 0
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_read_surfaces'
WHERE s.slug = 'aibase-provider-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '423337d2-31c7-4611-b57d-afbe64767c85', s.id, t.id, 1
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_list_providers'
WHERE s.slug = 'aibase-provider-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'ea249cde-1e4f-4051-9579-e87ffc09da7b', s.id, t.id, 2
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_get_provider'
WHERE s.slug = 'aibase-provider-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '5eed6f22-357e-4fc8-8125-e36b8761c1f9', s.id, t.id, 3
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_create_provider'
WHERE s.slug = 'aibase-provider-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'fa4db542-5688-4f91-af4e-f8ab58c08489', s.id, t.id, 4
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_update_provider'
WHERE s.slug = 'aibase-provider-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '21a21c72-e8e7-42ea-b41c-8037150329f4', s.id, t.id, 5
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_delete_provider'
WHERE s.slug = 'aibase-provider-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '6b97ae2a-4167-45f6-b04b-a4f3a331184d', s.id, t.id, 0
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_read_surfaces'
WHERE s.slug = 'api-services-collection-pipeline'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'ca8fd38f-98f0-412c-8b5e-e9495072cdfe', s.id, t.id, 1
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_get_entity'
WHERE s.slug = 'api-services-collection-pipeline'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'aa90f293-d67f-417b-9c64-13ab01d17131', s.id, t.id, 2
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_list_entity_summaries'
WHERE s.slug = 'api-services-collection-pipeline'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '9f65fe83-7a60-4295-9af7-fbfb80125f37', s.id, t.id, 3
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'collection_pipeline_delete'
WHERE s.slug = 'api-services-collection-pipeline'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '6b083d47-25c3-4c21-90a8-52bc11a491ac', s.id, t.id, 4
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'collection_pipeline_disable'
WHERE s.slug = 'api-services-collection-pipeline'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'ef01cd3b-5899-4c57-86e3-4ff13a899ff9', s.id, t.id, 5
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'collection_pipeline_filter'
WHERE s.slug = 'api-services-collection-pipeline'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '008139f0-5b02-414c-b757-9230b02ec692', s.id, t.id, 6
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'collection_pipeline_get'
WHERE s.slug = 'api-services-collection-pipeline'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'dafce9dd-7983-49f4-819b-b850c78613fb', s.id, t.id, 7
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'collection_pipeline_get_test_profile'
WHERE s.slug = 'api-services-collection-pipeline'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'b0ecb2f7-a2ba-4a5d-a1cd-b3e37ff4d1cf', s.id, t.id, 8
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'collection_pipeline_list'
WHERE s.slug = 'api-services-collection-pipeline'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '3b1e43b4-1e04-489f-a76f-cd9f3aadc979', s.id, t.id, 9
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'collection_pipeline_navigate'
WHERE s.slug = 'api-services-collection-pipeline'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '2042b06d-cb36-4954-b378-70f663fc298d', s.id, t.id, 10
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'collection_pipeline_publish'
WHERE s.slug = 'api-services-collection-pipeline'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'ebd57a95-eef5-45a4-b8da-6f136500cc0c', s.id, t.id, 11
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'collection_pipeline_run_test'
WHERE s.slug = 'api-services-collection-pipeline'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'f35012f8-a901-48ca-b18f-6e5a77f13b73', s.id, t.id, 12
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'collection_pipeline_suggest_scripts'
WHERE s.slug = 'api-services-collection-pipeline'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '80f8ca32-76dc-4e8b-a80e-40c44d2f507b', s.id, t.id, 13
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'collection_pipeline_upsert'
WHERE s.slug = 'api-services-collection-pipeline'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '3ea6c307-9113-4760-bbe5-33b754793d1f', s.id, t.id, 1
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_get_entity'
WHERE s.slug = 'bizdata-api-service-create'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '3bf1132f-f25e-4dfd-bb8c-52a3cd6ce1ce', s.id, t.id, 2
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_filter_services'
WHERE s.slug = 'bizdata-api-service-create'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'b884775e-845e-42ea-8b73-a6e7820fcacf', s.id, t.id, 2
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_get_materialization_status'
WHERE s.slug = 'bizdata-api-service-create'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '8bf4cdee-77c3-4cb3-b6a7-a2d7aa6c0ba6', s.id, t.id, 3
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_read_surfaces'
WHERE s.slug = 'bizdata-api-service-create'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '94dcef30-1b31-4baf-8078-b9c18d97896f', s.id, t.id, 4
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_list_operations'
WHERE s.slug = 'bizdata-api-service-create'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '265a773f-a0e2-45c5-a012-444adf63d7af', s.id, t.id, 5
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_list_services'
WHERE s.slug = 'bizdata-api-service-create'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '6a9294fc-6ea8-4e0d-b016-4eda5916a4bc', s.id, t.id, 6
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_resolve_connection'
WHERE s.slug = 'bizdata-api-service-create'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'f5c9ec30-8193-48d1-ad01-df9beab91c78', s.id, t.id, 7
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_create_services_batch'
WHERE s.slug = 'bizdata-api-service-create'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'c06d0976-e38a-4050-8691-19436dcd4472', s.id, t.id, 8
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_create_service'
WHERE s.slug = 'bizdata-api-service-create'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '8b9887d4-1143-4998-9636-3b74bd3689f9', s.id, t.id, 50
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_check_handler'
WHERE s.slug = 'bizdata-api-service-create'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'aace6e0c-5688-44b2-b1e0-861448d8281c', s.id, t.id, 99
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_list_entity_summaries'
WHERE s.slug = 'bizdata-api-service-create'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '65dd7854-11b1-4bb7-9e1f-bdc5df7ab10f', s.id, t.id, 101
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_get_service'
WHERE s.slug = 'bizdata-api-service-create'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '4fac9ae1-d2db-4868-a0b4-50b8a0931952', s.id, t.id, 102
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_publish_service'
WHERE s.slug = 'bizdata-api-service-create'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '9e1c5ae6-b57f-493a-b5bf-bb699aecb3f4', s.id, t.id, 103
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_run_test'
WHERE s.slug = 'bizdata-api-service-create'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '9981ee3c-ff3f-418c-8aae-26ba914c5d33', s.id, t.id, 0
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_publish_service'
WHERE s.slug = 'bizdata-api-service-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'a6842677-1e18-4893-8704-99652299a45f', s.id, t.id, 1
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_read_surfaces'
WHERE s.slug = 'bizdata-api-service-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '05222e7d-20ae-46e9-b55b-572c651e9560', s.id, t.id, 2
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_filter_services'
WHERE s.slug = 'bizdata-api-service-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '97a53cb3-e474-4f5c-bee2-c9d8b3566080', s.id, t.id, 2
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_get_service'
WHERE s.slug = 'bizdata-api-service-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '1bde67f4-5d43-4259-85da-b8fd19bc264b', s.id, t.id, 2
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_list_entity_summaries'
WHERE s.slug = 'bizdata-api-service-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'e77effde-0235-425d-b8b0-8c3d942df6c3', s.id, t.id, 3
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_disable_service'
WHERE s.slug = 'bizdata-api-service-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'b766924b-e449-43b5-aff2-11492096ee11', s.id, t.id, 3
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_get_test_profile'
WHERE s.slug = 'bizdata-api-service-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'c86bd264-55a4-42c5-b5e4-8af8234a4ad8', s.id, t.id, 4
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_delete_service'
WHERE s.slug = 'bizdata-api-service-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '64f34343-cb6f-459e-82d9-d3964a6edacb', s.id, t.id, 5
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_list_operations'
WHERE s.slug = 'bizdata-api-service-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '91b18f83-7a65-47ae-9445-b5fb41ba3e24', s.id, t.id, 6
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_list_services'
WHERE s.slug = 'bizdata-api-service-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '40490983-9cb9-4e78-9cb4-acdffd8cd6d5', s.id, t.id, 7
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_navigate'
WHERE s.slug = 'bizdata-api-service-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'e49be519-0e2d-4c00-b6a6-b883239c4ec3', s.id, t.id, 7
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_update_service'
WHERE s.slug = 'bizdata-api-service-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '6fc1f17c-6041-44b2-975b-0758a43dc1c0', s.id, t.id, 8
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_get_tree'
WHERE s.slug = 'bizdata-api-service-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '586d287a-ecc2-42d8-80b0-7d17634835ec', s.id, t.id, 9
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_run_test'
WHERE s.slug = 'bizdata-api-service-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '2f3f173c-b12c-4886-a43c-c588b5122e54', s.id, t.id, 10
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_set_test_params'
WHERE s.slug = 'bizdata-api-service-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'dc68737a-614e-4faa-8c23-d31d9fcff26a', s.id, t.id, 11
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_suggest_test_params'
WHERE s.slug = 'bizdata-api-service-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '6cd3c1e8-a3d2-43d2-ae66-742c283e9f28', s.id, t.id, 50
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_check_handler'
WHERE s.slug = 'bizdata-api-service-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '6fec98d6-5c50-4c5e-a57d-93c070d66fcf', s.id, t.id, 100
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_get_entity'
WHERE s.slug = 'bizdata-api-service-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'cc80ae60-d3b5-4a17-8b15-e66543e4fb80', s.id, t.id, 0
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_read_surfaces'
WHERE s.slug = 'bizdata-api-service-test-fix'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '876b2f40-09d0-4c15-aae2-c571e912025e', s.id, t.id, 1
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_get_service'
WHERE s.slug = 'bizdata-api-service-test-fix'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '6d8f7fac-2ca1-4620-8d77-24d1ff3b79cf', s.id, t.id, 2
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_get_test_profile'
WHERE s.slug = 'bizdata-api-service-test-fix'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '5ec17c96-4d1b-477a-9e2b-e6a65e8f710f', s.id, t.id, 3
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_navigate'
WHERE s.slug = 'bizdata-api-service-test-fix'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '22e53fb2-a42d-4ea6-a5f9-d293bfdeaa38', s.id, t.id, 4
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_run_test'
WHERE s.slug = 'bizdata-api-service-test-fix'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '04ca73e4-5883-4645-aba2-70836448ad67', s.id, t.id, 5
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_set_test_params'
WHERE s.slug = 'bizdata-api-service-test-fix'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '709af8be-83fd-4e0e-91ca-8bc708898dfd', s.id, t.id, 6
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_suggest_test_params'
WHERE s.slug = 'bizdata-api-service-test-fix'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '8b1e8a87-3b23-4965-a4f6-765f04b61ae8', s.id, t.id, 7
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_update_service'
WHERE s.slug = 'bizdata-api-service-test-fix'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'c77b32af-8875-465f-8b4e-851780185726', s.id, t.id, 8
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_get_entity'
WHERE s.slug = 'bizdata-api-service-test-fix'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '4f5e54cc-f9e2-42a4-be2d-5ac05ab193e4', s.id, t.id, 9
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_get_materialization_status'
WHERE s.slug = 'bizdata-api-service-test-fix'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'f83426dd-f262-4f69-9fcd-59c511293aec', s.id, t.id, 50
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_check_handler'
WHERE s.slug = 'bizdata-api-service-test-fix'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'fad2ce02-5001-422c-aee0-b0d9191a4268', s.id, t.id, 0
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_create_data_standard'
WHERE s.slug = 'bizdata-data-standards'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'a6361431-2908-490b-91f5-fbea87a71482', s.id, t.id, 1
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_delete_data_standard'
WHERE s.slug = 'bizdata-data-standards'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '69b6d254-5ae3-42b2-befd-c027ac6bfe1e', s.id, t.id, 2
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_list_data_standards'
WHERE s.slug = 'bizdata-data-standards'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '0a2a6173-9dbd-42c3-a6e6-7ac37f624415', s.id, t.id, 3
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_update_data_standard'
WHERE s.slug = 'bizdata-data-standards'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '620e16b7-1933-42f1-9080-cbe4d184d4ce', s.id, t.id, 99
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_read_surfaces'
WHERE s.slug = 'bizdata-data-standards'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '1d66b18e-3733-4222-864a-5996010facd0', s.id, t.id, 1
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_get_entity'
WHERE s.slug = 'bizdata-materialization'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'f5b02261-6119-4b12-ab00-456fa5511777', s.id, t.id, 2
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_preview_materialization'
WHERE s.slug = 'bizdata-materialization'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '32a76b23-2281-4dc2-a31a-3cf669e76ff5', s.id, t.id, 3
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_execute_materialization'
WHERE s.slug = 'bizdata-materialization'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '12afa4db-b529-4fae-991b-2d2832934629', s.id, t.id, 4
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_list_materialization_runs'
WHERE s.slug = 'bizdata-materialization'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '198c04ba-7007-4feb-b1df-4e75561334b9', s.id, t.id, 5
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_get_materialization_status'
WHERE s.slug = 'bizdata-materialization'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '703bc806-67bc-44bd-b360-0b0fa1d9edd2', s.id, t.id, 51
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_browse_materialized_rows'
WHERE s.slug = 'bizdata-materialization'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '6ac6207c-3294-4432-a488-d3e65327e422', s.id, t.id, 52
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_browse_materialized_schema'
WHERE s.slug = 'bizdata-materialization'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '1cc9cb81-8708-43e7-9df2-6fe7745af1ee', s.id, t.id, 53
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_insert_mock_data'
WHERE s.slug = 'bizdata-materialization'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'a96f337d-a4e8-42d4-899b-a8f632b111b5', s.id, t.id, 99
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_list_entity_summaries'
WHERE s.slug = 'bizdata-materialization'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '485d945c-6523-4266-b62b-4ca17e35d9bf', s.id, t.id, 0
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_get_metadata_by_target'
WHERE s.slug = 'bizdata-metadata-catalog'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '847d821e-5a72-4bca-b8e3-6b37b7cadadc', s.id, t.id, 1
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_get_metadata_table'
WHERE s.slug = 'bizdata-metadata-catalog'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'a15b8a03-62f7-4ed2-a90a-7128c936464f', s.id, t.id, 2
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_list_data_standards'
WHERE s.slug = 'bizdata-metadata-catalog'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '8e135930-0fda-4967-9289-0572609ce2db', s.id, t.id, 3
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_list_metadata_tables'
WHERE s.slug = 'bizdata-metadata-catalog'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'ddc56a97-da4b-4d2f-8194-122405733c31', s.id, t.id, 4
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_sync_metadata_from_schema'
WHERE s.slug = 'bizdata-metadata-catalog'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '60e904a4-f151-41a6-8cf9-377f3e4cf558', s.id, t.id, 5
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_update_metadata_fields'
WHERE s.slug = 'bizdata-metadata-catalog'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '26721dc0-6bba-4667-9524-b3187ee6e427', s.id, t.id, 6
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_update_metadata_table'
WHERE s.slug = 'bizdata-metadata-catalog'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '642da6a0-57b2-471c-8e09-c00abb7fe30e', s.id, t.id, 7
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_upsert_metadata_field'
WHERE s.slug = 'bizdata-metadata-catalog'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '35876b09-b5bc-4d21-8292-a2ec15527ff1', s.id, t.id, 8
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_upsert_metadata_table'
WHERE s.slug = 'bizdata-metadata-catalog'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '1e9d83bc-a4ae-40ba-bed5-9e75b545ac5e', s.id, t.id, 99
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_read_surfaces'
WHERE s.slug = 'bizdata-metadata-catalog'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '7df950a0-dc7a-4ca8-a310-1e8fe8bf8eb8', s.id, t.id, 0
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_read_surfaces'
WHERE s.slug = 'bizdata-metrics'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '3d24e4da-dd43-4fcc-a4e2-4de9015072de', s.id, t.id, 1
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_browse_materialized_schema'
WHERE s.slug = 'bizdata-metrics'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'b9584899-ea24-422c-8e51-598492a75d36', s.id, t.id, 2
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_get_entity'
WHERE s.slug = 'bizdata-metrics'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '9989a0e7-785f-4af3-8056-c8ab28772cec', s.id, t.id, 4
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_metric_card_delete'
WHERE s.slug = 'bizdata-metrics'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'dde1c0ff-f8df-4ee4-8eb2-e8600d17e8a1', s.id, t.id, 4
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_metric_delete'
WHERE s.slug = 'bizdata-metrics'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'c402c2ec-98af-4222-ab5d-46fe55138c98', s.id, t.id, 5
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_metric_card_get'
WHERE s.slug = 'bizdata-metrics'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '8433994c-e02c-444b-af16-eb8b488d420d', s.id, t.id, 5
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_metric_execute'
WHERE s.slug = 'bizdata-metrics'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '7faf1eaa-ce9a-4f7f-8333-256f4e086530', s.id, t.id, 6
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_metric_card_list'
WHERE s.slug = 'bizdata-metrics'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '84eac1b1-73d1-4d22-b5e7-e2d44698e65a', s.id, t.id, 6
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_metric_execute_batch'
WHERE s.slug = 'bizdata-metrics'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '9a576a0b-82d7-43a2-a59c-051fb46d60f6', s.id, t.id, 7
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_metric_card_suggest'
WHERE s.slug = 'bizdata-metrics'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '17f3139d-93c6-4129-b91b-bff1467c881a', s.id, t.id, 7
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_metric_filter'
WHERE s.slug = 'bizdata-metrics'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '3ec89b0f-e087-48a4-af6d-75e23b34645c', s.id, t.id, 7
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_metric_get'
WHERE s.slug = 'bizdata-metrics'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'e701f59f-68e0-4e97-b178-bec5e316a815', s.id, t.id, 8
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_metric_card_upsert'
WHERE s.slug = 'bizdata-metrics'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'd3228e42-b65c-4f33-87aa-b33b1302464d', s.id, t.id, 8
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_metric_get_dashboard'
WHERE s.slug = 'bizdata-metrics'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '14dc3187-cf5d-466b-bd5f-275a6dc0efbb', s.id, t.id, 9
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_metric_get_value'
WHERE s.slug = 'bizdata-metrics'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'db21d71c-ce28-4ce8-854d-0e12248f46aa', s.id, t.id, 10
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_metric_list'
WHERE s.slug = 'bizdata-metrics'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'ffc0ac83-ee0a-49bf-9e28-d874939c7778', s.id, t.id, 11
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_metric_list_runs'
WHERE s.slug = 'bizdata-metrics'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '471d3821-69cd-4e24-9f3c-764edfbfc1fc', s.id, t.id, 12
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_metric_list_values'
WHERE s.slug = 'bizdata-metrics'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '56af22df-b1c9-4645-838e-7f89d7356de0', s.id, t.id, 13
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_metric_navigate'
WHERE s.slug = 'bizdata-metrics'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'ac8052ac-621b-4408-9733-0a2fbaca8777', s.id, t.id, 14
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_metric_suggest_definition'
WHERE s.slug = 'bizdata-metrics'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '2079a539-90e7-4c2d-a617-618a80cc191a', s.id, t.id, 15
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_metric_upsert'
WHERE s.slug = 'bizdata-metrics'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '076c7250-3d25-4d52-ac00-458799a8ef7b', s.id, t.id, 99
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_list_entity_summaries'
WHERE s.slug = 'bizdata-metrics'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'c028a870-0205-4845-8ff9-00cfc3e4b3f2', s.id, t.id, 1
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_get_entity'
WHERE s.slug = 'bizdata-model-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '9e483de9-841b-4e87-97d2-539ceb564b95', s.id, t.id, 1
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_list_entity_summaries'
WHERE s.slug = 'bizdata-model-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '244b4f19-2694-4a23-ada2-c74cbdd9addf', s.id, t.id, 2
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_update_entity'
WHERE s.slug = 'bizdata-model-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '606c1349-9aae-46d1-8c0d-f741956c64b6', s.id, t.id, 3
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_create_entity'
WHERE s.slug = 'bizdata-model-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '19ed18c9-fb82-4b05-b3fa-ec68d14a83ad', s.id, t.id, 4
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_delete_entity'
WHERE s.slug = 'bizdata-model-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '6d1ebc5d-e2b3-4e7b-bfb0-e86839b3e2e0', s.id, t.id, 5
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_create_enum'
WHERE s.slug = 'bizdata-model-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '09a7da73-7243-4356-b16b-08b3656764e0', s.id, t.id, 6
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_add_relation'
WHERE s.slug = 'bizdata-model-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '97b44898-6ab8-4964-a7ef-f3259c80fdd3', s.id, t.id, 7
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_validate_model'
WHERE s.slug = 'bizdata-model-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '028262e5-835f-40e3-b233-6075c02368b0', s.id, t.id, 12
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_get_scope_description'
WHERE s.slug = 'bizdata-model-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '327d10fb-81bb-40c5-b5a0-a4835faa4609', s.id, t.id, 12
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_update_enum'
WHERE s.slug = 'bizdata-model-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '386352e8-57dc-4c17-9176-e3f90e05f86f', s.id, t.id, 13
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_upsert_scope_description'
WHERE s.slug = 'bizdata-model-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'f6182d25-2ae1-405f-b20a-3714fa976693', s.id, t.id, 41
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_delete_relation'
WHERE s.slug = 'bizdata-model-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '87103e32-0bca-4c7c-879e-ed6b67740389', s.id, t.id, 42
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_list_enums'
WHERE s.slug = 'bizdata-model-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'bac1745f-b1dd-41c4-a386-841765906701', s.id, t.id, 43
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_list_relations'
WHERE s.slug = 'bizdata-model-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '33ae1c65-ea63-4976-b34f-1c3049f795ab', s.id, t.id, 44
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_upsert_entity_indexes'
WHERE s.slug = 'bizdata-model-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '5f564409-57b8-4dc2-a63a-5ebaaf0eeabf', s.id, t.id, 55
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_query_relation_graph'
WHERE s.slug = 'bizdata-model-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '1328df99-b80d-468c-8616-79307171b0d0', s.id, t.id, 98
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_get_metadata_by_target'
WHERE s.slug = 'bizdata-model-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '785e5671-5777-479a-863d-b13cf7c49c34', s.id, t.id, 98
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_list_data_standards'
WHERE s.slug = 'bizdata-model-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'ea735f7b-5b12-4dd8-b091-5a5722ce04f2', s.id, t.id, 98
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_upsert_metadata_field'
WHERE s.slug = 'bizdata-model-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'ac948bfb-f41d-45d2-b8df-fe5e16f65567', s.id, t.id, 98
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_upsert_metadata_table'
WHERE s.slug = 'bizdata-model-design'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'c1000000-0000-4000-8000-0000000000b0', s.id, t.id, 0
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'hook_list_event_types'
WHERE s.slug = 'hook-center-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'c1000000-0000-4000-8000-0000000000b1', s.id, t.id, 1
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'hook_list_hooks'
WHERE s.slug = 'hook-center-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'c1000000-0000-4000-8000-0000000000b2', s.id, t.id, 2
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'hook_get_hook'
WHERE s.slug = 'hook-center-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'c1000000-0000-4000-8000-0000000000b3', s.id, t.id, 3
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'hook_create_hook'
WHERE s.slug = 'hook-center-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'c1000000-0000-4000-8000-0000000000b4', s.id, t.id, 4
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'hook_update_hook'
WHERE s.slug = 'hook-center-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'c1000000-0000-4000-8000-0000000000b5', s.id, t.id, 5
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'hook_delete_hook'
WHERE s.slug = 'hook-center-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'c1000000-0000-4000-8000-0000000000b6', s.id, t.id, 6
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'hook_enable_hook'
WHERE s.slug = 'hook-center-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'c1000000-0000-4000-8000-0000000000b7', s.id, t.id, 7
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'hook_disable_hook'
WHERE s.slug = 'hook-center-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'c1000000-0000-4000-8000-0000000000b8', s.id, t.id, 8
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'hook_check_script'
WHERE s.slug = 'hook-center-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'c1000000-0000-4000-8000-0000000000b9', s.id, t.id, 9
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'hook_test_hook'
WHERE s.slug = 'hook-center-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'c1000000-0000-4000-8000-0000000000ba', s.id, t.id, 10
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'hook_list_runs'
WHERE s.slug = 'hook-center-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'c1000000-0000-4000-8000-0000000000bb', s.id, t.id, 11
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'hook_retry_run'
WHERE s.slug = 'hook-center-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'c1000000-0000-4000-8000-0000000000bc', s.id, t.id, 12
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'hook_suggest_config'
WHERE s.slug = 'hook-center-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'c1000000-0000-4000-8000-0000000000bd', s.id, t.id, 13
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'hook_navigate'
WHERE s.slug = 'hook-center-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '47eb8898-4320-4324-8f85-9e48d2df100e', s.id, t.id, 0
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_read_surfaces'
WHERE s.slug = 'outbound-webhook-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '0fd32491-5353-4d51-a8d2-dcf44625d0ea', s.id, t.id, 1
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'apiservice_list_services'
WHERE s.slug = 'outbound-webhook-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'f11317c0-787d-43e8-9c60-7577c684a3d8', s.id, t.id, 2
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'outbound_webhook_create'
WHERE s.slug = 'outbound-webhook-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '9175c346-50dc-4921-bca4-e8da820d0084', s.id, t.id, 3
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'outbound_webhook_delete'
WHERE s.slug = 'outbound-webhook-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '870c7fff-5c0a-46c4-909a-2baecc7c6caf', s.id, t.id, 4
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'outbound_webhook_disable'
WHERE s.slug = 'outbound-webhook-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '01f899bb-5d70-43eb-8e97-0f27725fa79a', s.id, t.id, 5
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'outbound_webhook_filter'
WHERE s.slug = 'outbound-webhook-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '932b9591-a77b-451f-acc8-d513a73f7347', s.id, t.id, 6
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'outbound_webhook_get'
WHERE s.slug = 'outbound-webhook-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '32a42f2e-19c1-4ce8-b0b7-4fbc1e1a1de8', s.id, t.id, 7
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'outbound_webhook_get_test_profile'
WHERE s.slug = 'outbound-webhook-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '50964f59-427f-43e5-a0f7-fce668ab4bde', s.id, t.id, 8
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'outbound_webhook_list'
WHERE s.slug = 'outbound-webhook-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'a7e36bb9-65f6-4880-950d-5560adb06cc3', s.id, t.id, 9
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'outbound_webhook_navigate'
WHERE s.slug = 'outbound-webhook-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '363365f9-4cd2-454e-9de9-0e909f160714', s.id, t.id, 10
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'outbound_webhook_publish'
WHERE s.slug = 'outbound-webhook-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '34209b39-d92a-4266-b7c2-36aa1925f70b', s.id, t.id, 11
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'outbound_webhook_run_test'
WHERE s.slug = 'outbound-webhook-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '34b5b7d9-56fd-4f34-a2cf-230a9e728f96', s.id, t.id, 12
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'outbound_webhook_set_mock_data'
WHERE s.slug = 'outbound-webhook-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '87278b0f-d298-4226-b12b-73a5415b5d65', s.id, t.id, 13
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'outbound_webhook_suggest_scripts'
WHERE s.slug = 'outbound-webhook-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '89605bdf-8124-4080-8f74-e5a814436632', s.id, t.id, 14
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'outbound_webhook_update'
WHERE s.slug = 'outbound-webhook-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '7187ed59-b730-48d0-b149-13db3a411cb2', s.id, t.id, 15
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'outbound_webhook_upsert'
WHERE s.slug = 'outbound-webhook-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'd31967d9-30b1-46f6-9d41-b8ca9283ac0b', s.id, t.id, 0
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'eadaf_assign_user_roles'
WHERE s.slug = 'eadaf-access-control'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'f275e0a6-7b12-4200-82d8-e8bf2d580a7f', s.id, t.id, 1
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'eadaf_create_data_rule'
WHERE s.slug = 'eadaf-access-control'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'fb0357ec-a2cd-4f2c-9c4e-493af76ef245', s.id, t.id, 2
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'eadaf_create_permission'
WHERE s.slug = 'eadaf-access-control'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '2592a85f-b095-4066-b55e-d0f35b827ac6', s.id, t.id, 3
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'eadaf_create_role'
WHERE s.slug = 'eadaf-access-control'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '259afcd5-e001-4888-98f7-315ea289dd20', s.id, t.id, 4
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'eadaf_create_user'
WHERE s.slug = 'eadaf-access-control'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'efe96c2b-025b-44b3-bec6-5b7e7ae3b1b8', s.id, t.id, 5
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'eadaf_delete_role'
WHERE s.slug = 'eadaf-access-control'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'e775dbe6-005d-4e6b-839d-2d51f5270fa7', s.id, t.id, 6
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'eadaf_delete_user'
WHERE s.slug = 'eadaf-access-control'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '9a12e02b-1f53-4115-9f38-e779bce4bfea', s.id, t.id, 7
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'eadaf_filter_users'
WHERE s.slug = 'eadaf-access-control'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'cc9250c0-7a2c-4590-952c-ebf073e02ee8', s.id, t.id, 8
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'eadaf_get_role'
WHERE s.slug = 'eadaf-access-control'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'c4a2d347-48bb-46e3-9d39-2267ee00aa67', s.id, t.id, 9
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'eadaf_get_user'
WHERE s.slug = 'eadaf-access-control'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'b4d0405f-53c3-4aa1-892d-aeb2246957a6', s.id, t.id, 10
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'eadaf_list_bizdata_scopes'
WHERE s.slug = 'eadaf-access-control'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '0dc9343e-c4b9-4a8b-b71c-67eec054986b', s.id, t.id, 11
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'eadaf_list_data_rules'
WHERE s.slug = 'eadaf-access-control'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'fc29ed8c-b618-403a-a8aa-b8dafaaec922', s.id, t.id, 12
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'eadaf_list_departments_tree'
WHERE s.slug = 'eadaf-access-control'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '6d7c3dfd-f074-47d7-8dac-a2d305e9bb7c', s.id, t.id, 13
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'eadaf_list_permissions'
WHERE s.slug = 'eadaf-access-control'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '2f0cf159-6e60-4bdd-867c-ed9470c45c76', s.id, t.id, 14
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'eadaf_list_roles'
WHERE s.slug = 'eadaf-access-control'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '37046dca-90cd-4fa9-8b31-5d0704a9cefe', s.id, t.id, 15
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'eadaf_list_users'
WHERE s.slug = 'eadaf-access-control'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '628213ed-2217-44f0-a8a9-f3a9a56c169d', s.id, t.id, 16
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'eadaf_set_role_permissions'
WHERE s.slug = 'eadaf-access-control'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'edcbc1c7-7282-4369-91c1-a357e0d10eca', s.id, t.id, 17
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'eadaf_update_permission'
WHERE s.slug = 'eadaf-access-control'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'e60a668b-f067-49c2-a73f-f485ddaf738b', s.id, t.id, 18
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'eadaf_update_role'
WHERE s.slug = 'eadaf-access-control'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT '79d0c642-6290-4fb6-a485-69fa5cb25afd', s.id, t.id, 19
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'eadaf_update_user'
WHERE s.slug = 'eadaf-access-control'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO aibase.skill_tools (id, skill_id, tool_id, sort_order)
SELECT 'cde13e05-85ba-4fd5-9acf-75d7fe92a3c5', s.id, t.id, 99
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'aibase_read_surfaces'
WHERE s.slug = 'eadaf-access-control'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

-- 收敛本批 Skill 的 Tool 绑定（删除本地已去掉的关系，不碰其他应用 Skill）
DELETE FROM aibase.skill_tools st
USING aibase.skills s
WHERE st.skill_id = s.id
  AND s.slug IN ('aibase-capability-design', 'aibase-capability-manage', 'aibase-chat-framework', 'aibase-model-manage', 'aibase-provider-manage', 'api-services-collection-pipeline', 'bizdata-api-service-create', 'bizdata-api-service-manage', 'bizdata-api-service-test-fix', 'bizdata-data-standards', 'bizdata-materialization', 'bizdata-metadata-catalog', 'bizdata-metrics', 'bizdata-model-design', 'hook-center-manage', 'outbound-webhook-manage', 'eadaf-access-control')
  AND NOT EXISTS (
    SELECT 1
    FROM (VALUES
  ('aibase-capability-design', 'aibase_create_scope'),
  ('aibase-capability-design', 'aibase_create_skill'),
  ('aibase-capability-design', 'aibase_create_tool'),
  ('aibase-capability-design', 'aibase_get_scope'),
  ('aibase-capability-design', 'aibase_get_skill'),
  ('aibase-capability-design', 'aibase_get_tool'),
  ('aibase-capability-design', 'aibase_list_scopes'),
  ('aibase-capability-design', 'aibase_list_skills'),
  ('aibase-capability-design', 'aibase_list_tools'),
  ('aibase-capability-design', 'aibase_read_surfaces'),
  ('aibase-capability-design', 'aibase_update_scope'),
  ('aibase-capability-design', 'aibase_update_skill'),
  ('aibase-capability-design', 'aibase_update_tool'),
  ('aibase-capability-manage', 'aibase_get_scope'),
  ('aibase-capability-manage', 'aibase_get_skill'),
  ('aibase-capability-manage', 'aibase_get_tool'),
  ('aibase-capability-manage', 'aibase_list_scopes'),
  ('aibase-capability-manage', 'aibase_list_skills'),
  ('aibase-capability-manage', 'aibase_list_tools'),
  ('aibase-capability-manage', 'aibase_read_surfaces'),
  ('aibase-capability-manage', 'aibase_update_scope'),
  ('aibase-capability-manage', 'aibase_update_skill'),
  ('aibase-capability-manage', 'aibase_update_tool'),
  ('aibase-model-manage', 'aibase_read_surfaces'),
  ('aibase-model-manage', 'aibase_list_providers'),
  ('aibase-model-manage', 'aibase_list_models'),
  ('aibase-model-manage', 'aibase_get_model'),
  ('aibase-model-manage', 'aibase_create_model'),
  ('aibase-model-manage', 'aibase_update_model'),
  ('aibase-model-manage', 'aibase_delete_model'),
  ('aibase-provider-manage', 'aibase_read_surfaces'),
  ('aibase-provider-manage', 'aibase_list_providers'),
  ('aibase-provider-manage', 'aibase_get_provider'),
  ('aibase-provider-manage', 'aibase_create_provider'),
  ('aibase-provider-manage', 'aibase_update_provider'),
  ('aibase-provider-manage', 'aibase_delete_provider'),
  ('api-services-collection-pipeline', 'aibase_read_surfaces'),
  ('api-services-collection-pipeline', 'bizdata_get_entity'),
  ('api-services-collection-pipeline', 'bizdata_list_entity_summaries'),
  ('api-services-collection-pipeline', 'collection_pipeline_delete'),
  ('api-services-collection-pipeline', 'collection_pipeline_disable'),
  ('api-services-collection-pipeline', 'collection_pipeline_filter'),
  ('api-services-collection-pipeline', 'collection_pipeline_get'),
  ('api-services-collection-pipeline', 'collection_pipeline_get_test_profile'),
  ('api-services-collection-pipeline', 'collection_pipeline_list'),
  ('api-services-collection-pipeline', 'collection_pipeline_navigate'),
  ('api-services-collection-pipeline', 'collection_pipeline_publish'),
  ('api-services-collection-pipeline', 'collection_pipeline_run_test'),
  ('api-services-collection-pipeline', 'collection_pipeline_suggest_scripts'),
  ('api-services-collection-pipeline', 'collection_pipeline_upsert'),
  ('bizdata-api-service-create', 'bizdata_get_entity'),
  ('bizdata-api-service-create', 'apiservice_filter_services'),
  ('bizdata-api-service-create', 'bizdata_get_materialization_status'),
  ('bizdata-api-service-create', 'aibase_read_surfaces'),
  ('bizdata-api-service-create', 'apiservice_list_operations'),
  ('bizdata-api-service-create', 'apiservice_list_services'),
  ('bizdata-api-service-create', 'apiservice_resolve_connection'),
  ('bizdata-api-service-create', 'apiservice_create_services_batch'),
  ('bizdata-api-service-create', 'apiservice_create_service'),
  ('bizdata-api-service-create', 'apiservice_check_handler'),
  ('bizdata-api-service-create', 'bizdata_list_entity_summaries'),
  ('bizdata-api-service-create', 'apiservice_get_service'),
  ('bizdata-api-service-create', 'apiservice_publish_service'),
  ('bizdata-api-service-create', 'apiservice_run_test'),
  ('bizdata-api-service-manage', 'apiservice_publish_service'),
  ('bizdata-api-service-manage', 'aibase_read_surfaces'),
  ('bizdata-api-service-manage', 'apiservice_filter_services'),
  ('bizdata-api-service-manage', 'apiservice_get_service'),
  ('bizdata-api-service-manage', 'bizdata_list_entity_summaries'),
  ('bizdata-api-service-manage', 'apiservice_disable_service'),
  ('bizdata-api-service-manage', 'apiservice_get_test_profile'),
  ('bizdata-api-service-manage', 'apiservice_delete_service'),
  ('bizdata-api-service-manage', 'apiservice_list_operations'),
  ('bizdata-api-service-manage', 'apiservice_list_services'),
  ('bizdata-api-service-manage', 'apiservice_navigate'),
  ('bizdata-api-service-manage', 'apiservice_update_service'),
  ('bizdata-api-service-manage', 'apiservice_get_tree'),
  ('bizdata-api-service-manage', 'apiservice_run_test'),
  ('bizdata-api-service-manage', 'apiservice_set_test_params'),
  ('bizdata-api-service-manage', 'apiservice_suggest_test_params'),
  ('bizdata-api-service-manage', 'apiservice_check_handler'),
  ('bizdata-api-service-manage', 'bizdata_get_entity'),
  ('bizdata-api-service-test-fix', 'aibase_read_surfaces'),
  ('bizdata-api-service-test-fix', 'apiservice_get_service'),
  ('bizdata-api-service-test-fix', 'apiservice_get_test_profile'),
  ('bizdata-api-service-test-fix', 'apiservice_navigate'),
  ('bizdata-api-service-test-fix', 'apiservice_run_test'),
  ('bizdata-api-service-test-fix', 'apiservice_set_test_params'),
  ('bizdata-api-service-test-fix', 'apiservice_suggest_test_params'),
  ('bizdata-api-service-test-fix', 'apiservice_update_service'),
  ('bizdata-api-service-test-fix', 'bizdata_get_entity'),
  ('bizdata-api-service-test-fix', 'bizdata_get_materialization_status'),
  ('bizdata-api-service-test-fix', 'apiservice_check_handler'),
  ('bizdata-data-standards', 'bizdata_create_data_standard'),
  ('bizdata-data-standards', 'bizdata_delete_data_standard'),
  ('bizdata-data-standards', 'bizdata_list_data_standards'),
  ('bizdata-data-standards', 'bizdata_update_data_standard'),
  ('bizdata-data-standards', 'aibase_read_surfaces'),
  ('bizdata-materialization', 'bizdata_get_entity'),
  ('bizdata-materialization', 'bizdata_preview_materialization'),
  ('bizdata-materialization', 'bizdata_execute_materialization'),
  ('bizdata-materialization', 'bizdata_list_materialization_runs'),
  ('bizdata-materialization', 'bizdata_get_materialization_status'),
  ('bizdata-materialization', 'bizdata_browse_materialized_rows'),
  ('bizdata-materialization', 'bizdata_browse_materialized_schema'),
  ('bizdata-materialization', 'bizdata_insert_mock_data'),
  ('bizdata-materialization', 'bizdata_list_entity_summaries'),
  ('bizdata-metadata-catalog', 'bizdata_get_metadata_by_target'),
  ('bizdata-metadata-catalog', 'bizdata_get_metadata_table'),
  ('bizdata-metadata-catalog', 'bizdata_list_data_standards'),
  ('bizdata-metadata-catalog', 'bizdata_list_metadata_tables'),
  ('bizdata-metadata-catalog', 'bizdata_sync_metadata_from_schema'),
  ('bizdata-metadata-catalog', 'bizdata_update_metadata_fields'),
  ('bizdata-metadata-catalog', 'bizdata_update_metadata_table'),
  ('bizdata-metadata-catalog', 'bizdata_upsert_metadata_field'),
  ('bizdata-metadata-catalog', 'bizdata_upsert_metadata_table'),
  ('bizdata-metadata-catalog', 'aibase_read_surfaces'),
  ('bizdata-metrics', 'aibase_read_surfaces'),
  ('bizdata-metrics', 'bizdata_browse_materialized_schema'),
  ('bizdata-metrics', 'bizdata_get_entity'),
  ('bizdata-metrics', 'bizdata_metric_card_delete'),
  ('bizdata-metrics', 'bizdata_metric_delete'),
  ('bizdata-metrics', 'bizdata_metric_card_get'),
  ('bizdata-metrics', 'bizdata_metric_execute'),
  ('bizdata-metrics', 'bizdata_metric_card_list'),
  ('bizdata-metrics', 'bizdata_metric_execute_batch'),
  ('bizdata-metrics', 'bizdata_metric_card_suggest'),
  ('bizdata-metrics', 'bizdata_metric_filter'),
  ('bizdata-metrics', 'bizdata_metric_get'),
  ('bizdata-metrics', 'bizdata_metric_card_upsert'),
  ('bizdata-metrics', 'bizdata_metric_get_dashboard'),
  ('bizdata-metrics', 'bizdata_metric_get_value'),
  ('bizdata-metrics', 'bizdata_metric_list'),
  ('bizdata-metrics', 'bizdata_metric_list_runs'),
  ('bizdata-metrics', 'bizdata_metric_list_values'),
  ('bizdata-metrics', 'bizdata_metric_navigate'),
  ('bizdata-metrics', 'bizdata_metric_suggest_definition'),
  ('bizdata-metrics', 'bizdata_metric_upsert'),
  ('bizdata-metrics', 'bizdata_list_entity_summaries'),
  ('bizdata-model-design', 'bizdata_get_entity'),
  ('bizdata-model-design', 'bizdata_list_entity_summaries'),
  ('bizdata-model-design', 'bizdata_update_entity'),
  ('bizdata-model-design', 'bizdata_create_entity'),
  ('bizdata-model-design', 'bizdata_delete_entity'),
  ('bizdata-model-design', 'bizdata_create_enum'),
  ('bizdata-model-design', 'bizdata_add_relation'),
  ('bizdata-model-design', 'bizdata_validate_model'),
  ('bizdata-model-design', 'bizdata_get_scope_description'),
  ('bizdata-model-design', 'bizdata_update_enum'),
  ('bizdata-model-design', 'bizdata_upsert_scope_description'),
  ('bizdata-model-design', 'bizdata_delete_relation'),
  ('bizdata-model-design', 'bizdata_list_enums'),
  ('bizdata-model-design', 'bizdata_list_relations'),
  ('bizdata-model-design', 'bizdata_upsert_entity_indexes'),
  ('bizdata-model-design', 'bizdata_query_relation_graph'),
  ('bizdata-model-design', 'bizdata_get_metadata_by_target'),
  ('bizdata-model-design', 'bizdata_list_data_standards'),
  ('bizdata-model-design', 'bizdata_upsert_metadata_field'),
  ('bizdata-model-design', 'bizdata_upsert_metadata_table'),
  ('hook-center-manage', 'hook_list_event_types'),
  ('hook-center-manage', 'hook_list_hooks'),
  ('hook-center-manage', 'hook_get_hook'),
  ('hook-center-manage', 'hook_create_hook'),
  ('hook-center-manage', 'hook_update_hook'),
  ('hook-center-manage', 'hook_delete_hook'),
  ('hook-center-manage', 'hook_enable_hook'),
  ('hook-center-manage', 'hook_disable_hook'),
  ('hook-center-manage', 'hook_check_script'),
  ('hook-center-manage', 'hook_test_hook'),
  ('hook-center-manage', 'hook_list_runs'),
  ('hook-center-manage', 'hook_retry_run'),
  ('hook-center-manage', 'hook_suggest_config'),
  ('hook-center-manage', 'hook_navigate'),
  ('outbound-webhook-manage', 'aibase_read_surfaces'),
  ('outbound-webhook-manage', 'apiservice_list_services'),
  ('outbound-webhook-manage', 'outbound_webhook_create'),
  ('outbound-webhook-manage', 'outbound_webhook_delete'),
  ('outbound-webhook-manage', 'outbound_webhook_disable'),
  ('outbound-webhook-manage', 'outbound_webhook_filter'),
  ('outbound-webhook-manage', 'outbound_webhook_get'),
  ('outbound-webhook-manage', 'outbound_webhook_get_test_profile'),
  ('outbound-webhook-manage', 'outbound_webhook_list'),
  ('outbound-webhook-manage', 'outbound_webhook_navigate'),
  ('outbound-webhook-manage', 'outbound_webhook_publish'),
  ('outbound-webhook-manage', 'outbound_webhook_run_test'),
  ('outbound-webhook-manage', 'outbound_webhook_set_mock_data'),
  ('outbound-webhook-manage', 'outbound_webhook_suggest_scripts'),
  ('outbound-webhook-manage', 'outbound_webhook_update'),
  ('outbound-webhook-manage', 'outbound_webhook_upsert'),
  ('eadaf-access-control', 'eadaf_assign_user_roles'),
  ('eadaf-access-control', 'eadaf_create_data_rule'),
  ('eadaf-access-control', 'eadaf_create_permission'),
  ('eadaf-access-control', 'eadaf_create_role'),
  ('eadaf-access-control', 'eadaf_create_user'),
  ('eadaf-access-control', 'eadaf_delete_role'),
  ('eadaf-access-control', 'eadaf_delete_user'),
  ('eadaf-access-control', 'eadaf_filter_users'),
  ('eadaf-access-control', 'eadaf_get_role'),
  ('eadaf-access-control', 'eadaf_get_user'),
  ('eadaf-access-control', 'eadaf_list_bizdata_scopes'),
  ('eadaf-access-control', 'eadaf_list_data_rules'),
  ('eadaf-access-control', 'eadaf_list_departments_tree'),
  ('eadaf-access-control', 'eadaf_list_permissions'),
  ('eadaf-access-control', 'eadaf_list_roles'),
  ('eadaf-access-control', 'eadaf_list_users'),
  ('eadaf-access-control', 'eadaf_set_role_permissions'),
  ('eadaf-access-control', 'eadaf_update_permission'),
  ('eadaf-access-control', 'eadaf_update_role'),
  ('eadaf-access-control', 'eadaf_update_user'),
  ('eadaf-access-control', 'aibase_read_surfaces')
    ) AS keep(skill_slug, tool_fn)
    JOIN aibase.tools t ON t.function_name = keep.tool_fn
    WHERE keep.skill_slug = s.slug AND t.id = st.tool_id
  );

-- ===== skill_applications：专用 Skill 绑定 EADAF =====
INSERT INTO aibase.skill_applications (skill_id, application_id, created_at)
SELECT s.id, a.application_id, CURRENT_TIMESTAMP
FROM aibase.skills s
JOIN eadaf.applications a ON a.code = 'EADAF'
WHERE s.slug = 'aibase-capability-design'
ON CONFLICT (skill_id, application_id) DO NOTHING;

INSERT INTO aibase.skill_applications (skill_id, application_id, created_at)
SELECT s.id, a.application_id, CURRENT_TIMESTAMP
FROM aibase.skills s
JOIN eadaf.applications a ON a.code = 'EADAF'
WHERE s.slug = 'aibase-capability-manage'
ON CONFLICT (skill_id, application_id) DO NOTHING;

INSERT INTO aibase.skill_applications (skill_id, application_id, created_at)
SELECT s.id, a.application_id, CURRENT_TIMESTAMP
FROM aibase.skills s
JOIN eadaf.applications a ON a.code = 'EADAF'
WHERE s.slug = 'aibase-model-manage'
ON CONFLICT (skill_id, application_id) DO NOTHING;

INSERT INTO aibase.skill_applications (skill_id, application_id, created_at)
SELECT s.id, a.application_id, CURRENT_TIMESTAMP
FROM aibase.skills s
JOIN eadaf.applications a ON a.code = 'EADAF'
WHERE s.slug = 'aibase-provider-manage'
ON CONFLICT (skill_id, application_id) DO NOTHING;

INSERT INTO aibase.skill_applications (skill_id, application_id, created_at)
SELECT s.id, a.application_id, CURRENT_TIMESTAMP
FROM aibase.skills s
JOIN eadaf.applications a ON a.code = 'EADAF'
WHERE s.slug = 'api-services-collection-pipeline'
ON CONFLICT (skill_id, application_id) DO NOTHING;

INSERT INTO aibase.skill_applications (skill_id, application_id, created_at)
SELECT s.id, a.application_id, CURRENT_TIMESTAMP
FROM aibase.skills s
JOIN eadaf.applications a ON a.code = 'EADAF'
WHERE s.slug = 'bizdata-api-service-create'
ON CONFLICT (skill_id, application_id) DO NOTHING;

INSERT INTO aibase.skill_applications (skill_id, application_id, created_at)
SELECT s.id, a.application_id, CURRENT_TIMESTAMP
FROM aibase.skills s
JOIN eadaf.applications a ON a.code = 'EADAF'
WHERE s.slug = 'bizdata-api-service-manage'
ON CONFLICT (skill_id, application_id) DO NOTHING;

INSERT INTO aibase.skill_applications (skill_id, application_id, created_at)
SELECT s.id, a.application_id, CURRENT_TIMESTAMP
FROM aibase.skills s
JOIN eadaf.applications a ON a.code = 'EADAF'
WHERE s.slug = 'bizdata-api-service-test-fix'
ON CONFLICT (skill_id, application_id) DO NOTHING;

INSERT INTO aibase.skill_applications (skill_id, application_id, created_at)
SELECT s.id, a.application_id, CURRENT_TIMESTAMP
FROM aibase.skills s
JOIN eadaf.applications a ON a.code = 'EADAF'
WHERE s.slug = 'bizdata-data-standards'
ON CONFLICT (skill_id, application_id) DO NOTHING;

INSERT INTO aibase.skill_applications (skill_id, application_id, created_at)
SELECT s.id, a.application_id, CURRENT_TIMESTAMP
FROM aibase.skills s
JOIN eadaf.applications a ON a.code = 'EADAF'
WHERE s.slug = 'bizdata-materialization'
ON CONFLICT (skill_id, application_id) DO NOTHING;

INSERT INTO aibase.skill_applications (skill_id, application_id, created_at)
SELECT s.id, a.application_id, CURRENT_TIMESTAMP
FROM aibase.skills s
JOIN eadaf.applications a ON a.code = 'EADAF'
WHERE s.slug = 'bizdata-metadata-catalog'
ON CONFLICT (skill_id, application_id) DO NOTHING;

INSERT INTO aibase.skill_applications (skill_id, application_id, created_at)
SELECT s.id, a.application_id, CURRENT_TIMESTAMP
FROM aibase.skills s
JOIN eadaf.applications a ON a.code = 'EADAF'
WHERE s.slug = 'bizdata-metrics'
ON CONFLICT (skill_id, application_id) DO NOTHING;

INSERT INTO aibase.skill_applications (skill_id, application_id, created_at)
SELECT s.id, a.application_id, CURRENT_TIMESTAMP
FROM aibase.skills s
JOIN eadaf.applications a ON a.code = 'EADAF'
WHERE s.slug = 'bizdata-model-design'
ON CONFLICT (skill_id, application_id) DO NOTHING;

INSERT INTO aibase.skill_applications (skill_id, application_id, created_at)
SELECT s.id, a.application_id, CURRENT_TIMESTAMP
FROM aibase.skills s
JOIN eadaf.applications a ON a.code = 'EADAF'
WHERE s.slug = 'hook-center-manage'
ON CONFLICT (skill_id, application_id) DO NOTHING;

INSERT INTO aibase.skill_applications (skill_id, application_id, created_at)
SELECT s.id, a.application_id, CURRENT_TIMESTAMP
FROM aibase.skills s
JOIN eadaf.applications a ON a.code = 'EADAF'
WHERE s.slug = 'outbound-webhook-manage'
ON CONFLICT (skill_id, application_id) DO NOTHING;

INSERT INTO aibase.skill_applications (skill_id, application_id, created_at)
SELECT s.id, a.application_id, CURRENT_TIMESTAMP
FROM aibase.skills s
JOIN eadaf.applications a ON a.code = 'EADAF'
WHERE s.slug = 'eadaf-access-control'
ON CONFLICT (skill_id, application_id) DO NOTHING;

-- EADAF 顶层 Skill Markdown
UPDATE eadaf.applications
SET top_level_skill_markdown = '
# EADAF 应用顶层 Skill

你是 **EADAF 企业数据底座** 的 AI 助手。本文档描述平台通用行为、主要功能模块与 Skill/Tool 概览；**具体页面的操作流程以当前页面加载的专用 Skill 为准**。

## 平台通用行为

### UI 同步
- 写操作（创建 / 更新 / 删除）成功后，列表页、表单页、设计器 Surface 会**自动刷新**
- **禁止**提示用户「请手动刷新页面」或「请刷新浏览器」

### 页面跳转与操作上下文
- 写操作（创建 / 更新 / 删除）成功后，前端会**自动跳转到对应模块的列表页**，让用户在列表中确认变更结果；**不需要**也不应该把用户带到 create / edit 等具体表单页
- 仅在确有需要时，用 navigate 类 Tool 带用户去**查看类**页面（测试 / 看板），不要用于跳转到 create / edit：
  - API 服务：`apiservice_navigate`（list / test）
  - 业务指标：`bizdata_metric_navigate`（list / dashboard）
  - 采集管道：`collection_pipeline_navigate`（list / test）
- 执行写操作前，用 `aibase_read_surfaces` 读取当前页选中项、表单值、列表筛选等上下文

### 对话收尾与下一步建议
- 当前阶段任务成功交付后，**必须**在回复末尾给出 **3～5 条下一步操作建议**（用业务语言描述，不要提及 a2ui-commands、Tool 函数名等内部机制）
- 按钮渲染格式遵循全局 Skill `aibase-chat-framework` 中的 A2UI 约定
- 常见下一步方向（按实际上下文选取，不要机械罗列全部）：
  - 继续完善当前模块（字段、关系、配置细节）
  - 切换到相邻阶段（建模 → 物化 → API → 指标 → 元数据）
  - 查看 / 测试刚创建或修改的资源
  - 返回列表确认变更已生效
- 收尾建议**不要**因此触发额外 Tool 调用，除非用户明确选择继续

### 与用户沟通
- 用业务语言；**禁止**向用户展示 Tool 函数名、内部 JSON 协议、原始 Tool 返回体
- 涉及成员、权限、实体、API 等数据时**必须先调用 Tool 查询**，禁止编造 ID、version、连接信息
- 用户说的「Scope / 业务域 / 设备域」通常指 **bizdata 实体 code 前缀**（如 `equipment`），用 `eadaf_list_bizdata_scopes` / `bizdata_list_entity_summaries` 查询实体列表；**不是** aibase.scopes（AI 能力域管理菜单暂未开放）

### 引用与快捷操作
- 用户可通过页面 `@` 引用成员、实体、API 服务等上下文；优先结合引用内容理解意图
- 页面快捷提示（Prompts）随当前路由与引用动态更新，可直接点击发起任务

## 主要功能模块与 Skill 概览

### 成员与组织（/member_org、/permissions）
| 页面 | Skill ID | 要点 |
|------|----------|------|
| 成员 / 组织 / 角色 | `eadaf-access-control` | 用户、部门树、角色、数据范围规则 |
| 菜单 / 按钮 / API 权限 | `eadaf-access-control` | 权限项维护与角色授权 |

主要 Tool：`eadaf_list_*` / `eadaf_create_*` / `eadaf_update_*` / `eadaf_assign_*` / `eadaf_set_role_permissions` / `eadaf_create_data_rule`

### 业务数据（/business_data）
| 页面 | Skill ID | 要点 |
|------|----------|------|
| 数据模型设计 | `bizdata-model-design` | 实体、枚举、字段、索引、关系、校验 |
| 执行物化 / 数据库预览 | `bizdata-materialization` | 物化到库、MOCK 数据、浏览 schema |
| 数据标准 | `bizdata-data-standards` | 主数据标准（需开启元数据功能） |
| 元数据 | `bizdata-metadata-catalog` | 逻辑元数据治理 |
| 指标管理 / 看板 | `bizdata-metrics` | 指标定义、计算与看板 |

主要 Tool：`bizdata_*`（实体 CRUD、物化、元数据、指标等）

### API 服务（/api_services）
| 页面 | Skill ID | 要点 |
|------|----------|------|
| 新建 API | `bizdata-api-service-create` | 从实体/SQL 创建服务 |
| 列表 / 编辑 | `bizdata-api-service-manage` | 发布、禁用、更新配置 |
| 测试 / 自动修复 | `bizdata-api-service-test-fix` | mock 修复、SQL 修复、页面跳转重测 |
| 采集数据结构化 | `api-services-collection-pipeline` | 样本解析脚本、入库脚本、管道测试 |

主要 Tool：`apiservice_*`、`collection_pipeline_*`

### AI 管理（/ai_management）
| 页面 | Skill ID | 要点 |
|------|----------|------|
| AI 服务商 | `aibase-provider-manage` | 上游连接；用户只需提供 API Key |
| AI 模型 | `aibase-model-manage` | 模型注册、capabilities、多模态 tags |
| Skills / Tools 设计 | `aibase-capability-design` | 规划并创建 Tool、Skill |
| Skills / Tools 管理 | `aibase-capability-manage` | 维护已有 Tool、Skill 配置 |

主要 Tool：`aibase_list_*` / `aibase_get_*` / `aibase_create_*` / `aibase_update_*`

### 应用与文件
- **应用**（/service_provider）：应用注册、SSO、API 密钥、**顶层 Skill**（本说明的编辑入口）
- **文件**（/file_storage）：Bucket 与文件浏览（暂无专用 Skill，遵循本平台通用行为即可）

## 跨模块阶段边界
- 默认 **一次一事**：单次用户请求只完成**当前页面所属阶段**
- 建模 ≠ 物化 ≠ API 服务 ≠ 指标 ≠ 元数据；跨阶段须用户**明确**要求或点击下一步建议
- 全局阶段协议（A2UI 格式、连续执行例外等）见 Skill **`aibase-chat-framework`**
',
    updated_at = CURRENT_TIMESTAMP
WHERE code = 'EADAF';

COMMIT;
