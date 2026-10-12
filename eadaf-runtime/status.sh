#!/usr/bin/env bash
# Print full stack status + HTTP probes. Exit 1 if any critical check fails.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$ROOT/lib.sh"
OFFLINE_ROOT="$ROOT"

require_docker
init_compose
load_dotenv

FAIL=0

printf '\n%-12s %-14s %-10s %-12s %s\n' "MODULE" "CONTAINER" "STATE" "HEALTH" "PORTS"
printf '%s\n' "--------------------------------------------------------------------------------"

check_module_row() {
  local mod="$1"
  local cname service state health ports
  cname="$(module_container "$mod")"
  service="$(module_service "$mod")"
  if ! docker inspect "$cname" >/dev/null 2>&1; then
    printf '%-12s %-14s %-10s %-12s %s\n' "$mod" "$cname" "missing" "-" "-"
    log_err "容器不存在: $cname (compose service=$service)"
    FAIL=1
    return
  fi
  state="$(docker inspect -f '{{.State.Status}}' "$cname")"
  health="$(container_health "$cname")"
  ports="$(docker inspect -f '{{range $p,$conf := .NetworkSettings.Ports}}{{if $conf}}{{(index $conf 0).HostPort}}->{{$p}} {{end}}{{end}}' "$cname" 2>/dev/null || echo "-")"
  printf '%-12s %-14s %-10s %-12s %s\n' "$mod" "$cname" "$state" "$health" "${ports:-'-'}"
  if [[ "$state" != "running" ]]; then
    log_err "$mod 未 running（state=$state）"
    FAIL=1
    dump_container_logs "$cname" 80
    return
  fi
  if [[ "$health" == "unhealthy" ]]; then
    log_err "$mod unhealthy"
    FAIL=1
    dump_container_logs "$cname" 80
  fi
}

for mod in "${OFFLINE_ALL_MODULES[@]}"; do
  check_module_row "$mod"
done

echo ""
log_step "静态资源检查"
if [[ -f "$ROOT/frontend/dist/index.html" ]]; then
  log_ok "frontend/dist/index.html 存在"
else
  log_err "缺少 frontend/dist/index.html（EADAF web 无静态资源）"
  FAIL=1
fi

echo ""
log_step "HTTP 巡检"
web_port="${EADAF_WEB_HOST_PORT:-9527}"
api_port="${EADAF_API_HOST_PORT:-9526}"
http_check "http://127.0.0.1:${web_port}/" || FAIL=1
http_check "http://127.0.0.1:${api_port}/api/v1/health" || FAIL=1

echo ""
if [[ "$FAIL" -ne 0 ]]; then
  log_err "状态巡检失败。常用排查:"
  echo "  ./ctl.sh logs eadaf-web --tail 100"
  echo "  ./ctl.sh logs eadaf-api --tail 100"
  echo "  ./ctl.sh reinstall eadaf-web"
  echo "  ls -la frontend/dist logs/nginx"
  exit 1
fi

log_ok "全部组件状态正常"
print_access_urls
