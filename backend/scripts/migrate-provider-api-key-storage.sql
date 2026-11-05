-- AI 服务商：API Key 存放位置。database=加密进库（默认）；browser=不入库，只由浏览器在调用时带上。
ALTER TABLE aibase.providers
  ADD COLUMN IF NOT EXISTS api_key_storage VARCHAR(20);

UPDATE aibase.providers
   SET api_key_storage = 'database'
 WHERE api_key_storage IS NULL OR btrim(api_key_storage) = '';

ALTER TABLE aibase.providers
  ALTER COLUMN api_key_storage SET DEFAULT 'database';

ALTER TABLE aibase.providers
  ALTER COLUMN api_key_storage SET NOT NULL;
