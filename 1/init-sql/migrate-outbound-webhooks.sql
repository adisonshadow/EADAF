-- 外部 API 提交（Outbound Webhook）模块
-- 可重复执行
BEGIN;

CREATE TABLE IF NOT EXISTS bizdata.outbound_webhooks (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                   VARCHAR(255) NOT NULL,
  name                   VARCHAR(128) NOT NULL,
  description            TEXT,
  status                 VARCHAR(20) NOT NULL DEFAULT 'draft',
  trigger_type           VARCHAR(50) NOT NULL DEFAULT 'api_hook',
  trigger_api_service_id UUID,
  trigger_api_service_code VARCHAR(255),
  target_url             TEXT NOT NULL,
  http_method            VARCHAR(10) NOT NULL DEFAULT 'POST',
  auth_type              VARCHAR(20) NOT NULL DEFAULT 'none',
  auth_send_mode         VARCHAR(20),
  auth_key_name          VARCHAR(128),
  auth_secret_enc        TEXT,
  request_structure      TEXT,
  request_example        TEXT,
  transform_script       TEXT,
  mock_data              TEXT,
  response_config        JSONB,
  version                INTEGER NOT NULL DEFAULT 0,
  published_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS outbound_webhooks_code_key ON bizdata.outbound_webhooks(code);
COMMENT ON TABLE bizdata.outbound_webhooks IS '外部 API 提交配置：业务 API 成功后触发处置脚本 → POST 外部 API';

CREATE TABLE IF NOT EXISTS bizdata.outbound_webhook_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id       UUID NOT NULL REFERENCES bizdata.outbound_webhooks(id) ON DELETE CASCADE,
  run_type         VARCHAR(20) NOT NULL,
  trigger_data     JSONB,
  transformed_body JSONB,
  response_status  INTEGER,
  response_body    TEXT,
  status           VARCHAR(20) NOT NULL DEFAULT 'success',
  error_message    TEXT,
  duration_ms      INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_outbound_webhook_runs_webhook_id ON bizdata.outbound_webhook_runs(webhook_id);
COMMENT ON TABLE bizdata.outbound_webhook_runs IS '外部 API 提交执行历史';

COMMIT;
