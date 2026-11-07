-- 业务指标（Metrics）表
-- PostgreSQL 12+，bizdata schema

CREATE TABLE IF NOT EXISTS bizdata.metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(255) NOT NULL UNIQUE,
    label VARCHAR(255) NOT NULL,
    description TEXT,
    metric_type VARCHAR(32) NOT NULL
        CHECK (metric_type IN ('sql', 'formula')),
    connection_id UUID REFERENCES bizdata.database_connections(id),
    query_script TEXT,
    formula_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    compute_mode VARCHAR(32) NOT NULL DEFAULT 'scheduled'
        CHECK (compute_mode IN ('scheduled', 'on_demand', 'both')),
    schedule_type VARCHAR(32) NOT NULL DEFAULT 'manual'
        CHECK (schedule_type IN ('manual', 'hourly', 'daily')),
    schedule_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    unit VARCHAR(64),
    category VARCHAR(128),
    scope_code VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'enabled'
        CHECK (status IN ('enabled', 'disabled')),
    last_computed_at TIMESTAMPTZ,
    last_value NUMERIC,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bizdata_metrics_category ON bizdata.metrics (category);
CREATE INDEX IF NOT EXISTS idx_bizdata_metrics_scope ON bizdata.metrics (scope_code);
CREATE INDEX IF NOT EXISTS idx_bizdata_metrics_status ON bizdata.metrics (status);

CREATE TABLE IF NOT EXISTS bizdata.metric_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_id UUID NOT NULL REFERENCES bizdata.metrics(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'success', 'failed')),
    triggered_by VARCHAR(32) NOT NULL DEFAULT 'manual',
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    duration_ms INTEGER,
    error_message TEXT,
    row_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_metric_runs_metric ON bizdata.metric_runs (metric_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bizdata.metric_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_id UUID NOT NULL REFERENCES bizdata.metrics(id) ON DELETE CASCADE,
    run_id UUID REFERENCES bizdata.metric_runs(id) ON DELETE SET NULL,
    value NUMERIC NOT NULL,
    dimension_key VARCHAR(255) NOT NULL DEFAULT '',
    computed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_metric_values_metric_time ON bizdata.metric_values (metric_id, computed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_metric_values_run_dim
    ON bizdata.metric_values (run_id, dimension_key)
    WHERE run_id IS NOT NULL;
