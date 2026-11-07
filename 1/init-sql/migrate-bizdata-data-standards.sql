-- 数据标准目录
-- PostgreSQL 12+，bizdata schema

CREATE TABLE IF NOT EXISTS bizdata.data_standards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    code VARCHAR(100) NOT NULL,
    version VARCHAR(50) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'enabled'
        CHECK (status IN ('enabled', 'disabled')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (code, version)
);

CREATE INDEX IF NOT EXISTS idx_data_standards_code ON bizdata.data_standards (code);
CREATE INDEX IF NOT EXISTS idx_data_standards_status ON bizdata.data_standards (status);
