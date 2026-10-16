-- 强制 AI 浏览实体时只用 bizdata_list_entity_summaries：
-- 1. 停用 bizdata_list_entities（仍保留 handler，管理端可再启用）
-- 2. summaries 改为主显示名「列出实体摘要」
-- 3. 从全部 Skill 解除 list_entities 关联
-- 4. 更新顶层 Skill / API 服务 Skill 指引

UPDATE aibase.tools
SET
    name = '列出实体摘要',
    description = '列出业务数据实体摘要（不含 fields，含 fieldCount）；浏览 Scope、对照 API 覆盖率时**默认使用本 Tool**',
    review_markdown = E'## bizdata_list_entity_summaries\n\n**列出 / 浏览实体时的默认 Tool**（响应小，不含 fields）。\n\n返回：`id`、`code`、`label`、`entityKind`、`tableName`、`status`、`version`、`fieldCount`、`modelValidated`。\n\n- 按子域过滤：传 `codePrefix`（如 `fmms:logistics`）\n- 需要字段详情：再调 **`bizdata_get_entity`**（entityCode）\n\n**禁止**为列举实体而调用已停用的 `bizdata_list_entities`。',
    updated_at = CURRENT_TIMESTAMP
WHERE function_name = 'bizdata_list_entity_summaries';

UPDATE aibase.tools
SET
    name = '列出实体(全量字段,已停用)',
    description = '【已停用】含完整 fields，数据量极大。浏览/列举实体请用 bizdata_list_entity_summaries',
    is_active = false,
    review_markdown = E'## bizdata_list_entities（已停用）\n\n本 Tool 已对 AI 停用。列举、浏览 Scope/子域实体请用 **`bizdata_list_entity_summaries`**；单实体字段用 **`bizdata_get_entity`**。',
    updated_at = CURRENT_TIMESTAMP
WHERE function_name = 'bizdata_list_entities';

DELETE FROM aibase.skill_tools st
USING aibase.tools t
WHERE st.tool_id = t.id
  AND t.function_name = 'bizdata_list_entities';

-- API 服务管理：确保 summaries 在 Tool 列表靠前
INSERT INTO aibase.skill_tools (skill_id, tool_id, sort_order)
SELECT s.id, t.id, 2
FROM aibase.skills s
JOIN aibase.tools t ON t.function_name = 'bizdata_list_entity_summaries'
WHERE s.slug = 'bizdata-api-service-manage'
ON CONFLICT (skill_id, tool_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

UPDATE aibase.skills
SET
    content_markdown = regexp_replace(
        content_markdown,
        '1\. `apiservice_list_services` / `apiservice_get_tree` 浏览服务',
        E'1. `apiservice_list_services` / `apiservice_get_tree` 浏览服务\n- 需同时了解某 Scope/子域下有哪些实体：先 **`bizdata_list_entity_summaries`**（codePrefix，如 `fmms:logistics`），**禁止**调用已停用的 `bizdata_list_entities`',
        'g'
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE slug = 'bizdata-api-service-manage'
  AND content_markdown NOT LIKE '%bizdata_list_entity_summaries%';

UPDATE aibase.skills
SET
    content_markdown = regexp_replace(
        content_markdown,
        '3\. `apiservice_list_services`（codePrefix）检查已有服务',
        E'3. 列举子域实体：`bizdata_list_entity_summaries`（codePrefix）；检查已有 API：`apiservice_list_services`（codePrefix）',
        'g'
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE slug = 'bizdata-api-service-create'
  AND content_markdown LIKE '%apiservice_list_services`（codePrefix）检查已有服务%'
  AND content_markdown NOT LIKE '%bizdata_list_entity_summaries%';

UPDATE aibase.skills
SET
    content_markdown = REPLACE(
        content_markdown,
        '- **`bizdata_list_entities`**：仅当确实需要一次性拉取全部 fields 时使用',
        '- **`bizdata_list_entities`**：已对 AI 停用；需要字段请 `bizdata_get_entity`'
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE slug = 'bizdata-model-design'
  AND content_markdown LIKE '%仅当确实需要一次性拉取全部 fields%';

UPDATE eadaf.applications
SET
    top_level_skill_markdown = REPLACE(
        top_level_skill_markdown,
        '用 `eadaf_list_bizdata_scopes` / `bizdata_list_entities` 查询',
        '用 `eadaf_list_bizdata_scopes` / `bizdata_list_entity_summaries` 查询实体列表'
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE top_level_skill_markdown LIKE '%bizdata_list_entities%';
