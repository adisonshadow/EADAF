-- MS6：api_request_logs 增加 turn / tool 审计字段
ALTER TABLE aibase.api_request_logs
  ADD COLUMN IF NOT EXISTS turn_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS tool_function_name VARCHAR(128),
  ADD COLUMN IF NOT EXISTS tool_execution_type VARCHAR(32);

CREATE INDEX IF NOT EXISTS idx_api_request_logs_turn_id
  ON aibase.api_request_logs (turn_id);
