-- 系统内置应用 EADAF（init-db 必有，供 skill_applications / 系统存储桶外键）
-- 不含 app_secret / sso client_secret：密钥须在「应用管理 → 生成密钥」后自行保管，禁止写入仓库或种子。
INSERT INTO eadaf.applications (
    application_id,
    name,
    code,
    logo_url,
    status,
    description,
    sso_enabled,
    api_enabled,
    api_connect_config,
    sso_config,
    api_data_scope,
    bizdata_scope_codes,
    builtin_api_scope,
    outbound_webhook_scope
)
VALUES (
    '10000000-0000-4000-8000-000000000002',
    '企业智能数据应用底座',
    'EADAF',
    '/images/logo.svg',
    'ACTIVE',
    'EADAF 本系统（系统内置应用，不可删除）',
    false,
    true,
    NULL,
    NULL,
    NULL,
    '[]'::jsonb,
    '{"permissionCodes":[]}'::jsonb,
    '{"domainCodes":[],"webhookCodes":[]}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    logo_url = CASE
        WHEN eadaf.applications.logo_url IS NULL OR btrim(eadaf.applications.logo_url) = ''
        THEN EXCLUDED.logo_url
        ELSE eadaf.applications.logo_url
    END,
    description = EXCLUDED.description,
    api_enabled = EXCLUDED.api_enabled,
    updated_at = CURRENT_TIMESTAMP
    -- 故意不更新 api_connect_config / sso_config，避免覆盖已生成的密钥
;
