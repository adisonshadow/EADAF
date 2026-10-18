#!/bin/bash
# 立即备份当前环境对应的 PostgreSQL 全库（含 eadaf / aibase / bizdata 等 schema）

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

if [ -n "${DB_BACKUP_DIR:-}" ]; then
  BACKUP_DIR="$DB_BACKUP_DIR"
elif [ "$NODE_ENV" = "development" ]; then
  BACKUP_DIR="db-backup"
else
  echo "错误：请在 .env.$NODE_ENV 中配置 DB_BACKUP_DIR（数据库备份目录）"
  exit 1
fi

# 相对路径基于项目根目录解析
if [[ "$BACKUP_DIR" != /* ]]; then
  BACKUP_DIR="$PROJECT_ROOT/$BACKUP_DIR"
fi

if [ -z "$DB_HOST" ] || [ -z "$DB_PORT" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ] || [ -z "$DB_NAME" ]; then
  echo "错误：.env.$NODE_ENV 中缺少 POSTGRES_* 数据库配置"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/${TIMESTAMP}_${DB_NAME}.dump"
LOCK_FILE="/tmp/eadaf_db_backup_${DB_NAME}.lock"

docker_postgres_target() {
  command -v docker >/dev/null 2>&1 || return 1

  if [ -n "${DB_BACKUP_DOCKER_CONTAINER:-}" ]; then
    if docker ps --filter "name=^/${DB_BACKUP_DOCKER_CONTAINER}$" --filter "status=running" -q 2>/dev/null | grep -q .; then
      echo "container:${DB_BACKUP_DOCKER_CONTAINER}"
      return 0
    fi
    return 1
  fi

  (
    cd "$PROJECT_ROOT"
    docker compose exec -T postgres pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1
  ) && {
    echo "compose:postgres"
    return 0
  }

  local container
  container="$(docker ps --filter "publish=${DB_PORT}" --format '{{.Names}}' 2>/dev/null | head -1)"
  if [ -n "$container" ]; then
    echo "container:${container}"
    return 0
  fi

  return 1
}

# Docker CLI 可能仍指向已退出/不可用的 context（如旧 OrbStack），导致 docker 命令整体连不上。
# 依次探测常见 daemon socket，找到可用的即 export DOCKER_HOST 覆盖（不影响用户全局配置）。
ensure_docker_reachable() {
  command -v docker >/dev/null 2>&1 || return 1

  # 当前配置可达则直接使用
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

exec_docker_pg_dump() {
  local target="$1"
  local output_file="$2"
  local mode="${target%%:*}"
  local name="${target#*:}"

  run_in_container() {
    if [ "$mode" = "compose" ]; then
      cd "$PROJECT_ROOT"
      docker compose exec -T -e PGPASSWORD="$DB_PASSWORD" "$name" "$@"
    else
      docker exec -i -e PGPASSWORD="$DB_PASSWORD" "$name" "$@"
    fi
  }

  # pg_dump 直接写标准输出、由宿主机重定向落盘，不再「容器内 /tmp 中转 + docker cp」：
  # Git Bash(MSYS) 启动原生程序时会把参数里的 /tmp/... 改写成宿主机临时目录，
  # 于是容器内 pg_dump 找不到输出目录（could not open output file "C:/Users/..."）。
  if ! run_in_container pg_dump -U "$DB_USER" -d "$DB_NAME" -F c --no-owner --no-acl > "$output_file"; then
    rm -f "$output_file"
    echo "错误：容器内 pg_dump 备份失败（$mode:$name）" >&2
    exit 1
  fi
}

find_local_pg_dump() {
  local candidate
  for candidate in \
    "${PG_DUMP:-}" \
    "$(command -v pg_dump 2>/dev/null || true)" \
    "/opt/homebrew/opt/postgresql@16/bin/pg_dump" \
    "/usr/local/opt/postgresql@16/bin/pg_dump"; do
    [ -n "$candidate" ] && [ -x "$candidate" ] && echo "$candidate" && return 0
  done
  return 1
}

run_pg_dump() {
  local output_file="$1"
  local use_docker="${DB_BACKUP_USE_DOCKER:-auto}"
  local docker_target=""

  if [ "$use_docker" != "false" ]; then
    # 当前 docker context 不可达（如已退出的 OrbStack）时自动探测其他可用 daemon
    ensure_docker_reachable || true
    docker_target="$(docker_postgres_target || true)"
  fi

  if [ "$use_docker" = "true" ] || { [ "$use_docker" = "auto" ] && [ -n "$docker_target" ]; }; then
    if [ -z "$docker_target" ]; then
      echo "错误：DB_BACKUP_USE_DOCKER=true 但未找到可用的 PostgreSQL Docker 容器"
      exit 1
    fi
    echo "备份方式: Docker ${docker_target#*:} pg_dump（与服务器版本一致）"
    exec_docker_pg_dump "$docker_target" "$output_file"
    return
  fi

  local pg_dump_bin
  pg_dump_bin="$(find_local_pg_dump)" || {
    echo "错误：未找到 pg_dump。可安装 postgresql@16，或启动 Docker 后重试（DB_BACKUP_USE_DOCKER=auto）"
    exit 1
  }

  echo "备份方式: 本地 $pg_dump_bin ($("$pg_dump_bin" --version | head -1))"

  if ! PGPASSWORD="$DB_PASSWORD" "$pg_dump_bin" \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -F c \
    --no-owner \
    --no-acl \
    -f "$output_file" 2>"$output_file.err"; then
    if grep -q "server version mismatch" "$output_file.err" 2>/dev/null; then
      docker_target="$(docker_postgres_target || true)"
      if [ -n "$docker_target" ]; then
        echo "本地 pg_dump 版本不匹配，改用 Docker ${docker_target#*:} pg_dump..."
        rm -f "$output_file"
        exec_docker_pg_dump "$docker_target" "$output_file"
        rm -f "$output_file.err"
        return
      fi
      echo "提示：本地 pg_dump 版本低于 PostgreSQL 服务器，请 brew install postgresql@16 或启动 Docker 数据库容器"
    fi
    cat "$output_file.err" >&2
    rm -f "$output_file" "$output_file.err"
    exit 1
  fi
  rm -f "$output_file.err"
}

if [ -f "$LOCK_FILE" ]; then
  PID="$(cat "$LOCK_FILE" 2>/dev/null || true)"
  if [ -n "$PID" ] && ps -p "$PID" >/dev/null 2>&1; then
    echo "备份进程已在运行 (PID: $PID)，请稍后再试"
    exit 1
  fi
  rm -f "$LOCK_FILE"
fi

echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

echo "=========================================="
echo " EADAF 数据库立即备份"
echo "=========================================="
echo "环境:     $NODE_ENV"
echo "数据库:   $DB_NAME @ $DB_HOST:$DB_PORT"
echo "备份目录: $BACKUP_DIR"
echo "输出文件: $BACKUP_FILE"
echo "开始时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "------------------------------------------"

run_pg_dump "$BACKUP_FILE"

if [ ! -s "$BACKUP_FILE" ]; then
  echo "错误：备份文件为空，请检查数据库连接与 Docker 容器状态"
  rm -f "$BACKUP_FILE"
  exit 1
fi

FILE_SIZE="$(du -h "$BACKUP_FILE" | awk '{print $1}')"

echo "备份成功"
echo "文件大小: $FILE_SIZE"
echo "完成时间: $(date '+%Y-%m-%d %H:%M:%S')"

echo "------------------------------------------"
echo "恢复示例:"
echo "  pg_restore -h $DB_HOST -p $DB_PORT -U $DB_USER -d <目标库> --clean --if-exists $BACKUP_FILE"
echo "=========================================="
