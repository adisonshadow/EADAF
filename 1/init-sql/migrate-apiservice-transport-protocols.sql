-- API 服务访问协议：HTTP / SSE / WebSocket

ALTER TABLE bizdata.api_services
    ADD COLUMN IF NOT EXISTS transport_protocols JSONB NOT NULL DEFAULT '["http"]'::jsonb;

UPDATE bizdata.api_services
SET transport_protocols = '["http"]'::jsonb
WHERE transport_protocols IS NULL OR transport_protocols = '[]'::jsonb;
