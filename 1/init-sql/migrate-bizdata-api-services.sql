-- API 服务模块表结构（bizdata schema）

CREATE TABLE IF NOT EXISTS bizdata.api_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(255) NOT NULL UNIQUE,
    route_path VARCHAR(512) NOT NULL UNIQUE,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'disabled')),
    -- 以下三项对「跨实体 SQL 脚本」模式可选（migrate-bizdata-api-services-optional-entity.sql 前向合并）
    entity_id UUID REFERENCES bizdata.entities(id) ON DELETE RESTRICT,
    entity_code VARCHAR(255),
    connection_id UUID NOT NULL REFERENCES bizdata.database_connections(id) ON DELETE RESTRICT,
    table_name VARCHAR(128),
    target_schema VARCHAR(64) NOT NULL DEFAULT 'bizdata_mat',
    base_path VARCHAR(256),
    -- form v2 / 可选实体 / 传输协议字段（前向合并自对应增量迁移）
    scope_code VARCHAR(255),
    script_mode VARCHAR(16) NOT NULL DEFAULT 'sql',
    definition_script TEXT,
    handler_script TEXT,
    request_parameter_interface TEXT,
    transport_protocols JSONB NOT NULL DEFAULT '["http"]'::jsonb,
    enabled_operations JSONB NOT NULL DEFAULT '[]'::jsonb,
    security_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    script_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INTEGER NOT NULL DEFAULT 0,
    published_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_services_code ON bizdata.api_services (code);
CREATE INDEX IF NOT EXISTS idx_api_services_status ON bizdata.api_services (status);
CREATE INDEX IF NOT EXISTS idx_api_services_entity ON bizdata.api_services (entity_id);
CREATE INDEX IF NOT EXISTS idx_api_services_connection ON bizdata.api_services (connection_id);
CREATE INDEX IF NOT EXISTS idx_api_services_scope_code ON bizdata.api_services (scope_code);

COMMENT ON COLUMN bizdata.api_services.scope_code IS '绑定的数据模型 Scope（单选）';
COMMENT ON COLUMN bizdata.api_services.script_mode IS 'sql | typescript';
COMMENT ON COLUMN bizdata.api_services.definition_script IS '服务主 SQL/脚本，可跨表 JOIN、聚合等';
COMMENT ON COLUMN bizdata.api_services.handler_script IS 'TypeScript/JavaScript Handler 源码';
COMMENT ON COLUMN bizdata.api_services.request_parameter_interface IS '设计期请求参数 TypeScript interface 文本';
COMMENT ON COLUMN bizdata.api_services.entity_id IS '可选：单实体 CRUD 模板时使用';
COMMENT ON COLUMN bizdata.api_services.transport_protocols IS '访问协议清单：http | sse | websocket';

CREATE TABLE IF NOT EXISTS bizdata.api_service_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_service_id UUID NOT NULL REFERENCES bizdata.api_services(id) ON DELETE CASCADE,
    operation VARCHAR(64) NOT NULL,
    http_method VARCHAR(16) NOT NULL,
    route_pattern VARCHAR(128) NOT NULL DEFAULT '',
    parameters_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    generated_script TEXT,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (api_service_id, operation)
);

CREATE TABLE IF NOT EXISTS bizdata.api_service_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_service_id UUID NOT NULL REFERENCES bizdata.api_services(id) ON DELETE CASCADE,
    grant_type VARCHAR(32) NOT NULL CHECK (grant_type IN ('department', 'role', 'application')),
    grant_id UUID NOT NULL,
    actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (api_service_id, grant_type, grant_id)
);

CREATE TABLE IF NOT EXISTS bizdata.api_service_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_service_id UUID NOT NULL REFERENCES bizdata.api_services(id) ON DELETE CASCADE,
    run_type VARCHAR(32) NOT NULL CHECK (run_type IN ('preview', 'test', 'publish')),
    operation VARCHAR(64),
    input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    generated_script TEXT,
    output_preview JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'success',
    error_message TEXT,
    executed_by UUID,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_service_runs_service ON bizdata.api_service_runs (api_service_id);
