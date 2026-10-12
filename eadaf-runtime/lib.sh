#!/usr/bin/env bash
# Shared helpers for offline deploy ops (source from other scripts).
# shellcheck disable=SC2034

OFFLINE_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OFFLINE_ROOT="${OFFLINE_ROOT:-$OFFLINE_LIB_DIR}"

# module|compose_service|container_name|image|tar_filename
OFFLINE_MODULES=(
  "postgres|postgres|EADAF-postgres|postgres:16-alpine|postgres_16-alpine.tar"
  "redis|redis|EADAF-redis|redis:7-alpine|redis_7-alpine.tar"
  "mysql|mysql|EADAF-mysql|mysql:8.0|mysql_8.0.tar"
  "eadaf-api|eadaf-api|EADAF-api|eadaf-api:v1|eadaf-api_v1.tar"
  "eadaf-web|eadaf-web|EADAF-web|nginx:1.25-alpine|nginx_1.25-alpine.tar"
  "minio|minio|EADAF-minio|eadaf-minio:v1|eadaf-minio_v1.tar"
)

OFFLINE_APP_MODULES=(eadaf-api eadaf-web)
OFFLINE_DB_MODULES=(postgres redis mysql)
OFFLINE_ALL_MODULES=(postgres redis mysql minio eadaf-api eadaf-web)

log_step() { printf '\n==== %s ====\n' "$*"; }
log_ok() { printf '[OK] %s\n' "$*"; }
log_warn() { printf '[WARN] %s\n' "$*"; }
log_err() { printf '[ERR] %s\n' "$*" >&2; }

die() {
  log_err "$*"
  exit 1
}

# 读取 .deploy-mode。网络（offline|online）与运行方式（compose|k8s）分开。
# 旧包只有 DEPLOY_MODE=offline|normal|k8s 时，在这里换算成新字段。
load_deploy_choice() {
  local root="${1:-$OFFLINE_ROOT}"
  if [[ -f "$root/.deploy-mode" ]]; then
    # shellcheck disable=SC1091
    source "$root/.deploy-mode"
  fi
  if [[ -z "${DEPLOY_RUNTIME:-}" && -n "${DEPLOY_MODE:-}" ]]; then
    case "$DEPLOY_MODE" in
      k8s)
        DEPLOY_RUNTIME=k8s
        DEPLOY_NETWORK="${DEPLOY_NETWORK:-offline}"
        ;;
      normal|online)
        DEPLOY_RUNTIME=compose
        DEPLOY_NETWORK=online
        ;;
      *)
        DEPLOY_RUNTIME=compose
        DEPLOY_NETWORK="${DEPLOY_NETWORK:-offline}"
        ;;
    esac
  fi
  DEPLOY_NETWORK="${DEPLOY_NETWORK:-offline}"
  DEPLOY_RUNTIME="${DEPLOY_RUNTIME:-compose}"
  if [[ "$DEPLOY_RUNTIME" == "k8s" ]]; then
    DEPLOY_MODE=k8s
  elif [[ "$DEPLOY_NETWORK" == "online" ]]; then
    DEPLOY_MODE=normal
  else
    DEPLOY_MODE=offline
  fi
  export DEPLOY_NETWORK DEPLOY_RUNTIME DEPLOY_MODE
}

require_docker() {
  command -v docker >/dev/null 2>&1 || die "未找到 docker。请先执行 ./start.sh 选择 OS/架构后安装静态 Docker"
  if ! docker_err="$(docker info 2>&1 >/dev/null)"; then
    die "Docker 没有启动，或当前用户无权访问。请先打开 Docker Desktop。${docker_err:+ 详情: ${docker_err}}"
  fi
}

init_compose() {
  COMPOSE=(docker-compose)
  if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
  elif ! command -v docker-compose >/dev/null 2>&1; then
    die "未找到 docker-compose / docker compose"
  fi
}

compose() {
  (cd "$OFFLINE_ROOT" && "${COMPOSE[@]}" "$@")
}

