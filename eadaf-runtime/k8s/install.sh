#!/usr/bin/env bash
# K8s 最小安装。副本数为 1，对外端口用 hostPort（可小于 NodePort 范围）。
#   ./k8s/install.sh           首次安装（含初始化 SQL）
#   ./k8s/install.sh --upgrade 只更新程序与清单，不重新 DROP 数据库
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
UPGRADE=0
[[ "${1:-}" == "--upgrade" ]] && UPGRADE=1

die() { printf '[ERR] %s\n' "$*" >&2; exit 1; }
command -v kubectl >/dev/null 2>&1 || die "未找到 kubectl"

if [[ ! -f "$ROOT/.env" ]]; then
  cp "$ROOT/env.template" "$ROOT/.env"
  echo "已从 env.template 生成 .env，请先修改 PUBLIC_HOST、口令后再执行。"
  exit 1
fi

set -a
# shellcheck disable=SC2046
export $(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ROOT/.env" | sed 's/#.*//' | xargs)
set +a

WEB_PORT="${EADAF_WEB_HOST_PORT:-9527}"
API_PORT="${EADAF_API_HOST_PORT:-9526}"
NS="${K8S_NAMESPACE:-eadaf}"

RENDER="$(mktemp -d)"
trap 'rm -rf "$RENDER"' EXIT

render() {
  local src="$1" dest="$2"
  sed \
    -e "s|__WEB_HOST_PORT__|${WEB_PORT}|g" \
    -e "s|__API_HOST_PORT__|${API_PORT}|g" \
    -e "s|__DEPLOY_ROOT__|${ROOT}|g" \
    "$src" >"$dest"
}

render "$ROOT/k8s/namespace.yaml" "$RENDER/namespace.yaml"
render "$ROOT/k8s/data.yaml" "$RENDER/data.yaml"
render "$ROOT/k8s/apps.yaml" "$RENDER/apps.yaml"

kubectl apply -f "$RENDER/namespace.yaml"
kubectl -n "$NS" create configmap eadaf-env --from-env-file="$ROOT/.env" --dry-run=client -o yaml | kubectl apply -f -

if [[ "$UPGRADE" -eq 0 ]]; then
  kubectl apply -f "$RENDER/data.yaml"
  kubectl -n "$NS" rollout status deployment/postgres --timeout=180s
  kubectl -n "$NS" rollout status deployment/redis --timeout=120s
  kubectl -n "$NS" rollout status deployment/mysql --timeout=240s
  DEPLOY_RUNTIME=k8s K8S_NAMESPACE="$NS" bash "$ROOT/init-db.sh"
else
  echo "升级模式：不重新初始化数据库"
fi

kubectl apply -f "$RENDER/apps.yaml"
kubectl -n "$NS" rollout status deployment/eadaf-api --timeout=240s
kubectl -n "$NS" rollout status deployment/eadaf-web --timeout=120s

echo "K8s 部署完成"
echo "  管理端: http://<节点IP>:${WEB_PORT}"
echo "  API:    http://<节点IP>:${API_PORT}/api/v1/health"
echo "hostPort 绑在 Pod 所在节点，副本数为 1。"
