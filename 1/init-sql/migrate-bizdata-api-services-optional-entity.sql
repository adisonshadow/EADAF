-- API 服务：实体可选，支持跨实体 SQL 脚本

ALTER TABLE bizdata.api_services
  ALTER COLUMN entity_id DROP NOT NULL,
  ALTER COLUMN entity_code DROP NOT NULL,
  ALTER COLUMN table_name DROP NOT NULL;

ALTER TABLE bizdata.api_services
  ADD COLUMN IF NOT EXISTS definition_script TEXT;

COMMENT ON COLUMN bizdata.api_services.definition_script IS '服务主 SQL/脚本，可跨表 JOIN、聚合等';
COMMENT ON COLUMN bizdata.api_services.entity_id IS '可选：单实体 CRUD 模板时使用';
