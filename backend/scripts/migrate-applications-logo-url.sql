-- 应用表增加 logo_url 字段，并确保系统内置应用 EADAF 存在
ALTER TABLE eadaf.applications
  ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500);

COMMENT ON COLUMN eadaf.applications.logo_url IS '应用 Logo URL（可选）';
COMMENT ON COLUMN eadaf.applications.name IS '应用全称';
COMMENT ON COLUMN eadaf.applications.code IS '缩写简称（唯一）';

INSERT INTO eadaf.applications (
    application_id, name, code, logo_url, status, description
)
VALUES (
    '10000000-0000-4000-8000-000000000002',
    '企业智能数据应用底座',
    'EADAF',
    '/images/EADAF-logo.png',
    'ACTIVE',
    'EADAF 本系统（系统内置应用，不可删除）'
)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    logo_url = EXCLUDED.logo_url,
    description = EXCLUDED.description,
    updated_at = CURRENT_TIMESTAMP;
