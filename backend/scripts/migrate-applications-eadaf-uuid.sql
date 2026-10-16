-- 将 EADAF 系统应用 ID 修正为 RFC 4122 合法 UUID（否则 API isUuid 校验会 404）
UPDATE aibase.skill_applications
SET application_id = '10000000-0000-4000-8000-000000000002'
WHERE application_id = '10000000-0000-0000-0000-000000000002';

UPDATE eadaf.applications
SET application_id = '10000000-0000-4000-8000-000000000002',
    updated_at = CURRENT_TIMESTAMP
WHERE code = 'EADAF'
  AND application_id = '10000000-0000-0000-0000-000000000002';

INSERT INTO eadaf.applications (
    application_id, name, code, logo_url, status, description
)
SELECT
    '10000000-0000-4000-8000-000000000002',
    '企业智能数据应用底座',
    'EADAF',
    '/images/logo.svg',
    'ACTIVE',
    'EADAF 本系统（系统内置应用，不可删除）'
WHERE NOT EXISTS (
    SELECT 1 FROM eadaf.applications WHERE code = 'EADAF'
);
