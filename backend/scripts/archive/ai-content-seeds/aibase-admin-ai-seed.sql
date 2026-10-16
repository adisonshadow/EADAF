-- AI 管理 Scope / Skills / Tools 种子数据（Skill/Tool 的设计与管理）

INSERT INTO aibase.scopes (id, name, slug, description, is_active)
VALUES (
    '88888888-8888-4888-8888-888888888801',
    'AI 管理',
    'ai-management',
    'EADAF AI 能力配置：Scope、Tool、Skill 的设计与管理',
    true
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.tools (
    id, scope_id, name, slug, function_name, description,
    execution_type, parameters_schema, review_markdown, server_config, is_active
)
VALUES
    (
        '88888888-8888-4888-8888-888888888811',
        '88888888-8888-4888-8888-888888888801',
        '列出 Scope',
        'aibase-list-scopes',
        'aibase_list_scopes',
        '列出 AI Scope 配置',
        'client',
        '{"type":"object","properties":{"page":{"type":"integer"},"size":{"type":"integer"},"isActive":{"type":"boolean"}}}'::jsonb,
        '## aibase_list_scopes',
        '{}'::jsonb,
        true
    ),
    (
        '88888888-8888-4888-8888-888888888812',
        '88888888-8888-4888-8888-888888888801',
        '获取 Scope 详情',
        'aibase-get-scope',
        'aibase_get_scope',
        '按 ID 获取 Scope 详情',
        'client',
        '{"type":"object","properties":{"scopeId":{"type":"string"}},"required":["scopeId"]}'::jsonb,
        '## aibase_get_scope',
        '{}'::jsonb,
        true
    ),
    (
        '88888888-8888-4888-8888-888888888813',
        '88888888-8888-4888-8888-888888888801',
        '创建 Scope',
        'aibase-create-scope',
        'aibase_create_scope',
        '创建 AI Scope',
        'client',
        '{"type":"object","properties":{"name":{"type":"string"},"slug":{"type":"string"},"description":{"type":"string"}},"required":["name","slug"]}'::jsonb,
        E'## aibase_create_scope\n\nslug 即 Scope ID，小写字母、数字与连字符。',
        '{}'::jsonb,
        true
    ),
    (
        '88888888-8888-4888-8888-888888888814',
        '88888888-8888-4888-8888-888888888801',
        '更新 Scope',
        'aibase-update-scope',
        'aibase_update_scope',
        '更新 Scope 信息或启用状态',
        'client',
        '{"type":"object","properties":{"scopeId":{"type":"string"},"name":{"type":"string"},"slug":{"type":"string"},"description":{"type":"string"},"isActive":{"type":"boolean"}},"required":["scopeId"]}'::jsonb,
        '## aibase_update_scope',
        '{}'::jsonb,
        true
    ),
    (
        '88888888-8888-4888-8888-888888888821',
        '88888888-8888-4888-8888-888888888801',
        '列出 Tool',
        'aibase-list-tools',
        'aibase_list_tools',
        '列出 AI Tool 配置',
        'client',
        '{"type":"object","properties":{"page":{"type":"integer"},"size":{"type":"integer"},"scopeId":{"type":"string"},"executionType":{"type":"string"},"isActive":{"type":"boolean"}}}'::jsonb,
        '## aibase_list_tools',
        '{}'::jsonb,
        true
    ),
    (
        '88888888-8888-4888-8888-888888888822',
        '88888888-8888-4888-8888-888888888801',
        '获取 Tool 详情',
        'aibase-get-tool',
        'aibase_get_tool',
        '按 ID 获取 Tool 详情',
        'client',
        '{"type":"object","properties":{"toolId":{"type":"string"}},"required":["toolId"]}'::jsonb,
        '## aibase_get_tool',
        '{}'::jsonb,
        true
    ),
    (
        '88888888-8888-4888-8888-888888888823',
        '88888888-8888-4888-8888-888888888801',
        '创建 Tool',
        'aibase-create-tool',
        'aibase_create_tool',
        '创建 AI Tool',
        'client',
        '{"type":"object","properties":{"scopeId":{"type":"string"},"name":{"type":"string"},"slug":{"type":"string"},"functionName":{"type":"string"},"description":{"type":"string"},"executionType":{"type":"string","enum":["client","server_http","server_builtin"]},"parametersSchema":{"type":"object"},"reviewMarkdown":{"type":"string"},"serverConfig":{"type":"object"}},"required":["scopeId","name","functionName","executionType"]}'::jsonb,
        E'## aibase_create_tool\n\n- functionName：全局唯一，snake_case\n- executionType：client / server_http / server_builtin\n- server_builtin 需在 serverConfig 中配置 handler',
        '{}'::jsonb,
        true
    ),
    (
        '88888888-8888-4888-8888-888888888824',
        '88888888-8888-4888-8888-888888888801',
        '更新 Tool',
        'aibase-update-tool',
        'aibase_update_tool',
        '更新 Tool 配置或启用状态',
        'client',
        '{"type":"object","properties":{"toolId":{"type":"string"},"scopeId":{"type":"string"},"name":{"type":"string"},"slug":{"type":"string"},"functionName":{"type":"string"},"description":{"type":"string"},"executionType":{"type":"string"},"parametersSchema":{"type":"object"},"reviewMarkdown":{"type":"string"},"serverConfig":{"type":"object"},"isActive":{"type":"boolean"}},"required":["toolId"]}'::jsonb,
        '## aibase_update_tool',
        '{}'::jsonb,
        true
    ),
    (
        '88888888-8888-4888-8888-888888888831',
        '88888888-8888-4888-8888-888888888801',
        '列出 Skill',
        'aibase-list-skills',
        'aibase_list_skills',
        '列出 AI Skill 配置',
        'client',
        '{"type":"object","properties":{"page":{"type":"integer"},"size":{"type":"integer"},"isActive":{"type":"boolean"}}}'::jsonb,
        '## aibase_list_skills',
        '{}'::jsonb,
        true
    ),
    (
        '88888888-8888-4888-8888-888888888832',
        '88888888-8888-4888-8888-888888888801',
        '获取 Skill 详情',
        'aibase-get-skill',
        'aibase_get_skill',
        '按 ID 获取 Skill 详情（含关联 Tool）',
        'client',
        '{"type":"object","properties":{"skillId":{"type":"string"}},"required":["skillId"]}'::jsonb,
        '## aibase_get_skill',
        '{}'::jsonb,
        true
    ),
    (
        '88888888-8888-4888-8888-888888888833',
        '88888888-8888-4888-8888-888888888801',
        '创建 Skill',
        'aibase-create-skill',
        'aibase_create_skill',
        '创建 AI Skill',
        'client',
        '{"type":"object","properties":{"name":{"type":"string"},"slug":{"type":"string"},"description":{"type":"string"},"contentMarkdown":{"type":"string"},"scopeId":{"type":"string"},"toolIds":{"type":"array","items":{"type":"string"}},"isGlobal":{"type":"boolean"},"isDedicated":{"type":"boolean"},"applicationIds":{"type":"array","items":{"type":"string"}}},"required":["name","slug"]}'::jsonb,
        E'## aibase_create_skill\n\n- slug 即 Skill ID\n- 应用范围：isGlobal 与 isDedicated 互斥\n- 专用 Skill 需传 applicationIds',
        '{}'::jsonb,
        true
    ),
    (
        '88888888-8888-4888-8888-888888888834',
        '88888888-8888-4888-8888-888888888801',
        '更新 Skill',
        'aibase-update-skill',
        'aibase_update_skill',
        '更新 Skill 内容、关联 Tool 或启用状态',
        'client',
        '{"type":"object","properties":{"skillId":{"type":"string"},"name":{"type":"string"},"slug":{"type":"string"},"description":{"type":"string"},"contentMarkdown":{"type":"string"},"scopeId":{"type":"string"},"toolIds":{"type":"array","items":{"type":"string"}},"isGlobal":{"type":"boolean"},"isDedicated":{"type":"boolean"},"applicationIds":{"type":"array","items":{"type":"string"}},"isActive":{"type":"boolean"}},"required":["skillId"]}'::jsonb,
        '## aibase_update_skill',
        '{}'::jsonb,
        true
    ),
    (
        '77777777-7777-4777-8777-777777777701',
        '88888888-8888-4888-8888-888888888801',
        '读取页面 Surface',
        'aibase-read-surfaces',
        'aibase_read_surfaces',
        '读取当前页面已注册的 AI Surface 快照',
        'client',
        '{"type":"object","properties":{"domain":{"type":"string"},"surfaceId":{"type":"string"}}}'::jsonb,
        E'## aibase_read_surfaces\n\n返回当前页面注册的 Surface 列表（选中实体、表单值等）。\n\n可选过滤：\n- domain：如 bizdata、aibase\n- surfaceId：如 bizdata.model-designer',
        '{}'::jsonb,
        true
    )
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    function_name = EXCLUDED.function_name,
    description = EXCLUDED.description,
    execution_type = EXCLUDED.execution_type,
    parameters_schema = EXCLUDED.parameters_schema,
    review_markdown = EXCLUDED.review_markdown,
    server_config = EXCLUDED.server_config,
    scope_id = EXCLUDED.scope_id,
    is_active = EXCLUDED.is_active,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.skills (
    id, scope_id, name, slug, description, content_markdown, is_active, is_global, is_dedicated
)
VALUES
    (
        '99999999-9999-4999-8999-999999999901',
        '88888888-8888-4888-8888-888888888801',
        'Skill/Tool 设计',
        'aibase-capability-design',
        '辅助设计 Scope、Tool、Skill 结构与指令内容',
        E'# AI 能力设计助手\n\n你是 EADAF AI 管理能力设计助手，帮助管理员规划并创建 Tool、Skill。\n\n## 概念\n- **AI 能力 Scope**（`aibase.scopes`）：AI Chat 路由与 Tool 分组，如 `business-data`、`ai-management`、`member-org`\n- **业务域 Scope**（bizdata）：实体 code 前缀，如 `equipment`；用 `eadaf_list_bizdata_scopes` 或 `bizdata_list_entities` 查询，**禁止**用 `aibase_create_scope` 创建业务域\n- **Tool**：可调用函数，functionName 全局唯一（snake_case）\n- **Skill**：系统提示与 Tool 组合，slug 为 Skill ID\n\n## 页面上下文\n- 用 `aibase_read_surfaces` 读取当前页面表单/列表状态\n\n## 设计流程\n1. `aibase_read_surfaces` 或 `aibase_list_*` 了解现状\n2. 业务域范围：先 `eadaf_list_bizdata_scopes` 确认 bizdata 前缀\n3. 设计 Tool：`executionType` 选 client（前端注册）或 server_builtin（后端 handler）\n4. 设计 Skill：编写 contentMarkdown 指令，用 toolIds 关联 Tool\n\n## Tool 设计要点\n- parametersSchema 使用 JSON Schema\n- client Tool 需在前端 registerFunctionCall 注册同名 handler\n- reviewMarkdown 描述 Tool 调用后的展示说明\n\n## Skill 设计要点\n- 应用范围：全局（isGlobal）或专用（isDedicated + applicationIds），二者互斥\n- contentMarkdown 写清角色、流程、注意事项\n- **阶段边界**：每个业务 Skill 只覆盖一个阶段；默认「一次一事」，跨阶段用 A2UI 下一步引导\n- **Tool 对齐**：Skill 的 toolIds 须与前端 registerFunctionCall / 后端 handler 一致；LLM 仅能看到 Skill 关联 Tool\n- **完成引导**：阶段完成后输出 a2ui-commands 块（见 aibase-chat-framework），勿向用户提及内部协议\n\n## UI 同步\n- 写操作成功后列表/表单页会自动刷新，**不要**提示用户手动刷新\n\n## 注意\n- slug / functionName 创建后谨慎修改\n- AI Scopes 管理菜单暂未开放，勿引导用户访问 `/ai_management/scopes`\n- 先预览再创建，避免重复',
        true,
        false,
        true
    ),
    (
        '99999999-9999-4999-8999-999999999902',
        '88888888-8888-4888-8888-888888888801',
        'Skill/Tool 管理',
        'aibase-capability-manage',
        '辅助查看、维护与调整已有 Scope、Tool、Skill',
        E'# AI 能力管理助手\n\n你是 EADAF AI 管理能力维护助手，帮助管理员查看和维护已有 Tool、Skill 配置。\n\n## 页面上下文\n- 用 `aibase_read_surfaces` 读取当前页面表单/列表状态\n\n## 业务域 vs AI 能力域\n- **业务域 Scope**：bizdata 实体 code 前缀（如 `equipment`），用 `eadaf_list_bizdata_scopes` / `bizdata_list_entities`\n- **AI 能力 Scope**：`aibase.scopes`，管理菜单暂未开放，勿引导访问 `/ai_management/scopes`\n\n## 常用操作\n1. `aibase_read_surfaces` 或 `aibase_list_*` 浏览列表\n2. `aibase_get_*` 查看详情\n3. `aibase_update_*` 修改描述、参数、指令内容、关联关系\n\n## 管理要点\n- 用 isActive=false 停用而非直接删除\n- 调整 Skill 的 toolIds 可变更其可用工具集\n- 专用 Skill 需维护 applicationIds\n- 全局 Skill 设置 isGlobal=true\n\n## UI 同步\n- 写操作成功后列表/表单页会自动刷新，**不要**提示用户手动刷新\n\n## 排查建议\n- Tool 不生效：检查 executionType、functionName 是否与前端/后端 handler 一致\n- Skill 不出现：检查 isActive、应用范围与 Scope 绑定\n\n## 注意\n- 修改前先用 get 接口确认当前配置\n- 批量变更前先向用户确认影响范围',
        true,
        false,
        true
    )
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    content_markdown = EXCLUDED.content_markdown,
    scope_id = EXCLUDED.scope_id,
    is_active = EXCLUDED.is_active,
    is_global = EXCLUDED.is_global,
    is_dedicated = EXCLUDED.is_dedicated,
    updated_at = CURRENT_TIMESTAMP;

DELETE FROM aibase.skill_tools
WHERE skill_id IN (
    SELECT id FROM aibase.skills WHERE slug IN ('aibase-capability-design', 'aibase-capability-manage')
);

INSERT INTO aibase.skill_tools (skill_id, tool_id, sort_order)
SELECT s.id, t.id, row_number() OVER (PARTITION BY s.slug ORDER BY t.function_name) - 1
FROM aibase.skills s
CROSS JOIN aibase.tools t
WHERE s.slug = 'aibase-capability-design'
  AND t.scope_id = '88888888-8888-4888-8888-888888888801'
  AND t.function_name IN (
    'aibase_list_scopes', 'aibase_get_scope', 'aibase_create_scope', 'aibase_update_scope',
    'aibase_list_tools', 'aibase_get_tool', 'aibase_create_tool', 'aibase_update_tool',
    'aibase_list_skills', 'aibase_get_skill', 'aibase_create_skill', 'aibase_update_skill',
    'aibase_read_surfaces'
  )
ON CONFLICT DO NOTHING;

INSERT INTO aibase.skill_tools (skill_id, tool_id, sort_order)
SELECT s.id, t.id, row_number() OVER (PARTITION BY s.slug ORDER BY t.function_name) - 1
FROM aibase.skills s
CROSS JOIN aibase.tools t
WHERE s.slug = 'aibase-capability-manage'
  AND t.scope_id = '88888888-8888-4888-8888-888888888801'
  AND t.function_name IN (
    'aibase_list_scopes', 'aibase_get_scope', 'aibase_update_scope',
    'aibase_list_tools', 'aibase_get_tool', 'aibase_update_tool',
    'aibase_list_skills', 'aibase_get_skill', 'aibase_update_skill',
    'aibase_read_surfaces'
  )
ON CONFLICT DO NOTHING;
