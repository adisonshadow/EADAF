-- 仅打开系统应用 API 开关。
-- 禁止在仓库或种子中写入 app_secret / client_secret；密钥在管理端「生成密钥」后自行保管。
UPDATE eadaf.applications
SET api_enabled = true,
    updated_at = CURRENT_TIMESTAMP
WHERE code = 'EADAF';
