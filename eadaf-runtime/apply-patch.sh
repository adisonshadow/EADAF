#!/usr/bin/env bash
# 应用平台补丁：web / api，可组合。不重装 Docker，不跑表结构迁移。
# 数据补丁 bizdata 已暂时停用，配置与业务数据改走管理端「系统设置」。
set -euo pipefail

PATCH_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARTS="$(tr -d '[:space:]' <"$PATCH_ROOT/patch-parts")"

die() { printf '[ERR] %s\n' "$*" >&2; exit 1; }

if [[ -n "${DEPLOY_ROOT:-}" ]]; then
  :
elif [[ -f "$PATCH_ROOT/../docker-compose.yml" ]]; then
  DEPLOY_ROOT="$(cd "$PATCH_ROOT/.." && pwd)"
else
  die "请设置 DEPLOY_ROOT=/path/to/eadaf-runtime"
fi
DEPLOY_ROOT="$(cd "$DEPLOY_ROOT" && pwd)"
echo "DEPLOY_ROOT=$DEPLOY_ROOT"
echo "PARTS=$PARTS"

# 补丁包不覆盖平台 lib.sh；现场可能是旧版，缺 load_deploy_choice 时用本地兼容实现。
# shellcheck disable=SC1091
[[ -f "$DEPLOY_ROOT/lib.sh" ]] && source "$DEPLOY_ROOT/lib.sh"
if ! declare -F load_deploy_choice >/dev/null 2>&1; then
  load_deploy_choice() {
    local root="${1:-.}"
    if [[ -f "$root/.deploy-mode" ]]; then
      # shellcheck disable=SC1091
      source "$root/.deploy-mode"
    fi
    if [[ -z "${DEPLOY_RUNTIME:-}" && -n "${DEPLOY_MODE:-}" ]]; then
      case "$DEPLOY_MODE" in
        k8s) DEPLOY_RUNTIME=k8s; DEPLOY_NETWORK="${DEPLOY_NETWORK:-offline}" ;;
        normal|online) DEPLOY_RUNTIME=compose; DEPLOY_NETWORK=online ;;
        *) DEPLOY_RUNTIME=compose; DEPLOY_NETWORK="${DEPLOY_NETWORK:-offline}" ;;
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
fi
load_deploy_choice "$DEPLOY_ROOT"

has() { [[ ",$PARTS," == *",$1,"* ]]; }

if has bizdata; then
  die "数据补丁已暂时停用。请用管理端「系统设置」的 EADAF / 应用数据包导出、导入。"
fi

if has web; then
  [[ -d "$PATCH_ROOT/frontend/dist" ]] || die "补丁缺少 frontend/dist"
  rm -rf "$DEPLOY_ROOT/frontend/dist"
  mkdir -p "$DEPLOY_ROOT/frontend"
  cp -a "$PATCH_ROOT/frontend/dist" "$DEPLOY_ROOT/frontend/dist"
  echo "已覆盖 frontend/dist"
fi

if has api; then
  mkdir -p "$DEPLOY_ROOT/docker-images"
  cp -a "$PATCH_ROOT/docker-images/." "$DEPLOY_ROOT/docker-images/"
fi

# 数据补丁暂时停用。
# if has bizdata; then
#   [[ -f "$PATCH_ROOT/bizdata-patch.sql" ]] || die "补丁缺少 bizdata-patch.sql"
# fi

if [[ "$DEPLOY_RUNTIME" == "k8s" ]]; then
  if has api; then
    bash "$DEPLOY_ROOT/k8s/load-images.sh"
    bash "$DEPLOY_ROOT/k8s/install.sh" --upgrade
  elif has web; then
    bash "$DEPLOY_ROOT/k8s/install.sh" --upgrade
  fi
  # 数据补丁暂时停用。
  # if has bizdata; then
  #   DEPLOY_RUNTIME=k8s bash -c '
  #     set -euo pipefail
  #     root="$1"; sql="$2"
  #     # shellcheck disable=SC1091
  #     if [[ -f "$root/.env" ]]; then
  #       set -a
  #       export $(grep -E "^[A-Za-z_][A-Za-z0-9_]*=" "$root/.env" | sed "s/#.*//" | xargs)
  #       set +a
  #     fi
  #     pod="$(kubectl get pod -n "${K8S_NAMESPACE:-eadaf}" -l app=eadaf-postgres -o jsonpath="{.items[0].metadata.name}")"
  #     kubectl exec -i -n "${K8S_NAMESPACE:-eadaf}" "$pod" -- \
  #       env PGPASSWORD="${POSTGRES_PASSWORD:-123456}" \
  #       psql -U "${POSTGRES_USER:-my_name}" -d "${POSTGRES_DATABASE:-eadaf_db}" -v ON_ERROR_STOP=1 <"$sql"
  #   ' bash "$DEPLOY_ROOT" "$PATCH_ROOT/bizdata-patch.sql"
  # fi
else
  # shellcheck disable=SC1091
  source "$DEPLOY_ROOT/lib.sh"
  OFFLINE_ROOT="$DEPLOY_ROOT"
  require_docker
  init_compose
  if has api; then
    load_module_images eadaf-api
    compose up -d --force-recreate --no-deps eadaf-api
    wait_container_healthy EADAF-api 240
  fi
  if has web; then
    compose up -d --force-recreate --no-deps eadaf-web
    wait_container_healthy EADAF-web 90
  fi
  # 数据补丁暂时停用。
  # if has bizdata; then
  #   if [[ -f "$DEPLOY_ROOT/.env" ]]; then
  #     set -a
  #     # shellcheck disable=SC2046
  #     export $(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$DEPLOY_ROOT/.env" | sed 's/#.*//' | xargs)
  #     set +a
  #   fi
  #   docker exec -i -e PGPASSWORD="${POSTGRES_PASSWORD:-123456}" "${POSTGRES_CONTAINER:-EADAF-postgres}" \
  #     psql -U "${POSTGRES_USER:-my_name}" -d "${POSTGRES_DATABASE:-eadaf_db}" -v ON_ERROR_STOP=1 \
  #     <"$PATCH_ROOT/bizdata-patch.sql"
  #   echo "bizdata 补丁已执行"
  # fi
  if has api || has web; then
    bash "$DEPLOY_ROOT/status.sh"
  fi
fi

echo "补丁完成"
