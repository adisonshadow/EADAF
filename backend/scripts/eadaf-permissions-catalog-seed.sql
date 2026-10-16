-- 权限目录扩展：对齐 EADAF_frontend 菜单模块 + equipment 受限角色模板
-- 可重复执行（permissions.code / roles.code UPSERT）

INSERT INTO eadaf.permissions (permission_id, code, description, resource_type, actions, status, created_at, updated_at)
VALUES
  -- MENU
  ('660e8400-e29b-41d4-a716-446655440033', 'member_org:manage', '成员与组织', 'MENU', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-446655440034', 'business_data:manage', '业务数据', 'MENU', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-446655440035', 'api_services:manage', 'API 服务', 'MENU', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-446655440036', 'file_storage:manage', '文件', 'MENU', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-446655440037', 'ai_management:manage', 'AI 管理', 'MENU', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-446655440038', 'app_deployment:manage', '应用部署', 'MENU', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-446655440090', 'system:manage', '系统管理', 'MENU', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  -- BUTTON：成员
  ('660e8400-e29b-41d4-a716-446655440040', 'member:create', '创建成员', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-446655440041', 'member:edit', '编辑成员', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-446655440042', 'member:delete', '删除成员', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-446655440043', 'member:assign_role', '分配成员角色', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  -- BUTTON：权限
  ('660e8400-e29b-41d4-a716-446655440044', 'permission:create', '创建权限', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-446655440045', 'permission:edit', '编辑权限', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-446655440046', 'permission:delete', '删除权限', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  -- BUTTON：应用
  ('660e8400-e29b-41d4-a716-446655440047', 'application:create', '创建应用', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-446655440048', 'application:edit', '编辑应用', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  -- BUTTON：文件
  ('660e8400-e29b-41d4-a716-446655440049', 'storage:bucket:manage', 'Bucket 管理', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-44665544004a', 'storage:browser:read', '文件浏览', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  -- BUTTON：业务数据
  ('660e8400-e29b-41d4-a716-44665544004b', 'bizdata:entity:create', '创建数据实体', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-44665544004c', 'bizdata:entity:edit', '编辑数据实体', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-44665544004d', 'bizdata:entity:delete', '删除数据实体', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-44665544004e', 'bizdata:materialize:execute', '执行物化', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-44665544007a', 'business_data:metrics:view', '查看指标', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-44665544007b', 'business_data:metrics:manage', '管理指标', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-44665544007c', 'business_data:metrics:execute', '执行指标计算', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-446655440080', 'business_data:data_standards:manage', '管理数据标准', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-446655440081', 'business_data:metadata:manage', '管理元数据', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-446655440082', 'business_data:collection_pipeline:read', '查看采集管道', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-446655440083', 'business_data:collection_pipeline:manage', '管理采集管道', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-446655440082', 'system:settings:manage', '系统设置', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  -- BUTTON：API 服务
  ('660e8400-e29b-41d4-a716-44665544004f', 'apiservice:create', '创建 API 服务', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-446655440050', 'apiservice:edit', '编辑 API 服务', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-446655440051', 'apiservice:publish', '发布 API 服务', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  -- BUTTON：AI 管理（不含 Scopes 子菜单）
  ('660e8400-e29b-41d4-a716-446655440052', 'aibase:provider:manage', 'AI 服务商管理', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-446655440053', 'aibase:model:manage', 'AI 模型管理', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-446655440054', 'aibase:tool:manage', 'AI Tool 管理', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('660e8400-e29b-41d4-a716-446655440055', 'aibase:skill:manage', 'AI Skill 管理', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  -- 注：内置 API 权限已迁移至独立清单（backend/src/services/builtinApi/catalog.js）
  --     及限制配置表 eadaf.builtin_api_configs，不再由 permissions(resource_type='API') 承载
ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  resource_type = EXCLUDED.resource_type,
  actions = EXCLUDED.actions,
  status = EXCLUDED.status,
  updated_at = CURRENT_TIMESTAMP;

-- equipment 域：数据模型 + API 服务 操作员角色模板
INSERT INTO eadaf.roles (role_id, role_name, code, description, status, created_at, updated_at)
VALUES (
  '660e8400-e29b-41d4-a716-446655440100',
  'equipment:数据与API操作员',
  'equipment:data-operator',
  '仅限 equipment 业务域的数据模型设计与 API 服务管理',
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT (code) DO UPDATE SET
  role_name = EXCLUDED.role_name,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  updated_at = CURRENT_TIMESTAMP;

DELETE FROM eadaf.role_permissions
WHERE role_id = '660e8400-e29b-41d4-a716-446655440100';

INSERT INTO eadaf.role_permissions (role_id, permission_id)
SELECT '660e8400-e29b-41d4-a716-446655440100', p.permission_id
FROM eadaf.permissions p
WHERE p.code IN (
  'business_data:manage',
  'api_services:manage',
  'bizdata:entity:create',
  'bizdata:entity:edit',
  'bizdata:entity:delete',
  'apiservice:create',
  'apiservice:edit',
  'apiservice:publish'
);

-- 数据权限规则：equipment Scope 限定（运行时 enforcement 待接入）
DELETE FROM eadaf.data_permission_rules
WHERE role_id = '660e8400-e29b-41d4-a716-446655440100'
  AND resource_type = 'bizdata_scope';

INSERT INTO eadaf.data_permission_rules (rule_id, role_id, resource_type, conditions, status, created_at, updated_at)
VALUES (
  '660e8400-e29b-41d4-a716-446655440101',
  '660e8400-e29b-41d4-a716-446655440100',
  'bizdata_scope',
  '{"bizdata_scope_codes":["equipment"],"allowed_modules":["business_data","api_services"],"note":"仅限 equipment 域实体与 API 服务"}'::jsonb,
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
