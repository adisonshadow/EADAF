-- 系统内置 Bucket（与 env SYSTEM_STORAGE_BUCKET_CODE 一致）
INSERT INTO eadaf.storage_buckets (
  code, name, description, application_id, status, access_mode, access_restrictions
)
VALUES (
  'eadaf-system',
  'EADAF系统资源',
  'EADAF业务系统自用资源（用户头像、应用 Logo 等），公开访问，不可编辑或删除',
  '10000000-0000-4000-8000-000000000002',
  'ACTIVE',
  'public',
  '{}'
)
ON CONFLICT (code) DO NOTHING;
