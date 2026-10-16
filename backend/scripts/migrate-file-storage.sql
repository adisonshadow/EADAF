-- 企业文件存储 Bucket / Object 表
CREATE TABLE IF NOT EXISTS eadaf.storage_buckets (
    bucket_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    application_id UUID REFERENCES eadaf.applications(application_id),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
    access_mode VARCHAR(20) NOT NULL DEFAULT 'authenticated' CHECK (access_mode IN ('public', 'authenticated')),
    access_restrictions JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_storage_buckets_code ON eadaf.storage_buckets(code);
CREATE INDEX IF NOT EXISTS idx_storage_buckets_application_id ON eadaf.storage_buckets(application_id);

CREATE TABLE IF NOT EXISTS eadaf.storage_objects (
    object_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id UUID NOT NULL REFERENCES eadaf.storage_buckets(bucket_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128),
    size BIGINT NOT NULL DEFAULT 0,
    relative_path VARCHAR(512) NOT NULL,
    application_id UUID REFERENCES eadaf.applications(application_id),
    created_by UUID REFERENCES eadaf.users(user_id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_storage_objects_bucket_id ON eadaf.storage_objects(bucket_id);
CREATE INDEX IF NOT EXISTS idx_storage_objects_application_id ON eadaf.storage_objects(application_id);
CREATE INDEX IF NOT EXISTS idx_storage_objects_created_by ON eadaf.storage_objects(created_by);

COMMENT ON COLUMN eadaf.storage_buckets.access_mode IS 'public=无需授权, authenticated=必须授权';
COMMENT ON COLUMN eadaf.storage_buckets.access_restrictions IS 'same_application/role_ids/scope_codes 等限制策略';

-- 应用 Bizdata Scope
ALTER TABLE eadaf.applications
  ADD COLUMN IF NOT EXISTS bizdata_scope_codes JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN eadaf.applications.bizdata_scope_codes IS '业务数据 Scope 编码列表';
