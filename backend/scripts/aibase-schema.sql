-- AIBase AI 模型网关 Schema
-- 独立 schema，与 eadaf 解耦

CREATE SCHEMA IF NOT EXISTS aibase;

CREATE TABLE IF NOT EXISTS aibase.providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    base_url VARCHAR(500) NOT NULL,
    api_key_encrypted TEXT,
    adapter_type VARCHAR(50) NOT NULL DEFAULT 'openai_compatible',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS aibase.models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES aibase.providers(id),
    slug VARCHAR(100) NOT NULL UNIQUE,
    model_id VARCHAR(200) NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    default_params JSONB,
    rate_limit JSONB,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider_id, model_id)
);

CREATE TABLE IF NOT EXISTS aibase.model_capabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES aibase.models(id) ON DELETE CASCADE,
    capability VARCHAR(50) NOT NULL,
    UNIQUE(model_id, capability)
);

CREATE INDEX IF NOT EXISTS idx_model_capabilities_capability
    ON aibase.model_capabilities(capability);

CREATE TABLE IF NOT EXISTS aibase.model_io_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES aibase.models(id) ON DELETE CASCADE,
    direction VARCHAR(10) NOT NULL CHECK(direction IN ('input', 'output')),
    modality VARCHAR(50) NOT NULL,
    UNIQUE(model_id, direction, modality)
);

CREATE TABLE IF NOT EXISTS aibase.api_request_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id VARCHAR(100) NOT NULL,
    slug VARCHAR(100),
    status_code INT NOT NULL,
    duration_ms INT NOT NULL,
    error_code VARCHAR(50),
    turn_id VARCHAR(64),
    tool_function_name VARCHAR(128),
    tool_execution_type VARCHAR(32),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_request_logs_trace_id
    ON aibase.api_request_logs(trace_id);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_slug
    ON aibase.api_request_logs(slug);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_created_at
    ON aibase.api_request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_turn_id
    ON aibase.api_request_logs(turn_id);
