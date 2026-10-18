#!/bin/bash
# 立即恢复当前环境对应的 PostgreSQL 全库（用 .dump 备份文件覆盖现有数据）
# 用法: bash restore-db-now.sh <dump 文件路径>
#
# 恢复在数据库所在 Docker 容器内用 pg_restore 执行（与服务器版本一致，
# 避免本机 Homebrew pg_restore 版本不匹配）。高危操作，请确认已备份。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

export NODE_ENV="${NODE_ENV:-development}"

# shellcheck disable=SC1091
source "$PROJECT_ROOT/scripts/env.sh"
load_env_file "$PROJECT_ROOT"

DB_HOST="${POSTGRES_HOST:-}"
DB_PORT="${POSTGRES_PORT:-}"
DB_USER="${POSTGRES_USER:-}"
DB_PASSWORD="${POSTGRES_PASSWORD:-}"
DB_NAME="${POSTGRES_DATABASE:-}"

if [ -z "$DB_HOST" ] || [ -z "$DB_PORT" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ] || [ -z "$DB_NAME" ]; then
  echo "错误：.env.$NODE_ENV 中缺少 POSTGRES_* 数据库配置"
  exit 1
fi

DUMP_FILE="${1:-}"
if [ -z "$DUMP_FILE" ]; then
  echo "错误：请传入 dump 备份文件路径，如 bash restore-db-now.sh /path/to/xxx.dump"
  exit 1
fi
if [ ! -f "$DUMP_FILE" ]; then
  echo "错误：备份文件不存在: $DUMP_FILE"
  exit 1
fi
case "$DUMP_FILE" in
  *.dump) ;;
  *)
    echo "错误：仅支持 .dump 格式的备份文件"
    exit 1
    ;;
esac
DUMP_FILE="$(cd "$(dirname "$DUMP_FILE")" && pwd)/$(basename "$DUMP_FILE")"

LOCK_FILE="/tmp/eadaf_db_restore_${DB_NAME}.lock"

# Docker CLI 可能仍指向已退出/不可用的 context（如旧 OrbStack），导致 docker 命令整体连不上。
# 依次探测常见 daemon socket，找到可用的即 export DOCKER_HOST 覆盖（不影响用户全局配置）。
ensure_docker_reachable() {
  command -v docker >/dev/null 2>&1 || return 1

  if docker info >/dev/null 2>&1; then
    return 0
  fi

  local candidate
  for candidate in \
    "unix://${HOME}/.orbstack/run/docker.sock" \
    "unix://${HOME}/.docker/run/docker.sock" \
    "unix:///var/run/docker.sock"; do
    local sock="${candidate#unix://}"
    if [ -S "$sock" ] && DOCKER_HOST="$candidate" docker info >/dev/null 2>&1; then
      export DOCKER_HOST="$candidate"
      return 0
    fi
  done
  return 1
}

# 通过发布 DB_PORT 端口的容器定位数据库所在容器（与 backup-db-now.sh 一致）
find_db_container() {
  if [ -n "${DB_BACKUP_DOCKER_CONTAINER:-}" ]; then
    if docker ps --filter "name=^/${DB_BACKUP_DOCKER_CONTAINER}$" --filter "status=running" -q 2>/dev/null | grep -q .; then
      echo "$DB_BACKUP_DOCKER_CONTAINER"
      return 0
    fi
  fi

  local container
  container="$(docker ps --filter "publish=${DB_PORT}" --format '{{.Names}}' 2>/dev/null | head -1)"
  if [ -n "$container" ]; then
    echo "$container"
    return 0
  fi
  return 1
}

ensure_docker_reachable || {
  echo "错误：Docker daemon 不可用。恢复需要容器内 pg_restore（与服务器版本一致），请启动 Docker Desktop / OrbStack"
  exit 1
}

CONTAINER="$(find_db_container)" || {
  echo "错误：未找到发布 ${DB_PORT} 端口的运行中 PostgreSQL 容器。恢复需要容器内 pg_restore 保证版本匹配"
  exit 1
}

if [ -f "$LOCK_FILE" ]; then
  PID="$(cat "$LOCK_FILE" 2>/dev/null || true)"
  if [ -n "$PID" ] && ps -p "$PID" >/dev/null 2>&1; then
    echo "恢复进程已在运行 (PID: $PID)，请稍后再试"
    exit 1
  fi
  rm -f "$LOCK_FILE"
fi

echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

echo "=========================================="
echo " EADAF 数据库立即恢复"
echo "=========================================="
echo "环境:     $NODE_ENV"
echo "数据库:   $DB_NAME @ $DB_HOST:$DB_PORT"
echo "容器:     $CONTAINER"
echo "备份文件: $DUMP_FILE"
echo "开始时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "------------------------------------------"

# dump 文件通过 stdin 直接交给容器内 pg_restore，不再「docker cp 进容器 /tmp」：
# Git Bash(MSYS) 会把 /tmp/... 这类容器内路径改写成宿主机路径，docker 参数不可靠。
# 1) 断开目标库的其他连接，避免 pg_restore --clean 因对象被占用而失败
echo "断开现有连接..."
docker exec -i -e PGPASSWORD="$DB_PASSWORD" "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();" \
  >/dev/null 2>&1 || true

# 2) 容器内 pg_restore 覆盖恢复（--clean --if-exists 先删后建），dump 从 stdin 读入
echo "执行恢复（容器内 pg_restore，与服务器版本一致）..."
if ! docker exec -i -e PGPASSWORD="$DB_PASSWORD" "$CONTAINER" \
  pg_restore -U "$DB_USER" -d "$DB_NAME" \
  --clean --if-exists --no-owner --no-acl < "$DUMP_FILE"; then
  echo "错误：pg_restore 执行失败（部分对象可能已恢复，请检查数据完整性）"
  exit 1
fi

echo "恢复成功"
echo "完成时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="
