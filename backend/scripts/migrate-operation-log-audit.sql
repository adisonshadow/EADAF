-- 操作日志审计增强：操作者、域、请求上下文、查询索引
-- 幂等，可重复执行

BEGIN;

ALTER TABLE eadaf.operation_logs
  ADD COLUMN IF NOT EXISTS operator_id UUID,
  ADD COLUMN IF NOT EXISTS operator_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS operator_type VARCHAR(20) NOT NULL DEFAULT 'USER',
  ADD COLUMN IF NOT EXISTS application_id UUID,
  ADD COLUMN IF NOT EXISTS resource_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS domain VARCHAR(50),
  ADD COLUMN IF NOT EXISTS ip VARCHAR(45),
  ADD COLUMN IF NOT EXISTS user_agent VARCHAR(500),
  ADD COLUMN IF NOT EXISTS trace_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS request_summary JSONB;

ALTER TABLE eadaf.operation_logs
  ALTER COLUMN resource_id TYPE VARCHAR(200);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'operation_logs_operator_type_check'
  ) THEN
    ALTER TABLE eadaf.operation_logs
      ADD CONSTRAINT operation_logs_operator_type_check
      CHECK (operator_type IN ('USER', 'APPLICATION', 'SYSTEM', 'ANONYMOUS'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at
  ON eadaf.operation_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_logs_operator_id
  ON eadaf.operation_logs (operator_id);
CREATE INDEX IF NOT EXISTS idx_operation_logs_domain_created_at
  ON eadaf.operation_logs (domain, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_logs_trace_id
  ON eadaf.operation_logs (trace_id);

COMMENT ON COLUMN eadaf.operation_logs.operator_id IS '操作者用户ID（USER 型）；APPLICATION 型可为空';
COMMENT ON COLUMN eadaf.operation_logs.operator_name IS '操作者名称快照（用户名/应用名）';
COMMENT ON COLUMN eadaf.operation_logs.operator_type IS '操作者类型 USER|APPLICATION|SYSTEM|ANONYMOUS';
COMMENT ON COLUMN eadaf.operation_logs.application_id IS '应用令牌操作时的 application_id';
COMMENT ON COLUMN eadaf.operation_logs.resource_name IS '资源名称快照';
COMMENT ON COLUMN eadaf.operation_logs.domain IS '所属模块域（user/role/bizdata/...）';
COMMENT ON COLUMN eadaf.operation_logs.request_summary IS '请求摘要 {method,path,statusCode,bodyKeys}';

-- 查询权限默认限 SUPER_ADMIN
INSERT INTO eadaf.builtin_api_configs (code, access_restriction) VALUES
  ('system:operation_log:list', '{"mode":"role","roleIds":["10000000-0000-0000-0000-000000000001"]}'::jsonb),
  ('system:operation_log:get',  '{"mode":"role","roleIds":["10000000-0000-0000-0000-000000000001"]}'::jsonb)
ON CONFLICT (code) DO UPDATE SET access_restriction = EXCLUDED.access_restriction;

COMMIT;
