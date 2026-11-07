-- 权限目录：对齐 EADAF 菜单与按钮。安装包只带这些权限码，不带业务域角色模板。
-- 可重复执行（permissions.code UPSERT）

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
  ('660e8400-e29b-41d4-a716-446655440084', 'system:settings:manage', '系统设置', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
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
