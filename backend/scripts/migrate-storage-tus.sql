-- 超大文件 tus 断点续传：对象 MD5 去重 + 上传会话
ALTER TABLE eadaf.storage_objects
  ADD COLUMN IF NOT EXISTS content_md5 VARCHAR(32);

CREATE UNIQUE INDEX IF NOT EXISTS idx_storage_objects_bucket_md5
  ON eadaf.storage_objects (bucket_id, content_md5)
  WHERE content_md5 IS NOT NULL;

COMMENT ON COLUMN eadaf.storage_objects.content_md5 IS '文件内容 MD5（hex），同 Bucket 内用于去重';

CREATE TABLE IF NOT EXISTS eadaf.storage_upload_sessions (
    upload_id VARCHAR(128) PRIMARY KEY,
    bucket_id UUID NOT NULL REFERENCES eadaf.storage_buckets(bucket_id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128),
    upload_length BIGINT NOT NULL DEFAULT 0,
    offset_bytes BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'uploading'
      CHECK (status IN (
        'uploading',
        'pending_finalize',
        'finalizing',
        'completed',
        'duplicate',
        'expired',
        'failed'
      )),
    expires_at TIMESTAMPTZ NOT NULL,
    content_md5 VARCHAR(32),
    expected_md5 VARCHAR(32),
    object_id UUID REFERENCES eadaf.storage_objects(object_id) ON DELETE SET NULL,
    relative_path VARCHAR(512),
    uploaded_ranges JSONB NOT NULL DEFAULT '[]',
    error_message TEXT,
    application_id UUID REFERENCES eadaf.applications(application_id),
    created_by UUID REFERENCES eadaf.users(user_id),
    owner_kind VARCHAR(20) NOT NULL DEFAULT 'user'
      CHECK (owner_kind IN ('user', 'application')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_storage_upload_sessions_status
  ON eadaf.storage_upload_sessions (status);
CREATE INDEX IF NOT EXISTS idx_storage_upload_sessions_expires_at
  ON eadaf.storage_upload_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_storage_upload_sessions_bucket_id
  ON eadaf.storage_upload_sessions (bucket_id);

COMMENT ON TABLE eadaf.storage_upload_sessions IS 'tus 上传会话（进度以磁盘为准，本表用于恢复/清理/鉴权）';
