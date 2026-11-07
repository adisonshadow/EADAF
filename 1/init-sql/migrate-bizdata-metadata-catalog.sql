-- 逻辑元数据目录（依赖 data_standards）
-- PostgreSQL 12+，bizdata schema

CREATE TABLE IF NOT EXISTS bizdata.metadata_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(255) NOT NULL,
    target_type VARCHAR(32) NOT NULL
        CHECK (target_type IN ('entity', 'metric', 'enum')),
    target_id UUID NOT NULL,
    metadata_code VARCHAR(255),
    standard_id UUID REFERENCES bizdata.data_standards(id) ON DELETE SET NULL,
    business_meaning TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'enabled'
        CHECK (status IN ('enabled', 'disabled')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_metadata_tables_code ON bizdata.metadata_tables (code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_metadata_tables_metadata_code
    ON bizdata.metadata_tables (metadata_code)
    WHERE metadata_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS bizdata.metadata_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metadata_table_id UUID NOT NULL REFERENCES bizdata.metadata_tables(id) ON DELETE CASCADE,
    field_key VARCHAR(128) NOT NULL,
    metadata_code VARCHAR(255),
    standard_id UUID REFERENCES bizdata.data_standards(id) ON DELETE SET NULL,
    business_meaning TEXT,
    sensitivity_level VARCHAR(32),
    alias VARCHAR(255),
    data_type VARCHAR(64),
    validation_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
    enum_code VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (metadata_table_id, field_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_metadata_fields_metadata_code
    ON bizdata.metadata_fields (metadata_code)
    WHERE metadata_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_metadata_fields_table ON bizdata.metadata_fields (metadata_table_id);

INSERT INTO bizdata.settings (key, value)
VALUES ('system_features', '{"metadataEnabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;
