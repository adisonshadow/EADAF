-- 业务数据模型 Schema
-- PostgreSQL 12+

DROP SCHEMA IF EXISTS bizdata CASCADE;
CREATE SCHEMA bizdata;

-- 单应用配置
CREATE TABLE bizdata.settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) NOT NULL UNIQUE,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO bizdata.settings (key, value) VALUES
    ('default_materialization_schema', '"bizdata_mat"'::jsonb),
    ('catalog_version', '1'::jsonb);

-- 实体主表
CREATE TABLE bizdata.entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(255) NOT NULL UNIQUE,
    label VARCHAR(255) NOT NULL,
    entity_kind VARCHAR(32) NOT NULL DEFAULT 'er_table'
        CHECK (entity_kind IN ('er_table', 'json_schema')),
    table_name VARCHAR(128),
    status VARCHAR(20) NOT NULL DEFAULT 'enabled'
        CHECK (status IN ('enabled', 'disabled', 'archived')),
    is_locked BOOLEAN NOT NULL DEFAULT false,
    version INTEGER NOT NULL DEFAULT 1,
    entity_info JSONB NOT NULL DEFAULT '{}'::jsonb,
    json_schema JSONB,
    layout JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bizdata_entities_code ON bizdata.entities (code);
CREATE INDEX idx_bizdata_entities_kind ON bizdata.entities (entity_kind);

-- ER 实体字段
CREATE TABLE bizdata.entity_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES bizdata.entities(id) ON DELETE CASCADE,
    field_key VARCHAR(128) NOT NULL,
    column_info JSONB NOT NULL DEFAULT '{}'::jsonb,
    typeorm_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (entity_id, field_key)
);

CREATE INDEX idx_bizdata_entity_fields_entity ON bizdata.entity_fields (entity_id);

-- ADB 枚举
CREATE TABLE bizdata.enums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(255) NOT NULL UNIQUE,
    enum_info JSONB NOT NULL DEFAULT '{}'::jsonb,
    values JSONB NOT NULL DEFAULT '{}'::jsonb,
    items JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 实体关系
CREATE TABLE bizdata.relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(32) NOT NULL,
    name VARCHAR(128) NOT NULL,
    inverse_name VARCHAR(128),
    from_entity_id UUID NOT NULL REFERENCES bizdata.entities(id) ON DELETE CASCADE,
    to_entity_id UUID NOT NULL REFERENCES bizdata.entities(id) ON DELETE CASCADE,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    join_table JSONB,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bizdata_relations_from ON bizdata.relations (from_entity_id);
CREATE INDEX idx_bizdata_relations_to ON bizdata.relations (to_entity_id);

-- 物化批次
CREATE TABLE bizdata.database_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    db_type VARCHAR(32) NOT NULL,
    host VARCHAR(255) NOT NULL DEFAULT 'localhost',
    port INTEGER NOT NULL DEFAULT 5432,
    username VARCHAR(128) NOT NULL,
    password_enc TEXT,
    database_name VARCHAR(128) NOT NULL,
    target_schema VARCHAR(128) NOT NULL DEFAULT 'bizdata_mat',
    is_default BOOLEAN NOT NULL DEFAULT false,
    last_test_status VARCHAR(32),
    last_tested_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO bizdata.database_connections (
    id, name, db_type, host, port, username, database_name, target_schema, is_default
) VALUES (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '本地 PostgreSQL（应用库）',
    'postgresql',
    'localhost',
    25432,
    'my_name',
    'eadaf_db',
    'bizdata_mat',
    true
);

CREATE TABLE bizdata.materialization_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID REFERENCES bizdata.database_connections(id),
    target_schema VARCHAR(128) NOT NULL DEFAULT 'bizdata_mat',
    status VARCHAR(32) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'preview', 'running', 'success', 'failed')),
    sql_preview TEXT,
    generated_code JSONB NOT NULL DEFAULT '{}'::jsonb,
    executed_at TIMESTAMPTZ,
    error_message TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 物化明细（保留历史，按 entity 查最新成功记录对比版本）
CREATE TABLE bizdata.materialization_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES bizdata.materialization_runs(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES bizdata.entities(id) ON DELETE CASCADE,
    entity_version INTEGER NOT NULL,
    table_name VARCHAR(128),
    ddl_applied BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bizdata_mat_entities_entity ON bizdata.materialization_entities (entity_id);
CREATE INDEX idx_bizdata_mat_entities_run ON bizdata.materialization_entities (run_id);

-- Scope 业务说明（Markdown；code 与模型树 Scope 节点一致，如 IPS / IPS:bom）
CREATE TABLE bizdata.scope_docs (
    code VARCHAR(255) PRIMARY KEY,
    content_markdown TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 数据标准目录
CREATE TABLE bizdata.data_standards (
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

CREATE INDEX idx_data_standards_code ON bizdata.data_standards (code);
CREATE INDEX idx_data_standards_status ON bizdata.data_standards (status);

-- 逻辑元数据目录（依赖 data_standards）
CREATE TABLE bizdata.metadata_tables (
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

CREATE INDEX idx_metadata_tables_code ON bizdata.metadata_tables (code);
CREATE UNIQUE INDEX idx_metadata_tables_metadata_code
    ON bizdata.metadata_tables (metadata_code)
    WHERE metadata_code IS NOT NULL;

CREATE TABLE bizdata.metadata_fields (
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

CREATE UNIQUE INDEX idx_metadata_fields_metadata_code
    ON bizdata.metadata_fields (metadata_code)
    WHERE metadata_code IS NOT NULL;

CREATE INDEX idx_metadata_fields_table ON bizdata.metadata_fields (metadata_table_id);

INSERT INTO bizdata.settings (key, value)
VALUES ('system_features', '{"metadataEnabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;
