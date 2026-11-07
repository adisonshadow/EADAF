-- 指标看板卡片（可视化配置，绑定底层 metrics）
-- PostgreSQL 12+，bizdata schema

CREATE TABLE IF NOT EXISTS bizdata.metric_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(255) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    domain_code VARCHAR(128) NOT NULL,
    metric_id UUID NOT NULL REFERENCES bizdata.metrics(id) ON DELETE CASCADE,
    viz_type VARCHAR(32) NOT NULL
        CHECK (viz_type IN ('statistic_trend', 'line', 'bar', 'ring')),
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    sort_order INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'enabled'
        CHECK (status IN ('enabled', 'disabled')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_metric_cards_domain ON bizdata.metric_cards (domain_code);
CREATE INDEX IF NOT EXISTS idx_metric_cards_metric ON bizdata.metric_cards (metric_id);
CREATE INDEX IF NOT EXISTS idx_metric_cards_status ON bizdata.metric_cards (status);
CREATE INDEX IF NOT EXISTS idx_metric_cards_sort ON bizdata.metric_cards (domain_code, sort_order);
