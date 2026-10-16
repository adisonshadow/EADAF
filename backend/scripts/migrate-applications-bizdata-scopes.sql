ALTER TABLE eadaf.applications
  ADD COLUMN IF NOT EXISTS bizdata_scope_codes JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN eadaf.applications.bizdata_scope_codes IS '业务数据 Scope 编码列表（与 bizdata 实体 code 路径前缀对应）';
