-- 采集数据结构化（采集管道）模块表结构（bizdata schema）

CREATE TABLE IF NOT EXISTS bizdata.collection_pipelines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(255) NOT NULL UNIQUE,
    route_path VARCHAR(512) NOT NULL UNIQUE,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'disabled', 'deleted')),
    protocol_type VARCHAR(32) NOT NULL DEFAULT 'serial'
        CHECK (protocol_type IN ('serial', 'modbus_rtu', 'modbus_tcp')),
    restrict_sources BOOLEAN NOT NULL DEFAULT false,
    sample_data TEXT,
    target_structure TEXT,
    parse_script TEXT,
    store_script TEXT,
    entity_id UUID REFERENCES bizdata.entities(id) ON DELETE RESTRICT,
    entity_code VARCHAR(255),
    connection_id UUID NOT NULL REFERENCES bizdata.database_connections(id) ON DELETE RESTRICT,
    table_name VARCHAR(128),
    target_schema VARCHAR(64) NOT NULL DEFAULT 'bizdata_mat',
    base_path VARCHAR(256),
    version INTEGER NOT NULL DEFAULT 0,
    published_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_collection_pipelines_code ON bizdata.collection_pipelines (code);
CREATE INDEX IF NOT EXISTS idx_collection_pipelines_status ON bizdata.collection_pipelines (status);
CREATE INDEX IF NOT EXISTS idx_collection_pipelines_route ON bizdata.collection_pipelines (route_path);
CREATE INDEX IF NOT EXISTS idx_collection_pipelines_entity ON bizdata.collection_pipelines (entity_id);

CREATE TABLE IF NOT EXISTS bizdata.collection_pipeline_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID NOT NULL REFERENCES bizdata.collection_pipelines(id) ON DELETE CASCADE,
    application_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (pipeline_id, application_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_pipeline_apps_pipeline
    ON bizdata.collection_pipeline_applications (pipeline_id);
CREATE INDEX IF NOT EXISTS idx_collection_pipeline_apps_application
    ON bizdata.collection_pipeline_applications (application_id);

CREATE TABLE IF NOT EXISTS bizdata.collection_pipeline_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID NOT NULL REFERENCES bizdata.collection_pipelines(id) ON DELETE CASCADE,
    run_type VARCHAR(32) NOT NULL CHECK (run_type IN ('test', 'ingest', 'ai_test')),
    input_raw TEXT,
    parse_output JSONB,
    store_output JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'success',
    error_message TEXT,
    duration_ms INTEGER,
    executed_by UUID,
    source_application_id UUID,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_collection_pipeline_runs_pipeline
    ON bizdata.collection_pipeline_runs (pipeline_id);
CREATE INDEX IF NOT EXISTS idx_collection_pipeline_runs_created
    ON bizdata.collection_pipeline_runs (pipeline_id, created_at DESC);
