#!/usr/bin/env bash
# 把本升级包应用到已安装的 eadaf-runtime。保留 .env 与数据卷，不重装 Docker / 集群。
# 升级包暂时只有程序，不覆盖、不执行 init-db 表结构。
set -euo pipefail

PATCH_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { printf '[ERR] %s\n' "$*" >&2; exit 1; }

if [[ -n "${DEPLOY_ROOT:-}" ]]; then
  :
elif [[ -f "$PATCH_ROOT/docker-compose.yml" && -f "$PATCH_ROOT/.env" ]]; then
  DEPLOY_ROOT="$PATCH_ROOT"
else
  die "请设置 DEPLOY_ROOT=/path/to/eadaf-runtime"
fi
DEPLOY_ROOT="$(cd "$DEPLOY_ROOT" && pwd)"
echo "DEPLOY_ROOT=$DEPLOY_ROOT"

# 先记下选择；复制新 lib.sh 之后再正规化一次
if [[ -f "$DEPLOY_ROOT/.deploy-mode" ]]; then
  # shellcheck disable=SC1091
  source "$DEPLOY_ROOT/.deploy-mode"
fi

copy_tree() {
  local src="$1" dest="$2"
  [[ -e "$src" ]] || return 0
  mkdir -p "$(dirname "$dest")"
  cp -a "$src" "$dest"
}

# 更新底座脚本与编排，不覆盖现场 .env
for f in docker-compose.yml lib.sh up.sh ctl.sh status.sh init-db.sh start.sh \
  install-docker.sh env.template \
  nginx/conf/default.conf init/fix-db-connection.js; do
  # 表结构只留在安装包，升级不覆盖：apply-schema.sh init-sql.manifest schema-baseline.txt
  [[ -e "$PATCH_ROOT/$f" ]] || continue
  mkdir -p "$DEPLOY_ROOT/$(dirname "$f")"
  cp -a "$PATCH_ROOT/$f" "$DEPLOY_ROOT/$f"
done
if [[ -d "$PATCH_ROOT/k8s" ]]; then
  mkdir -p "$DEPLOY_ROOT/k8s"
  cp -a "$PATCH_ROOT/k8s/." "$DEPLOY_ROOT/k8s/"
fi
# 升级包暂时不带表结构 SQL。
# if [[ -d "$PATCH_ROOT/init-sql" ]]; then
#   mkdir -p "$DEPLOY_ROOT/init-sql"
#   cp -a "$PATCH_ROOT/init-sql/." "$DEPLOY_ROOT/init-sql/"
# fi
if [[ -d "$PATCH_ROOT/frontend/dist" ]]; then
  mkdir -p "$DEPLOY_ROOT/frontend"
  rm -rf "$DEPLOY_ROOT/frontend/dist"
  cp -a "$PATCH_ROOT/frontend/dist" "$DEPLOY_ROOT/frontend/dist"
fi
if [[ -d "$PATCH_ROOT/docker-images" ]]; then
  mkdir -p "$DEPLOY_ROOT/docker-images"
  cp -a "$PATCH_ROOT/docker-images/." "$DEPLOY_ROOT/docker-images/"
fi

if [[ -f "$DEPLOY_ROOT/.env" ]] && ! grep -q '^MINIO_ENDPOINT=' "$DEPLOY_ROOT/.env"; then
  cat >>"$DEPLOY_ROOT/.env" <<'EOF'

# 文件存储（MinIO 独立卷）。已有 .env 升级时补上，不覆盖其它项。
MINIO_ENDPOINT=http://minio:9000
MINIO_ACCESS_KEY=eadaf
MINIO_SECRET_KEY=eadaf-minio-secret
MINIO_BUCKET=eadaf
MINIO_ROOT_USER=eadaf
MINIO_ROOT_PASSWORD=eadaf-minio-secret
EOF
fi

chmod +x "$DEPLOY_ROOT/lib.sh" "$DEPLOY_ROOT/ctl.sh" 2>/dev/null || true
# shellcheck disable=SC1091
source "$DEPLOY_ROOT/lib.sh"
load_deploy_choice "$DEPLOY_ROOT"

if [[ "$DEPLOY_RUNTIME" == "k8s" ]]; then
  bash "$DEPLOY_ROOT/k8s/load-images.sh"
  # 升级暂时不跑表结构迁移。init-db 只在 EADAF 安装包。
  # bash "$DEPLOY_ROOT/apply-schema.sh"
  bash "$DEPLOY_ROOT/k8s/install.sh" --upgrade
else
  # shellcheck disable=SC1091
  source "$DEPLOY_ROOT/lib.sh"
  OFFLINE_ROOT="$DEPLOY_ROOT"
  require_docker
  init_compose
  if [[ -d "$PATCH_ROOT/docker-images" ]]; then
    load_module_images eadaf-api eadaf-web minio
  fi
  # 升级暂时不跑表结构迁移。init-db 只在 EADAF 安装包。
  # bash "$DEPLOY_ROOT/apply-schema.sh"
  apply_public_host_urls
  compose up -d minio
  wait_container_healthy EADAF-minio 120
  compose up -d --force-recreate --no-deps eadaf-api
  wait_container_healthy EADAF-api 240
  compose up -d --force-recreate --no-deps eadaf-web
  wait_container_healthy EADAF-web 90
  bash "$DEPLOY_ROOT/status.sh"
fi

if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q 'FPCU'; then
  echo ""
  echo "检测到仍在运行的 FPCU 容器。本次平台升级不会删除它们。"
  echo "之后请改用应用包接管该业务应用。"
fi

echo "升级完成"
