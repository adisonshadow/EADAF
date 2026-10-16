-- 为已有数据库增加「首次登录须改密」标记
ALTER TABLE eadaf.users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN eadaf.users.must_change_password IS '是否须修改默认密码（新建或管理员重置后为 true）';
