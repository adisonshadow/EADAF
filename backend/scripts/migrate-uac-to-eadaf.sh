#!/bin/bash
# 把历史命名 UAC/uac 统一到 EADAF：schema 改名 + 存库 AI 文本（幂等）
#
# 用法：bash backend/scripts/migrate-uac-to-eadaf.sh   （或 pnpm --filter ./backend migrate-uac-to-eadaf）
# 执行前请先备份：bash backend/scripts/backup-db-now.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

export NODE_ENV="${NODE_ENV:-development}"

# shellcheck disable=SC1091
source "$PROJECT_ROOT/scripts/env.sh"
load_env_file "$PROJECT_ROOT"

SQL_FILE="$SCRIPT_DIR/migrate-uac-to-eadaf.sql"
if [ ! -f "$SQL_FILE" ]; then
  echo "错误：找不到 $SQL_FILE" >&2
  exit 1
fi

echo "迁移 UAC → EADAF：${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DATABASE}"
PGPASSWORD="$POSTGRES_PASSWORD" psql \
  -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DATABASE" \
  -v ON_ERROR_STOP=1 -f "$SQL_FILE"
echo "迁移完成（schema 与存库文本已统一为 EADAF）"
