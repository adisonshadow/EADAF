#!/usr/bin/env bash
# One-shot first boot: load images, start platform stack, init DB, force status check.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$ROOT/lib.sh"
OFFLINE_ROOT="$ROOT"

require_docker
init_compose

log_step "1/6 预检"
if [[ ! -f "$ROOT/.env" ]]; then
  if [[ -f "$ROOT/env.template" ]]; then
    cp "$ROOT/env.template" "$ROOT/.env"
    log_warn "已从 env.template 生成 .env，请先编辑 PUBLIC_HOST 等后再继续"
  else
    die "缺少 .env（请从 env.template 复制）"
  fi
fi
[[ -f "$ROOT/frontend/dist/index.html" ]] || die "缺少 frontend/dist/index.html（EADAF 前端静态资源未打进包；请先在开发机执行 pnpm offline:deploy）"
[[ -d "$ROOT/docker-images" ]] || die "缺少 docker-images 目录"
shopt -s nullglob
tars=(./docker-images/*.tar)
shopt -u nullglob
[[ ${#tars[@]} -gt 0 ]] || die "docker-images 下没有 *.tar"
log_ok "预检通过（镜像包 ${#tars[@]} 个）"

# 旧包容器名 EADAF-nginx → 新编排 EADAF-web，避免占 9527
if docker inspect EADAF-nginx >/dev/null 2>&1; then
  log_warn "检测到旧容器 EADAF-nginx，将移除以便启动 EADAF-web"
  docker rm -f EADAF-nginx >/dev/null || true
fi

load_dotenv
apply_public_host_urls
mkdir -p "$ROOT/data" "$ROOT/logs/api" "$ROOT/logs/nginx"

log_step "2/6 加载全部镜像"
load_module_images all

log_step "3/6 启动数据库依赖"
if [[ "${USE_MYSQL:-0}" == "1" ]]; then
  compose up -d postgres redis mysql
else
  compose up -d postgres redis
  if docker ps -a --format '{{.Names}}' | grep -qx 'EADAF-mysql'; then
    log_warn "未使用 MySQL 作为业务数据库，停止已有 EADAF-mysql（数据卷保留）"
    compose stop mysql
    compose rm -f mysql
  fi
fi
wait_container_healthy EADAF-postgres 120
wait_container_healthy EADAF-redis 60
if [[ "${USE_MYSQL:-0}" == "1" ]]; then
  wait_container_healthy EADAF-mysql 180
fi

log_step "4/6 初始化 EADAF 数据库"
bash "$ROOT/init-db.sh"

log_step "5/6 启动 MinIO / eadaf-api / eadaf-web"
compose up -d minio
wait_container_healthy EADAF-minio 120
compose up -d eadaf-api
wait_container_healthy EADAF-api 240
log_step "修正默认业务库连接（本地 PostgreSQL（应用库））"
bash "$ROOT/init-db.sh" --fix-connection-only
compose up -d eadaf-web
wait_container_healthy EADAF-web 90

log_step "6/6 状态巡检（失败即判定部署未成功）"
bash "$ROOT/status.sh"

echo ""
log_ok "启动完成"
print_access_urls
echo "运维命令: ./ctl.sh status | ./ctl.sh reinstall eadaf-web | ./ctl.sh logs eadaf-api -f"
