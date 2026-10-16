-- 安装pgcrypto扩展
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 生成部门层级数据
WITH RECURSIVE dept_root AS (
  INSERT INTO eadaf.departments (name, parent_id, status, description)
  VALUES ('总部', null, 'ACTIVE', '公司总部')
  RETURNING department_id, name
),
dept_level1 AS (
  INSERT INTO eadaf.departments (name, parent_id, status, description)
  SELECT v.name, dr.department_id, 'ACTIVE', v.description
  FROM dept_root dr,
  (VALUES 
    ('技术部', '技术研发部门'),
    ('运维部', '运维支持部门')
  ) AS v(name, description)
  RETURNING department_id, name
),
dept_level2 AS (
  INSERT INTO eadaf.departments (name, parent_id, status, description)
  SELECT v.name, dl.department_id, 'ACTIVE', v.description
  FROM dept_level1 dl,
  (VALUES 
    ('开发一组', '开发一组'),
    ('开发二组', '开发二组')
  ) AS v(name, description)
  WHERE dl.name = '技术部'
  RETURNING department_id
),
role_data AS (
  INSERT INTO eadaf.roles (role_name, code, description)
  VALUES 
    ('系统管理员', 'ADMIN', '系统最高权限管理员'),
    ('部门主管', 'MANAGER', '部门负责人'),
    ('普通员工', 'STAFF', '普通用户')
  RETURNING role_id
),
perm_data AS (
  INSERT INTO eadaf.permissions (permission_id, code, description, resource_type, actions, status, created_at, updated_at) VALUES
  -- MENU类型权限（只有read操作）
  ('550e8400-e29b-41d4-a716-446655440001', 'system:manage', '系统管理', 'MENU', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('550e8400-e29b-41d4-a716-446655440002', 'user:manage', '用户管理', 'MENU', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('550e8400-e29b-41d4-a716-446655440003', 'role:manage', '角色管理', 'MENU', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('550e8400-e29b-41d4-a716-446655440004', 'permission:manage', '权限管理', 'MENU', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('550e8400-e29b-41d4-a716-446655440005', 'department:manage', '部门管理', 'MENU', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('550e8400-e29b-41d4-a716-446655440006', 'application:manage', '应用', 'MENU', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('550e8400-e29b-41d4-a716-446655440007', 'log:manage', '日志管理', 'MENU', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  
  -- BUTTON类型权限（只有read操作）
  ('550e8400-e29b-41d4-a716-446655440008', 'user:create', '创建用户', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('550e8400-e29b-41d4-a716-446655440009', 'user:edit', '编辑用户', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('550e8400-e29b-41d4-a716-446655440010', 'user:delete', '删除用户', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('550e8400-e29b-41d4-a716-446655440011', 'user:import', '导入用户', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('550e8400-e29b-41d4-a716-446655440012', 'user:export', '导出用户', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('550e8400-e29b-41d4-a716-446655440013', 'role:create', '创建角色', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('550e8400-e29b-41d4-a716-446655440014', 'role:edit', '编辑角色', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('550e8400-e29b-41d4-a716-446655440015', 'role:delete', '删除角色', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('550e8400-e29b-41d4-a716-446655440016', 'role:assign', '分配权限', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('550e8400-e29b-41d4-a716-446655440017', 'department:create', '创建部门', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('550e8400-e29b-41d4-a716-446655440018', 'department:edit', '编辑部门', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('550e8400-e29b-41d4-a716-446655440019', 'department:delete', '删除部门', 'BUTTON', '["read"]', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  -- 注：内置 API 权限已迁移至独立清单（backend/src/services/builtinApi/catalog.js）
  --     及限制配置表 eadaf.builtin_api_configs，不再由 permissions(resource_type='API') 承载
  RETURNING permission_id
)
SELECT 1;

-- 构建部门闭包关系
WITH RECURSIVE dept_hierarchy AS (
  -- 基础节点
  SELECT 
    department_id,
    department_id as root_id,
    0 as depth
  FROM eadaf.departments
  UNION ALL
  -- 递归部分
  SELECT
    d.department_id,
    h.root_id,
    h.depth + 1
  FROM eadaf.departments d
  JOIN dept_hierarchy h ON d.parent_id = h.department_id
)
INSERT INTO eadaf.department_closure (ancestor_id, descendant_id, depth)
SELECT root_id, department_id, depth
FROM dept_hierarchy;

-- 生成100个测试用户
INSERT INTO eadaf.users (
  user_id,
  username,
  password_hash,
  name,
  avatar,
  gender,
  email,
  phone,
  status,
  department_id,
  created_at,
  updated_at,
  deleted_at
)
SELECT 
  gen_random_uuid(),
  'user_'||s.id,
  '$2a$10$8c90r1pL61cViUzyWnGb.OesyqAoTSuWf6pfWVhSBVvaNFnuJko9.',  -- 123456 的 bcrypt 哈希
  CASE WHEN s.id % 3 = 0 THEN '张三' || s.id
       WHEN s.id % 3 = 1 THEN '李四' || s.id
       ELSE '王五' || s.id END,  -- 姓名
  CASE WHEN s.id % 5 = 0 THEN 'https://example.com/avatars/' || s.id || '.jpg'
       ELSE NULL END,  -- 头像
  CASE WHEN s.id % 3 = 0 THEN 'MALE'
       WHEN s.id % 3 = 1 THEN 'FEMALE'
       ELSE 'OTHER' END,  -- 性别
  'user_'||s.id||'@test.com',
  '1380000'||LPAD(s.id::text, 4, '0'),
  CASE WHEN s.id%10=0 THEN 'ARCHIVED' ELSE 'ACTIVE' END,
  (SELECT department_id FROM eadaf.departments ORDER BY random() LIMIT 1),  -- 随机分配部门
  CURRENT_TIMESTAMP,  -- 创建时间
  CURRENT_TIMESTAMP,  -- 更新时间
  CASE WHEN s.id%10=0 THEN CURRENT_TIMESTAMP ELSE NULL END  -- 删除时间
FROM generate_series(1,100) s(id);

-- 分配角色权限
INSERT INTO eadaf.role_permissions
SELECT r.role_id, p.permission_id
FROM eadaf.roles r
CROSS JOIN eadaf.permissions p
WHERE r.role_name = '系统管理员';

-- 分配用户角色
INSERT INTO eadaf.user_roles
SELECT 
  u.user_id,
  r.role_id
FROM eadaf.users u
CROSS JOIN eadaf.roles r
WHERE r.role_name = '普通员工'
AND u.status = 'ACTIVE';

-- 生成数据权限规则
INSERT INTO eadaf.data_permission_rules (role_id, resource_type, conditions)
SELECT 
  r.role_id,
  'user',
  jsonb_build_object(
    'department_id', d.department_id,
    'permission_level', 'read'
  )
FROM eadaf.roles r
CROSS JOIN eadaf.departments d
WHERE r.role_name = '部门主管';

-- 生成操作日志样例
INSERT INTO eadaf.operation_logs
SELECT 
  gen_random_uuid(),
  u.user_id,
  'BATCH_IMPORT',
  'user',
  gen_random_uuid()::text,
  null,
  jsonb_build_object('count', 100, 'type', 'users'),
  'SUCCESS',
  null,
  now()
FROM eadaf.users u
WHERE u.status = 'ACTIVE'
LIMIT 5;

-- 生成刷新令牌样例
INSERT INTO eadaf.refresh_tokens
SELECT 
  gen_random_uuid(),
  u.user_id,
  gen_random_uuid()::text,
  now() + interval '7 days',
  'ACTIVE',
  now()
FROM eadaf.users u
WHERE u.status = 'ACTIVE'
LIMIT 10;

-- 插入应用端模拟数据
INSERT INTO eadaf.applications (name, code, status, sso_enabled, sso_config, description) VALUES
('人力资源管理系统', 'HRMS', 'ACTIVE', true, '{"client_id": "hrms-client", "client_secret": "hrms-secret", "redirect_uri": "http://hrms.example.com/callback"}', '公司人力资源管理系统'),
('客户关系管理系统', 'CRM', 'ACTIVE', true, '{"client_id": "crm-client", "client_secret": "crm-secret", "redirect_uri": "http://crm.example.com/callback"}', '客户关系管理系统'),
('办公自动化系统', 'OA', 'ACTIVE', false, NULL, '办公自动化系统'),
('知识管理系统', 'KMS', 'DISABLED', false, NULL, '公司知识管理系统');