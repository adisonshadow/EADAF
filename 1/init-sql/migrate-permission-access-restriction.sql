-- 权限表增加 access_restriction 列（菜单/按钮访问策略：无限制/角色/组织）
-- 用于菜单/按钮权限的运行时可见性强制
-- 可重复执行
ALTER TABLE eadaf.permissions
  ADD COLUMN IF NOT EXISTS access_restriction JSONB;
COMMENT ON COLUMN eadaf.permissions.access_restriction IS '访问限制 {mode:none|role|department, roleIds:[], departmentIds:[]}；用于菜单/按钮运行时可见性';
