#!/usr/bin/env bash
# 升级表结构：只执行尚未记入 schema_migrations 的 SQL。
# 旧库没有这张表时，把 schema-baseline.txt 记为已执行，不重放历史脚本。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC2046
  export $(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ROOT/.env" | sed 's/#.*//' | xargs)
  set +a
fi
# shellcheck disable=SC1091
source "$ROOT/lib.sh"
load_deploy_choice "$ROOT"

DB_NAME="${POSTGRES_DATABASE:-eadaf_db}"
DB_USER="${POSTGRES_USER:-my_name}"
DB_PASS="${POSTGRES_PASSWORD:-123456}"
DB_SCHEMA="${POSTGRES_SCHEMA:-uac}"
CONTAINER="${POSTGRES_CONTAINER:-EADAF-postgres}"
SQL_DIR="$ROOT/init-sql"
MANIFEST="$ROOT/init-sql.manifest"
BASELINE="$ROOT/schema-baseline.txt"

die() { printf '[ERR] %s\n' "$*" >&2; exit 1; }

k8s_postgres_pod() {
  kubectl get pod -n "${K8S_NAMESPACE:-eadaf}" -l app=eadaf-postgres \
    -o jsonpath='{.items[0].metadata.name}'
}

psql_exec() {
  if [[ "${DEPLOY_RUNTIME:-}" == "k8s" ]]; then
    local pod
    pod="$(k8s_postgres_pod)"
    [[ -n "$pod" ]] || die "未找到 eadaf-postgres Pod"
    kubectl exec -i -n "${K8S_NAMESPACE:-eadaf}" "$pod" -- \
      env PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -d "$DB_NAME" "$@"
    return
  fi
  docker exec -i -e PGPASSWORD="$DB_PASS" "$CONTAINER" \
    psql -U "$DB_USER" -d "$DB_NAME" "$@"
}

[[ -f "$MANIFEST" ]] || die "缺少 init-sql.manifest"
[[ -d "$SQL_DIR" ]] || die "缺少 init-sql/"

read_names() {
  local file="$1" line
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"
    line="$(printf '%s' "$line" | tr -d '[:space:]')"
    [[ -n "$line" ]] || continue
    printf '%s\n' "$line"
  done <"$file"
}

TABLE_COUNT="$(psql_exec -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${DB_SCHEMA}';" | tr -d '[:space:]')"
if [[ "${TABLE_COUNT:-0}" == "0" ]]; then
  die "库中还没有 ${DB_SCHEMA} 表。请先使用安装包，不要对空库执行升级。"
fi

HAS_MIG="$(psql_exec -tAc "SELECT to_regclass('${DB_SCHEMA}.schema_migrations');" | tr -d '[:space:]')"
if [[ -z "$HAS_MIG" || "$HAS_MIG" == "" ]]; then
  echo "创建 ${DB_SCHEMA}.schema_migrations，并按 schema-baseline.txt 做基线（不重放）"
  psql_exec -v ON_ERROR_STOP=1 <<SQL
CREATE TABLE ${DB_SCHEMA}.schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
SQL
  if [[ -f "$BASELINE" ]]; then
    while IFS= read -r name; do
      [[ -n "$name" ]] || continue
      psql_exec -c "INSERT INTO ${DB_SCHEMA}.schema_migrations (filename) VALUES ('${name}') ON CONFLICT (filename) DO NOTHING;"
    done < <(read_names "$BASELINE")
  fi
fi

applied_tmp="$(mktemp)"
psql_exec -tAc "SELECT filename FROM ${DB_SCHEMA}.schema_migrations;" \
  | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' >"$applied_tmp" || true

while IFS= read -r name; do
  [[ -n "$name" ]] || continue
  if grep -qx "$name" "$applied_tmp"; then
    echo "已执行，跳过 $name"
    continue
  fi
  [[ -f "$SQL_DIR/$name" ]] || die "升级包缺少 SQL: $name"
  echo "执行 $name ..."
  psql_exec -v ON_ERROR_STOP=1 <"$SQL_DIR/$name"
  psql_exec -c "INSERT INTO ${DB_SCHEMA}.schema_migrations (filename) VALUES ('${name}') ON CONFLICT (filename) DO NOTHING;"
done < <(read_names "$MANIFEST")

rm -f "$applied_tmp"
echo "表结构升级完成"
