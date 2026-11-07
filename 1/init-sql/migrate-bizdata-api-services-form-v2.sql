-- API 服务表单 v2：Scope、脚本模式、Handler、请求参数 interface

ALTER TABLE bizdata.api_services
  ADD COLUMN IF NOT EXISTS scope_code VARCHAR(255),
  ADD COLUMN IF NOT EXISTS script_mode VARCHAR(16) NOT NULL DEFAULT 'sql',
  ADD COLUMN IF NOT EXISTS handler_script TEXT,
  ADD COLUMN IF NOT EXISTS request_parameter_interface TEXT;

CREATE INDEX IF NOT EXISTS idx_api_services_scope_code ON bizdata.api_services (scope_code);

COMMENT ON COLUMN bizdata.api_services.scope_code IS '绑定的数据模型 Scope（单选）';
COMMENT ON COLUMN bizdata.api_services.script_mode IS 'sql | typescript';
COMMENT ON COLUMN bizdata.api_services.handler_script IS 'TypeScript/JavaScript Handler 源码';
COMMENT ON COLUMN bizdata.api_services.request_parameter_interface IS '设计期请求参数 TypeScript interface 文本';
