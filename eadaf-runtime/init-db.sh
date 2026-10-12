#!/usr/bin/env bash
# Offline first-time DB init (runs SQL inside the postgres container).
# Skips if schema already has tables (avoids DROP SCHEMA on existing data).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
# shellcheck disable=SC1091
source "$ROOT/lib.sh"
load_deploy_choice "$ROOT"

# shellcheck disable=SC1091
set -a
# Prefer .env next to this script
if [[ -f "$ROOT/.env" ]]; then
  # strip comments / blank lines for safe sourcing of KEY=VALUE
  # shellcheck disable=SC2046
  export $(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ROOT/.env" | sed 's/#.*//' | xargs)
fi
set +a

DB_NAME="${POSTGRES_DATABASE:-eadaf_db}"
DB_USER="${POSTGRES_USER:-my_name}"
DB_PASS="${POSTGRES_PASSWORD:-123456}"
DB_SCHEMA="${POSTGRES_SCHEMA:-uac}"
CONTAINER="${POSTGRES_CONTAINER:-EADAF-postgres}"
SQL_DIR="$ROOT/init-sql"

if [[ ! -d "$SQL_DIR" ]]; then
  echo "缺少 init-sql 目录: $SQL_DIR"
  exit 1
fi

k8s_postgres_pod() {
  kubectl get pod -n "${K8S_NAMESPACE:-eadaf}" -l app=eadaf-postgres \
    -o jsonpath='{.items[0].metadata.name}'
}

psql_exec() {
  if [[ "${DEPLOY_RUNTIME:-}" == "k8s" ]]; then
    local pod
    pod="$(k8s_postgres_pod)"
    [[ -n "$pod" ]] || { echo "未找到 eadaf-postgres Pod"; exit 1; }
    kubectl exec -i -n "${K8S_NAMESPACE:-eadaf}" "$pod" -- \
      env PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -d "$DB_NAME" "$@"
    return
  fi
  docker exec -i -e PGPASSWORD="$DB_PASS" "$CONTAINER" \
    psql -U "$DB_USER" -d "$DB_NAME" "$@"
}

if [[ "${DEPLOY_RUNTIME:-}" != "k8s" ]]; then
  if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "Postgres 容器未运行: $CONTAINER"
    exit 1
  fi
fi

echo "测试数据库连接..."
psql_exec -c "SELECT 1;" >/dev/null

TABLE_COUNT="$(psql_exec -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${DB_SCHEMA}';" | tr -d '[:space:]')"
SKIP_FULL_INIT=0
if [[ "${TABLE_COUNT:-0}" != "0" ]]; then
  echo "schema ${DB_SCHEMA} 已有 ${TABLE_COUNT} 张表，跳过全量初始化（避免 DROP SCHEMA）。"
  SKIP_FULL_INIT=1
fi

