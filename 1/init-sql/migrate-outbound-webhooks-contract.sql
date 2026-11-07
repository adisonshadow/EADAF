-- 提交外部 API：契约增强（method / 鉴权 / 请求 Demo / 响应配置）
-- 可重复执行
BEGIN;

ALTER TABLE bizdata.outbound_webhooks
  ADD COLUMN IF NOT EXISTS http_method VARCHAR(10) NOT NULL DEFAULT 'POST';

ALTER TABLE bizdata.outbound_webhooks
  ADD COLUMN IF NOT EXISTS auth_type VARCHAR(20) NOT NULL DEFAULT 'none';

ALTER TABLE bizdata.outbound_webhooks
  ADD COLUMN IF NOT EXISTS auth_send_mode VARCHAR(20);

ALTER TABLE bizdata.outbound_webhooks
  ADD COLUMN IF NOT EXISTS auth_key_name VARCHAR(128);

ALTER TABLE bizdata.outbound_webhooks
  ADD COLUMN IF NOT EXISTS auth_secret_enc TEXT;

ALTER TABLE bizdata.outbound_webhooks
  ADD COLUMN IF NOT EXISTS request_example TEXT;

ALTER TABLE bizdata.outbound_webhooks
  ADD COLUMN IF NOT EXISTS response_config JSONB;

COMMENT ON COLUMN bizdata.outbound_webhooks.http_method IS '出站 HTTP 方法：POST/PUT/PATCH';
COMMENT ON COLUMN bizdata.outbound_webhooks.auth_type IS '鉴权类型：none/bearer/api_key';
COMMENT ON COLUMN bizdata.outbound_webhooks.auth_send_mode IS 'api_key 发送方式：header/query';
COMMENT ON COLUMN bizdata.outbound_webhooks.auth_key_name IS '鉴权头名或 Query 参数名';
COMMENT ON COLUMN bizdata.outbound_webhooks.auth_secret_enc IS '鉴权密钥密文（AES-GCM）';
COMMENT ON COLUMN bizdata.outbound_webhooks.request_example IS '发往外部的请求 Demo JSON';
COMMENT ON COLUMN bizdata.outbound_webhooks.response_config IS '成功/异常响应契约与判定规则 JSON';

COMMIT;
