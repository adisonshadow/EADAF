-- 内置 API 清单化系统迁移
-- 1. 新建限制配置表 eadaf.builtin_api_configs（承载角色/组织限制配置）
-- 2. eadaf.applications 增加 builtin_api_scope（应用可访问内置API授权）
-- 3. 清理 Permission 表内置 API 存量及其 RolePermission 关联（Permission 表退出内置 API）
-- 可重复执行（IF [NOT] EXISTS / 幂等清理）

BEGIN;

-- 1. 内置 API 限制配置表
CREATE TABLE IF NOT EXISTS eadaf.builtin_api_configs (
  code              VARCHAR(100) PRIMARY KEY,
  access_restriction JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE  eadaf.builtin_api_configs IS '内置 API 限制配置（code 对应代码常量 catalog.js 清单）';
COMMENT ON COLUMN eadaf.builtin_api_configs.code IS '内置 API 清单 code（业务域:资源[:动作]）';
COMMENT ON COLUMN eadaf.builtin_api_configs.access_restriction IS '访问限制 {mode:role|department, roleIds:[], departmentIds:[]}';

-- 2. 应用表增加 builtin_api_scope
ALTER TABLE eadaf.applications
  ADD COLUMN IF NOT EXISTS builtin_api_scope JSONB NOT NULL DEFAULT '{"permissionCodes":[]}'::jsonb;
COMMENT ON COLUMN eadaf.applications.builtin_api_scope IS '可访问内置API：{permissionCodes:[...]}';

-- 3. 清理 Permission 表内置 API 存量（resource_type=''API''），及其角色关联
--    内置 API 改由 builtin_api_configs 承载限制，Permission 不再参与内置 API
DELETE FROM eadaf.role_permissions
 WHERE permission_id IN (SELECT permission_id FROM eadaf.permissions WHERE resource_type = 'API');

DELETE FROM eadaf.permissions WHERE resource_type = 'API';

COMMIT;
