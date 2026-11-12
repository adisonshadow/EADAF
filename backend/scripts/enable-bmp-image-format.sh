#!/bin/bash
# 给已保存的文件存储白名单补上 bmp。
# 设置页保存过的 imageFormats 会盖过代码初始值；只升级程序不会改这条记录。
# 在跑着 EADAF 的机器上执行：bash enable-bmp-image-format.sh

set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-EADAF-postgres}"
API_CONTAINER="${API_CONTAINER:-EADAF-api}"
DB_USER="${POSTGRES_USER:-my_name}"
DB_NAME="${POSTGRES_DATABASE:-eadaf_db}"

SQL=$(cat <<'SQL'
UPDATE bizdata.settings
SET value = jsonb_set(
  value,
  '{fileStorage,imageFormats}',
  (value->'fileStorage'->'imageFormats') || '["bmp"]'::jsonb,
  true
)
WHERE key = 'system_features'
  AND jsonb_typeof(value->'fileStorage'->'imageFormats') = 'array'
  AND NOT (value->'fileStorage'->'imageFormats' @> '"bmp"'::jsonb);

SELECT COALESCE((value->'fileStorage'->'imageFormats')::text, '未保存图片格式名单，使用程序初始值') AS image_formats
FROM bizdata.settings
WHERE key = 'system_features';
SQL
)

run_sql() {
  if docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
    docker exec -i "$PG_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1
  else
    : "${POSTGRES_PASSWORD:?未找到容器 ${PG_CONTAINER}，请设置 POSTGRES_PASSWORD 后用本机 psql}"
    PGPASSWORD="$POSTGRES_PASSWORD" psql \
      -h "${POSTGRES_HOST:-127.0.0.1}" \
      -p "${POSTGRES_PORT:-5432}" \
      -U "$DB_USER" \
      -d "$DB_NAME" \
      -v ON_ERROR_STOP=1
  fi
}

echo "更新 bizdata.settings.system_features.fileStorage.imageFormats"
printf '%s\n' "$SQL" | run_sql

if docker ps --format '{{.Names}}' | grep -qx "$API_CONTAINER"; then
  echo "重启 ${API_CONTAINER}，让进程重新读取数据库里的名单"
  docker restart "$API_CONTAINER" >/dev/null
  echo "已重启 ${API_CONTAINER}"
else
  echo "未找到容器 ${API_CONTAINER}。数据库已更新，请自行重启 EADAF 接口进程。"
fi
