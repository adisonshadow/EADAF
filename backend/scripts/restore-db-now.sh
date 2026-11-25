#!/bin/bash
# 立即恢复当前环境对应的 PostgreSQL 全库（用 .dump 备份文件覆盖现有数据）
# 用法: bash restore-db-now.sh <dump 文件路径>
#
# 恢复优先用数据库容器内的 pg_restore（与服务器版本一致，避免本机客户端版本不匹配）；
# 打包部署里 API 在容器内、没有 docker CLI，DB_BACKUP_USE_DOCKER=false 时回退到本机
# pg_restore（镜像已内置 PostgreSQL 16 客户端）。高危操作，请确认已备份。

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

find_local_pg_restore() {
  local candidate
  for candidate in \
    "${PG_RESTORE:-}" \
    "$(command -v pg_restore 2>/dev/null || true)" \
    "/usr/lib/postgresql/16/bin/pg_restore" \
    "/usr/pgsql-16/bin/pg_restore"; do
    [ -n "$candidate" ] && [ -x "$candidate" ] && echo "$candidate" && return 0
  done
  return 1
}

# 容器内 pg_restore：版本与数据库服务器完全一致（源码开发 / 宿主机有 Docker 时走这里）
run_docker_restore() {
  local container="$1"

  echo "恢复方式: Docker $container 内 pg_restore（与服务器版本一致）"

  # 1) 断开目标库的其他连接，避免 pg_restore --clean 因对象被占用而失败
  docker exec -i -e PGPASSWORD="$DB_PASSWORD" "$container" psql -U "$DB_USER" -d "$DB_NAME" -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || true

  # 2) 容器内 pg_restore 覆盖恢复（--clean --if-exists 先删后建），dump 从 stdin 读入
  if ! docker exec -i -e PGPASSWORD="$DB_PASSWORD" "$container" \
    pg_restore -U "$DB_USER" -d "$DB_NAME" \
    --clean --if-exists --no-owner --no-acl < "$DUMP_FILE"; then
    echo "错误：pg_restore 执行失败（部分对象可能已恢复，请检查数据完整性）"
    exit 1
  fi
}

# 本机 pg_restore：打包部署里 API 在容器内、没有 docker CLI，用镜像内置的 16 客户端直连数据库
run_local_restore() {
  local pg_restore_bin="$1"

  echo "恢复方式: 本机 $pg_restore_bin ($("$pg_restore_bin" --version | head -1))"

  # psql 优先取 pg_restore 同目录，其次 PATH；只用于断开连接，缺了也不阻断恢复
  local psql_bin
  psql_bin="$(dirname "$pg_restore_bin")/psql"
  if [ ! -x "$psql_bin" ]; then
    psql_bin="$(command -v psql 2>/dev/null || true)"
  fi
  if [ -n "$psql_bin" ]; then
    PGPASSWORD="$DB_PASSWORD" "$psql_bin" \
      -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c \
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();" \
      >/dev/null 2>&1 || true
  fi

  if ! PGPASSWORD="$DB_PASSWORD" "$pg_restore_bin" \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --clean --if-exists --no-owner --no-acl < "$DUMP_FILE"; then
    echo "错误：pg_restore 执行失败（部分对象可能已恢复，请检查数据完整性）"
    exit 1
  fi
}

# 选执行方式：显式关掉 docker，或容器内没有 docker CLI 时，回退到本机客户端
USE_DOCKER="${DB_BACKUP_USE_DOCKER:-auto}"
CONTAINER=""
if [ "$USE_DOCKER" != "false" ] && command -v docker >/dev/null 2>&1; then
  ensure_docker_reachable || true
  CONTAINER="$(find_db_container || true)"
fi

if [ "$USE_DOCKER" = "true" ] || { [ "$USE_DOCKER" = "auto" ] && [ -n "$CONTAINER" ]; }; then
  if [ -z "$CONTAINER" ]; then
    echo "错误：DB_BACKUP_USE_DOCKER=true 但未找到可用的 PostgreSQL Docker 容器"
    exit 1
  fi
  PG_RESTORE_BIN=""
else
  PG_RESTORE_BIN="$(find_local_pg_restore)" || {
    echo "错误：未找到 pg_restore。恢复需要 PostgreSQL 16 客户端（打包镜像已内置；源码开发可安装 postgresql-client-16）"
    exit 1
  }
fi

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
if [ -n "$CONTAINER" ]; then
  echo "容器:     $CONTAINER"
fi
echo "备份文件: $DUMP_FILE"
echo "开始时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "------------------------------------------"

if [ -n "$CONTAINER" ]; then
  run_docker_restore "$CONTAINER"
else
  run_local_restore "$PG_RESTORE_BIN"
fi

echo "恢复成功"
echo "完成时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="
