-- EADAF 成员与权限 AI Scope / Skill / Tools 种子

INSERT INTO aibase.scopes (id, name, slug, description, is_active)
VALUES (
    '77777777-7777-4777-8777-777777777710',
    '成员与权限',
    'member-org',
    'EADAF 成员、角色、权限与数据规则管理',
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
        '77777777-7777-4777-8777-777777777711',
        '77777777-7777-4777-8777-777777777710',
        '列出用户',
        'eadaf-list-users',
        'eadaf_list_users',
        '分页列出系统用户，支持 username/name/status 筛选。禁止 size=-1；拉较多数据用 page=1&size=500，或改用 eadaf_filter_users',
        'client',
        '{"type":"object","properties":{"page":{"type":"integer","description":"页码，从 1 起"},"size":{"type":"integer","description":"每页条数，1–500；禁止 -1","minimum":1,"maximum":500},"username":{"type":"string"},"name":{"type":"string"},"status":{"type":"string","enum":["ACTIVE","DISABLED","ARCHIVED"]}}}'::jsonb,
        E'## eadaf_list_users\n\n- **禁止** `size=-1`（用户接口不支持，会 HTTP 500）\n- 拉较多数据：`page=1&size=500`\n- 按条件检索优先 `eadaf_filter_users`（内部固定 size=500）',
        '{}'::jsonb,
        true
    ),
    (
        '77777777-7777-4777-8777-777777777712',
        '77777777-7777-4777-8777-777777777710',
        '获取用户详情',
        'eadaf-get-user',
        'eadaf_get_user',
        '按 user_id 获取用户详情（含角色）',
        'client',
        '{"type":"object","properties":{"userId":{"type":"string"}},"required":["userId"]}'::jsonb,
        '## eadaf_get_user',
        '{}'::jsonb,
        true
    ),
    (
        '77777777-7777-4777-8777-777777777713',
        '77777777-7777-4777-8777-777777777710',
        '创建用户',
        'eadaf-create-user',
        'eadaf_create_user',
        '创建新用户并可选绑定角色',
        'client',
        '{"type":"object","properties":{"username":{"type":"string"},"password":{"type":"string"},"name":{"type":"string"},"email":{"type":"string"},"phone":{"type":"string"},"gender":{"type":"string","enum":["MALE","FEMALE","OTHER"]},"departmentId":{"type":"string"},"roleIds":{"type":"array","items":{"type":"string"}}},"required":["username","password","name","departmentId"]}'::jsonb,
        E'## eadaf_create_user\n\n- **departmentId 必填**\n- password 可自动生成 6 位数字\n- roleIds 可选，创建时一并绑定',
        '{}'::jsonb,
        true
    ),
    (
        '77777777-7777-4777-8777-777777777714',
        '77777777-7777-4777-8777-777777777710',
        '更新用户',
        'eadaf-update-user',
        'eadaf_update_user',
        '更新用户基本信息',
        'client',
        '{"type":"object","properties":{"userId":{"type":"string"},"name":{"type":"string"},"email":{"type":"string"},"phone":{"type":"string"},"gender":{"type":"string"},"departmentId":{"type":"string"},"status":{"type":"string","enum":["ACTIVE","DISABLED","ARCHIVED"]}},"required":["userId"]}'::jsonb,
        '## eadaf_update_user',
        '{}'::jsonb,
        true
    ),
    (
        '77777777-7777-4777-8777-777777777715',
        '77777777-7777-4777-8777-777777777710',
        '删除用户',
        'eadaf-delete-user',
        'eadaf_delete_user',
        '软删除指定用户',
        'client',
        '{"type":"object","properties":{"userId":{"type":"string"}},"required":["userId"]}'::jsonb,
        '## eadaf_delete_user',
        '{}'::jsonb,
        true
    ),
    (
        '77777777-7777-4777-8777-777777777716',
        '77777777-7777-4777-8777-777777777710',
        '分配用户角色',
        'eadaf-assign-user-roles',
        'eadaf_assign_user_roles',
        '全量替换用户直接绑定的角色',
        'client',
        '{"type":"object","properties":{"userId":{"type":"string"},"roleIds":{"type":"array","items":{"type":"string"}}},"required":["userId","roleIds"]}'::jsonb,
        '## eadaf_assign_user_roles',
        '{}'::jsonb,
        true
    ),
    (
        '77777777-7777-4777-8777-777777777717',
        '77777777-7777-4777-8777-777777777710',
        '列出角色',
        'eadaf-list-roles',
        'eadaf_list_roles',
        '列出系统角色，size=-1 返回全部',
        'client',
        '{"type":"object","properties":{"page":{"type":"integer"},"size":{"type":"integer"},"status":{"type":"string"}}}'::jsonb,
        '## eadaf_list_roles',
        '{}'::jsonb,
        true
    ),
    (
        '77777777-7777-4777-8777-777777777718',
        '77777777-7777-4777-8777-777777777710',
        '获取角色详情',
        'eadaf-get-role',
        'eadaf_get_role',
        '按 role_id 获取角色详情（含权限）',
        'client',
        '{"type":"object","properties":{"roleId":{"type":"string"}},"required":["roleId"]}'::jsonb,
        '## eadaf_get_role',
        '{}'::jsonb,
        true
    ),
    (
        '77777777-7777-4777-8777-777777777719',
        '77777777-7777-4777-8777-777777777710',
        '创建角色',
        'eadaf-create-role',
        'eadaf_create_role',
        '创建新角色',
        'client',
        '{"type":"object","properties":{"roleName":{"type":"string"},"code":{"type":"string"},"description":{"type":"string"},"status":{"type":"string","enum":["ACTIVE","ARCHIVED"]}},"required":["roleName","code"]}'::jsonb,
        E'## eadaf_create_role\n\ncode 支持冒号分层，如 `equipment:data-operator`',
        '{}'::jsonb,
        true
    ),
    (
        '77777777-7777-4777-8777-77777777771a',
        '77777777-7777-4777-8777-777777777710',
        '更新角色',
        'eadaf-update-role',
        'eadaf_update_role',
        '更新角色名称与描述',
        'client',
        '{"type":"object","properties":{"roleId":{"type":"string"},"roleName":{"type":"string"},"description":{"type":"string"}},"required":["roleId"]}'::jsonb,
        '## eadaf_update_role',
        '{}'::jsonb,
        true
    ),
    (
        '77777777-7777-4777-8777-77777777771b',
        '77777777-7777-4777-8777-777777777710',
        '删除角色',
        'eadaf-delete-role',
        'eadaf_delete_role',
        '软删除指定角色',
        'client',
        '{"type":"object","properties":{"roleId":{"type":"string"}},"required":["roleId"]}'::jsonb,
        '## eadaf_delete_role',
        '{}'::jsonb,
        true
    ),
    (
        '77777777-7777-4777-8777-77777777771c',
        '77777777-7777-4777-8777-777777777710',
        '设置角色权限',
        'eadaf-set-role-permissions',
        'eadaf_set_role_permissions',
        '全量替换角色的功能权限',
        'client',
        '{"type":"object","properties":{"roleId":{"type":"string"},"permissionIds":{"type":"array","items":{"type":"string"}}},"required":["roleId","permissionIds"]}'::jsonb,
        '## eadaf_set_role_permissions',
        '{}'::jsonb,
        true
    ),
    (
        '77777777-7777-4777-8777-77777777771d',
        '77777777-7777-4777-8777-777777777710',
        '列出权限',
        'eadaf-list-permissions',
        'eadaf_list_permissions',
        '列出权限，可按 resourceType 筛选',
        'client',
        '{"type":"object","properties":{"page":{"type":"integer"},"size":{"type":"integer"},"resourceType":{"type":"string","enum":["MENU","BUTTON","API"]},"code":{"type":"string"}}}'::jsonb,
        '## eadaf_list_permissions',
        '{}'::jsonb,
        true
    ),
    (
        '77777777-7777-4777-8777-77777777771e',
        '77777777-7777-4777-8777-777777777710',
        '创建权限',
        'eadaf-create-permission',
        'eadaf_create_permission',
        '创建权限',
        'client',
        '{"type":"object","properties":{"code":{"type":"string"},"description":{"type":"string"},"resourceType":{"type":"string","enum":["MENU","BUTTON","API"]},"actions":{"type":"array","items":{"type":"string"}}},"required":["code","resourceType","actions"]}'::jsonb,
        '## eadaf_create_permission',
        '{}'::jsonb,
        true
    ),
    (
        '77777777-7777-4777-8777-77777777771f',
        '77777777-7777-4777-8777-777777777710',
        '更新权限',
        'eadaf-update-permission',
        'eadaf_update_permission',
        '更新权限描述或状态',
        'client',
        '{"type":"object","properties":{"permissionId":{"type":"string"},"description":{"type":"string"},"actions":{"type":"array","items":{"type":"string"}},"status":{"type":"string","enum":["ACTIVE","DISABLED","ARCHIVED"]}},"required":["permissionId"]}'::jsonb,
        '## eadaf_update_permission',
        '{}'::jsonb,
        true
    ),
    (
        '77777777-7777-4777-8777-777777777720',
        '77777777-7777-4777-8777-777777777710',
        '部门树',
        'eadaf-list-departments-tree',
        'eadaf_list_departments_tree',
        '获取组织架构部门树',
        'client',
        '{"type":"object","properties":{}}'::jsonb,
        '## eadaf_list_departments_tree',
        '{}'::jsonb,
        true
    ),
    (
        '77777777-7777-4777-8777-777777777721',
        '77777777-7777-4777-8777-777777777710',
        '列出 bizdata Scope',
        'eadaf-list-bizdata-scopes',
        'eadaf_list_bizdata_scopes',
        '从业务数据实体 code 推导 Scope 树（如 equipment）',
        'client',
        '{"type":"object","properties":{}}'::jsonb,
        E'## eadaf_list_bizdata_scopes\n\n返回 bizdata 业务域 Scope，**不是** aibase.scopes。\n\n设备域 code 前缀通常为 `equipment`。',
        '{}'::jsonb,
        true
    ),
    (
        '77777777-7777-4777-8777-777777777722',
        '77777777-7777-4777-8777-777777777710',
        '创建数据权限规则',
        'eadaf-create-data-rule',
        'eadaf_create_data_rule',
        '为角色创建数据权限规则（如 bizdata_scope 限定）',
        'client',
        '{"type":"object","properties":{"roleId":{"type":"string"},"resourceType":{"type":"string"},"conditions":{"type":"object"}},"required":["roleId","resourceType","conditions"]}'::jsonb,
        E'## eadaf_create_data_rule\n\n### equipment 域示例\n```json\n{\n  "roleId": "<role_id>",\n  "resourceType": "bizdata_scope",\n  "conditions": {\n    "bizdata_scope_codes": ["equipment"],\n    "allowed_modules": ["business_data", "api_services"]\n  }\n}\n```',
        '{}'::jsonb,
        true
    ),
    (
        '77777777-7777-4777-8777-777777777723',
        '77777777-7777-4777-8777-777777777710',
        '列出数据权限规则',
        'eadaf-list-data-rules',
        'eadaf_list_data_rules',
        '列出数据权限规则，可按 roleId / resourceType 筛选',
        'client',
        '{"type":"object","properties":{"roleId":{"type":"string"},"resourceType":{"type":"string"}}}'::jsonb,
        '## eadaf_list_data_rules',
        '{}'::jsonb,
        true
    ),
    (
        '77777777-7777-4777-8777-777777777724',
        '77777777-7777-4777-8777-777777777710',
        '过滤用户',
        'eadaf-filter-users',
        'eadaf_filter_users',
        '按过滤项检索用户，返回命中项（内部固定 page=1&size=500）。勿传 size=-1',
        'client',
        '{"type":"object","properties":{"username":{"type":"string"},"name":{"type":"string"},"email":{"type":"string"},"phone":{"type":"string"},"status":{"type":"string","enum":["ACTIVE","DISABLED","ARCHIVED"]},"departmentId":{"type":"string","description":"部门ID"},"userId":{"type":"string","description":"用户ID精确匹配"}}}'::jsonb,
        E'## eadaf_filter_users\n\n参数全可选；不传则返回最多 500 条。返回 { items, total }。\n\n- 字段名用 camelCase（departmentId/userId）\n- **禁止**对用户接口使用 size=-1',
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
    scope_id = EXCLUDED.scope_id,
    is_active = EXCLUDED.is_active,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO aibase.skills (
    id, scope_id, name, slug, description, content_markdown, is_active, is_global, is_dedicated
)
VALUES (
    '99999999-9999-4999-8999-999999999903',
    '77777777-7777-4777-8777-777777777710',
    '成员与权限管理',
    'eadaf-access-control',
    '用户、角色、权限与 bizdata Scope 数据规则管理助手',
    E'# 成员与权限管理助手\n\n你是 EADAF 访问控制助手，帮助管理员管理成员、角色、权限与数据范围规则。\n\n## 重要：Scope 含义\n- 用户说的「Scope / 设备域 / 业务域」指 **bizdata 实体 code 前缀**（如 `equipment`）\n- 用 `eadaf_list_bizdata_scopes` 或 `bizdata_list_entity_summaries`（浏览）/ `bizdata_get_entity`（详情）查询\n- **禁止**调用 `aibase_create_scope` / `aibase_list_scopes`（AI 能力域 Scope 管理已暂时关闭）\n\n## 列出用户\n- 用 `eadaf_list_users` 或 `eadaf_filter_users`\n- **禁止**传 `size=-1`（用户接口会 500；与角色列表不同）\n- 正确示例：`page=1, size=500`\n\n## 创建用户\n- **departmentId 必填**（先 `eadaf_list_departments_tree`）\n- password 可自动生成 6 位数字并告知用户\n- 用 `eadaf_assign_user_roles` 或创建时传 roleIds 绑定角色\n\n## 受限用户标准流程（例：仅 equipment 域数据模型 + API 服务）\n1. `eadaf_list_bizdata_scopes` 确认 `equipment` 存在\n2. `eadaf_list_roles` 查找 code=`equipment:data-operator`；若无则创建并赋权\n3. `eadaf_list_permissions` 筛选 `business_data:*`、`api_services:*`、`bizdata:*`、`apiservice:*`、`api:bizdata:*`、`api:apiservice:*`\n4. `eadaf_set_role_permissions` 全量设置角色权限\n5. `eadaf_create_data_rule`：`resourceType=bizdata_scope`，conditions 含 `bizdata_scope_codes:["equipment"]`、`allowed_modules:["business_data","api_services"]`\n6. `eadaf_create_user` + 绑定上述角色\n\n## 已有模板\n- 角色 code `equipment:data-operator`（equipment:数据与API操作员）已预置时可复用，无需重复创建\n\n## 权限模型\n- 功能权限：Permission → Role → User\n- 数据规则：`eadaf.data_permission_rules`（配置契约，运行时 enforcement 待接入）\n\n## UI 同步\n- 写操作成功后列表会自动刷新，**不要**提示用户手动刷新',
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
WHERE skill_id = (SELECT id FROM aibase.skills WHERE slug = 'eadaf-access-control');

INSERT INTO aibase.skill_tools (skill_id, tool_id, sort_order)
SELECT s.id, t.id, row_number() OVER (ORDER BY t.function_name) - 1
FROM aibase.skills s
CROSS JOIN aibase.tools t
WHERE s.slug = 'eadaf-access-control'
  AND t.scope_id = '77777777-7777-4777-8777-777777777710'
  AND t.function_name IN (
    'eadaf_list_users', 'eadaf_filter_users', 'eadaf_get_user', 'eadaf_create_user', 'eadaf_update_user', 'eadaf_delete_user',
    'eadaf_assign_user_roles', 'eadaf_list_roles', 'eadaf_get_role', 'eadaf_create_role', 'eadaf_update_role',
    'eadaf_delete_role', 'eadaf_set_role_permissions', 'eadaf_list_permissions', 'eadaf_create_permission',
    'eadaf_update_permission', 'eadaf_list_departments_tree', 'eadaf_list_bizdata_scopes',
    'eadaf_create_data_rule', 'eadaf_list_data_rules'
  )
ON CONFLICT DO NOTHING;

-- 关联跨 scope 的 aibase_read_surfaces
INSERT INTO aibase.skill_tools (skill_id, tool_id, sort_order)
SELECT s.id, t.id, 99
FROM aibase.skills s
CROSS JOIN aibase.tools t
WHERE s.slug = 'eadaf-access-control'
  AND t.function_name = 'aibase_read_surfaces'
ON CONFLICT DO NOTHING;