load_sql_manifest() {
  local manifest="$ROOT/init-sql.manifest"
  SQL_FILES=()
  if [[ ! -f "$manifest" ]]; then
    echo "缺少 $manifest"
    exit 1
  fi
  local line
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"
    line="$(printf '%s' "$line" | tr -d '[:space:]')"
    [[ -n "$line" ]] || continue
    SQL_FILES+=("$line")
  done <"$manifest"
  [[ ${#SQL_FILES[@]} -gt 0 ]] || { echo "init-sql.manifest 为空"; exit 1; }
}

record_schema_migrations() {
  echo "记录 schema_migrations ..."
  psql_exec -v ON_ERROR_STOP=1 <<SQL
CREATE TABLE IF NOT EXISTS ${DB_SCHEMA}.schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
SQL
  local name
  for name in "${SQL_FILES[@]}"; do
    psql_exec -c "INSERT INTO ${DB_SCHEMA}.schema_migrations (filename) VALUES ('${name}') ON CONFLICT (filename) DO NOTHING;"
  done
}

# 跳过全量初始化时，仍要保证有可登录的 admin（中途失败的现场常见：表在但无用户）
ensure_superadmin() {
  local n
  if ! psql_exec -tAc "SELECT to_regclass('${DB_SCHEMA}.users')" | grep -q users; then
    echo "尚无 ${DB_SCHEMA}.users 表，跳过 admin 补种"
    return 0
  fi
  n="$(psql_exec -tAc "SELECT COUNT(*) FROM ${DB_SCHEMA}.users WHERE username = 'admin' AND deleted_at IS NULL;" | tr -d '[:space:]')"
  if [[ "${n:-0}" != "0" ]]; then
    echo "admin 用户已存在，跳过超级管理员补种"
    return 0
  fi
  echo "未找到 admin 用户，补种超级管理员（admin / 123456）..."
  psql_exec -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO uac.roles (role_id, role_name, code, description, status)
VALUES (
    '10000000-0000-0000-0000-000000000001',
    '超级管理员',
    'SUPER_ADMIN',
    '系统最高权限角色',
    'ACTIVE'
)
ON CONFLICT (role_id) DO NOTHING;

INSERT INTO uac.users (user_id, username, password_hash, email, avatar, phone, gender, status)
VALUES (
    '10000000-0000-0000-0000-000000000001',
    'admin',
    '$2a$10$8c90r1pL61cViUzyWnGb.OesyqAoTSuWf6pfWVhSBVvaNFnuJko9.',
    'admin@test.com',
    '1fa0a3de-d1d2-406f-89f0-a9522e0c0c3a',
    '13800138000',
    'MALE',
    'ACTIVE'
)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO uac.role_permissions (role_id, permission_id)
SELECT
    '10000000-0000-0000-0000-000000000001',
    permission_id
FROM uac.permissions
ON CONFLICT DO NOTHING;

INSERT INTO uac.user_roles (user_id, role_id)
VALUES (
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001'
)
ON CONFLICT DO NOTHING;

INSERT INTO uac.data_permission_rules (role_id, resource_type, conditions, status)
SELECT
    '10000000-0000-0000-0000-000000000001',
    '*',
    '{"operator": "ALL"}'::jsonb,
    'ACTIVE'
WHERE NOT EXISTS (
    SELECT 1 FROM uac.data_permission_rules
    WHERE role_id = '10000000-0000-0000-0000-000000000001'
      AND resource_type = '*'
      AND deleted_at IS NULL
);
SQL
  echo "超级管理员补种完成（admin / 123456）"
}

load_sql_manifest

# 物化连接种子是 localhost:35432（本机开发）；Docker/K8s 内 API 必须连服务名 postgres:5432
fix_bizdata_db_connection() {
  if [[ "${DEPLOY_RUNTIME:-}" == "k8s" ]]; then
    echo "K8s 模式请在 API Pod 内执行 init/fix-db-connection.js（如需）"
    return 0
  fi
  if ! docker ps --format '{{.Names}}' | grep -qx 'EADAF-api'; then
    echo "EADAF-api 未运行，跳过物化连接修正（启动 API 后可执行: docker exec -w /app/backend EADAF-api node /data/fix-db-connection.js）"
    return 0
  fi
  local script="$ROOT/init/fix-db-connection.js"
  [[ -f "$script" ]] || { echo "缺少 $script，跳过物化连接修正"; return 0; }
  echo "修正 bizdata 默认连接 → 容器内 ${POSTGRES_HOST:-postgres}:${POSTGRES_PORT:-5432} ..."
  docker cp "$script" EADAF-api:/tmp/fix-db-connection.js
  docker exec -w /app/backend EADAF-api node /tmp/fix-db-connection.js
}

if [[ "$SKIP_FULL_INIT" -eq 1 ]]; then
  ensure_superadmin
  echo "数据库初始化完成（跳过全量；已确保 admin）。表结构增量请用升级包。"
  # 全量跳过时仍要修正连接（否则管理端测连会 ECONNREFUSED 127.0.0.1:35432）
  fix_bizdata_db_connection || true
  exit 0
fi

run_sql_file() {
  local file="$1"
  local base
  base="$(basename "$file")"
  if [[ ! -f "$file" ]]; then
    echo "缺少 SQL: $base"
    exit 1
  fi
  echo "执行 $base ..."
  if [[ "${DEPLOY_RUNTIME:-}" == "k8s" ]]; then
    local pod
    pod="$(k8s_postgres_pod)"
    kubectl exec -i -n "${K8S_NAMESPACE:-eadaf}" "$pod" -- \
      env PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <"$file"
  else
    docker exec -i -e PGPASSWORD="$DB_PASS" "$CONTAINER" \
      psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <"$file"
  fi
}

echo "开始重置 schema ${DB_SCHEMA}..."
psql_exec -c "DROP SCHEMA IF EXISTS ${DB_SCHEMA} CASCADE; CREATE SCHEMA ${DB_SCHEMA};"
echo "安装 pgcrypto..."
psql_exec -c "CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public;"

for name in "${SQL_FILES[@]}"; do
  run_sql_file "$SQL_DIR/$name"
done

record_schema_migrations
echo "数据库结构初始化完成"
# 全量 init 之后 API 可能尚未启动；由 up.sh 在 eadaf-api healthy 后再调一次更稳妥
echo "数据库初始化完成（物化连接将在 API 就绪后修正为容器内地址）"
