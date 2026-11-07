-- 应用：提交外部 API 授权范围
-- 可重复执行
BEGIN;

ALTER TABLE eadaf.applications
  ADD COLUMN IF NOT EXISTS outbound_webhook_scope JSONB NOT NULL DEFAULT '{"domainCodes":[],"webhookCodes":[]}'::jsonb;

COMMENT ON COLUMN eadaf.applications.outbound_webhook_scope IS
  '可关联的提交外部API：{domainCodes:[], webhookCodes:[]}';

COMMIT;