load_dotenv() {
  local env_file="$OFFLINE_ROOT/.env"
  [[ -f "$env_file" ]] || return 0
  set -a
  # shellcheck disable=SC2046
  export $(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$env_file" | sed 's/#.*//' | xargs) || true
  set +a
}

apply_public_host_urls() {
  local env_file="$OFFLINE_ROOT/.env"
  [[ -f "$env_file" ]] || return 0
  load_dotenv
  local host="${PUBLIC_HOST:-localhost}"
  local scheme="${PUBLIC_SCHEME:-http}"
  local web_port="${EADAF_WEB_HOST_PORT:-9527}"
  [[ -n "$host" ]] || return 0

  EADAF_PUBLIC_URL="${scheme}://${host}:${web_port}"
  export EADAF_PUBLIC_URL PUBLIC_HOST="$host" PUBLIC_SCHEME="$scheme" EADAF_WEB_HOST_PORT="$web_port"

  if [[ "$(uname -s)" == "Darwin" ]]; then
    sed -i '' \
      -e "s|^EADAF_PUBLIC_URL=.*|EADAF_PUBLIC_URL=${EADAF_PUBLIC_URL}|" \
      "$env_file"
  else
    sed -i \
      -e "s|^EADAF_PUBLIC_URL=.*|EADAF_PUBLIC_URL=${EADAF_PUBLIC_URL}|" \
      "$env_file"
  fi
  log_ok "已按 PUBLIC_HOST=${host} 写入对外 URL"
}

module_field() {
  # usage: module_field <module> <index 1=service 2=container 3=image 4=tar>
  local want="$1" idx="$2" row
  for row in "${OFFLINE_MODULES[@]}"; do
    IFS='|' read -r name service container image tar <<<"$row"
    if [[ "$name" == "$want" ]]; then
      case "$idx" in
        1) printf '%s\n' "$service" ;;
        2) printf '%s\n' "$container" ;;
        3) printf '%s\n' "$image" ;;
        4) printf '%s\n' "$tar" ;;
      esac
      return 0
    fi
  done
  return 1
}

module_service() { module_field "$1" 1; }
module_container() { module_field "$1" 2; }
module_image() { module_field "$1" 3; }
module_tar() { module_field "$1" 4; }

resolve_modules() {
  # args: all | module...  -> prints module names one per line
  local arg
  if [[ $# -eq 0 || "$1" == "all" ]]; then
    printf '%s\n' "${OFFLINE_ALL_MODULES[@]}"
    return 0
  fi
  for arg in "$@"; do
    if ! module_service "$arg" >/dev/null; then
      die "未知模块: $arg（可选: ${OFFLINE_ALL_MODULES[*]}）"
    fi
    printf '%s\n' "$arg"
  done
}

dump_container_logs() {
  local cname="$1" lines="${2:-100}"
  log_err "---- docker logs --tail ${lines} ${cname} ----"
  docker logs --tail "$lines" "$cname" 2>&1 || true
  log_err "---- end logs ${cname} ----"
  # eadaf-api 生产环境 winston 只写文件，docker logs 往往只有 DB 连接成功；补充文件日志
  if [[ "$cname" == "EADAF-api" ]]; then
    local api_log_dir="$OFFLINE_ROOT/logs/api"
    if [[ -d "$api_log_dir" ]]; then
      log_err "---- files in ${api_log_dir} ----"
      ls -la "$api_log_dir" 2>&1 || true
      local f
      for f in \
        "$api_log_dir"/rejections-*.log \
        "$api_log_dir"/exceptions-*.log \
        "$api_log_dir"/error-*.log \
        "$api_log_dir"/app-*.log; do
        [[ -f "$f" ]] || continue
        log_err "---- tail ${lines} $(basename "$f") ----"
        tail -n "$lines" "$f" 2>&1 || true
      done
      log_err "---- end file logs EADAF-api ----"
    fi
  fi
}

container_running() {
  local cname="$1"
  local st
  st="$(docker inspect -f '{{.State.Running}}' "$cname" 2>/dev/null || echo false)"
  [[ "$st" == "true" ]]
}

container_health() {
  local cname="$1"
  local h
  h="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cname" 2>/dev/null || echo missing)"
  printf '%s\n' "$h"
}

wait_container_running() {
  local cname="$1" timeout="${2:-60}"
  local i
  for i in $(seq 1 "$timeout"); do
    if container_running "$cname"; then
      return 0
    fi
    sleep 1
  done
  dump_container_logs "$cname"
  die "容器未运行: $cname（等待 ${timeout}s）"
}

wait_container_healthy() {
  local cname="$1" timeout="${2:-180}"
  local i h
  wait_container_running "$cname" 30
  for i in $(seq 1 "$timeout"); do
    h="$(container_health "$cname")"
    case "$h" in
      healthy|none)
        # none = no healthcheck configured but running
        if [[ "$h" == "healthy" ]] || [[ "$h" == "none" ]]; then
          if [[ "$h" == "healthy" ]]; then
            log_ok "$cname healthy"
            return 0
          fi
          # no healthcheck: accept running after short settle
          if [[ "$i" -ge 3 ]]; then
            log_ok "$cname running（无 healthcheck）"
            return 0
          fi
        fi
        ;;
      unhealthy)
        dump_container_logs "$cname"
        die "容器 unhealthy: $cname"
        ;;
      starting|missing)
        ;;
    esac
    sleep 1
  done
  dump_container_logs "$cname"
  die "等待 healthy 超时: $cname（${timeout}s） health=$(container_health "$cname")"
}

