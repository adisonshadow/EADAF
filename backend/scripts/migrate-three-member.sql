-- 三员：用户身份（可空）与菜单/按钮职责（默认业务）。可重复执行。
ALTER TABLE eadaf.users
  ADD COLUMN IF NOT EXISTS three_member_role VARCHAR(32);

ALTER TABLE eadaf.permissions
  ADD COLUMN IF NOT EXISTS three_member_duty VARCHAR(32) DEFAULT 'business';

COMMENT ON COLUMN eadaf.users.three_member_role IS '三员身份：system_admin | security_admin | auditor；空为普通用户';
COMMENT ON COLUMN eadaf.permissions.three_member_duty IS '三员职责：business | system_admin | security_admin | auditor';