http_check() {
  # http_check <url> [expect_substr]
  local url="$1" expect="${2:-}"
  local code body tmp
  tmp="$(mktemp)"
  # curl 连不上时会同时写出 http_code=000 并以非 0 退出；不要再用 || echo 000，否则会变成 000000 并误判为成功
  code="$(curl -sS -o "$tmp" -w '%{http_code}' --connect-timeout 3 --max-time 10 "$url" 2>/dev/null || true)"
  [[ -n "$code" ]] || code="000"
  body="$(cat "$tmp" 2>/dev/null || true)"
  rm -f "$tmp"
  if [[ "$code" == "000" ]]; then
    log_err "HTTP 无法连接: $url"
    return 1
  fi
  if [[ "$code" =~ ^[45] ]]; then
    log_err "HTTP $code: $url"
    return 1
  fi
  if [[ -n "$expect" ]] && ! grep -q "$expect" <<<"$body"; then
    log_err "HTTP 响应缺少期望内容「${expect}」: $url (code=$code)"
    return 1
  fi
  log_ok "HTTP $code $url"
  return 0
}

load_module_image() {
  local mod="$1"
  local tar_name image_name tar_path
  tar_name="$(module_tar "$mod")"
  image_name="$(module_image "$mod")"
  tar_path="$OFFLINE_ROOT/docker-images/$tar_name"
  [[ -f "$tar_path" ]] || die "缺少镜像包: $tar_path"
  log_step "加载镜像 $mod -> $image_name ($tar_name)"
  # 用 stdin，避免 Docker Desktop 在 /mnt/c 等路径上 docker load -i 找不到文件
  docker load <"$tar_path"
  log_ok "已加载 $image_name"
}

load_module_images() {
  local m
  while IFS= read -r m; do
    [[ -n "$m" ]] || continue
    load_module_image "$m"
  done < <(resolve_modules "$@")
}

print_access_urls() {
  local host="${PUBLIC_HOST:-<服务器IP>}"
  echo ""
  local web_port="${EADAF_WEB_HOST_PORT:-9527}"
  local api_port="${EADAF_API_HOST_PORT:-9526}"
  echo "访问地址:"
  echo "  EADAF 管理端: http://${host}:${web_port}"
  echo "  EADAF API:    http://${host}:${api_port}/api/v1/health"
  echo "  日志目录:     ./logs/api  ./logs/nginx"
  echo "  业务应用由单独的应用包安装，不在本底座内。"
}
