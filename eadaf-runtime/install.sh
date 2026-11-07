#!/usr/bin/env bash
# 安装包入口：选择操作系统与 CPU 架构、是否使用 MySQL、对外端口，再安装 Docker / 启动整栈。
# 用法：
#   ./install.sh
#   ./install.sh --os ubuntu --arch amd64 --action up
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLATFORM_FILE="$ROOT/.deploy-platform"
STATIC_ROOT="$ROOT/docker-static"
INSTALL_LOG="$ROOT/logs/install-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "$ROOT/logs"
exec > >(tee -a "$INSTALL_LOG") 2>&1
on_install_fail() {
  local code=$?
  # 输出被接到 tee 时，ERR 陷阱里的 $? 可能变成 0
  if [[ "$code" -eq 0 ]]; then
    code=1
  fi
  echo ""
  echo "[ERR] 安装未完成（退出码 ${code}）。详细日志：$INSTALL_LOG"
  exit "$code"
}
trap on_install_fail ERR
echo "本次安装日志: $INSTALL_LOG"

CLI_OS=""
CLI_ARCH=""
ACTION=""

usage() {
  cat <<'EOF'
用法: ./install.sh [--os centos|ubuntu|debian] [--arch amd64|arm64] [--action install-docker|up|status]

无参数时进入交互菜单（推荐）。
文档中的 CentOS + amd64 只是示例。业务应用请另用应用包。
EOF
}

die() { printf '[ERR] %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --os) CLI_OS="${2:-}"; shift 2 ;;
    --arch) CLI_ARCH="${2:-}"; shift 2 ;;
    --action) ACTION="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "未知参数: $1（见 --help）" ;;
  esac
done

normalize_os() {
  local v
  v="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$v" in
    centos|rhel|rocky|alma|almalinux) echo centos ;;
    ubuntu) echo ubuntu ;;
    debian) echo debian ;;
    *) return 1 ;;
  esac
}

normalize_arch() {
  local v
  v="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$v" in
    amd64|x86_64|x64) echo amd64 ;;
    arm64|aarch64) echo arm64 ;;
    *) return 1 ;;
  esac
}

detect_os_hint() {
  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    case "${ID:-}" in
      centos|rhel|rocky|almalinux) echo centos ;;
      ubuntu) echo ubuntu ;;
      debian) echo debian ;;
      *) echo "" ;;
    esac
  else
    echo ""
  fi
}

detect_arch_hint() {
  case "$(uname -m)" in
    x86_64|amd64) echo amd64 ;;
    aarch64|arm64) echo arm64 ;;
    *) echo "" ;;
  esac
}

load_saved_platform() {
  DEPLOY_OS=""
  DEPLOY_ARCH=""
  [[ -f "$PLATFORM_FILE" ]] || return 0
  # shellcheck disable=SC1090
  source "$PLATFORM_FILE"
  DEPLOY_OS="${DEPLOY_OS:-}"
  DEPLOY_ARCH="${DEPLOY_ARCH:-}"
}

save_platform() {
  cat >"$PLATFORM_FILE" <<EOF
# 由 ./install.sh 生成；勿手改除非清楚含义
DEPLOY_OS=${DEPLOY_OS}
DEPLOY_ARCH=${DEPLOY_ARCH}
EOF
  printf '[OK] 已写入 %s（%s / %s）\n' "$PLATFORM_FILE" "$DEPLOY_OS" "$DEPLOY_ARCH"
}

prompt_os() {
  local hint
  hint="$(detect_os_hint)"
  echo ""
  echo "请选择操作系统（文档以 CentOS 为例，也可选 Ubuntu / Debian）："
  echo "  1) CentOS / RHEL / Rocky / Alma"
  echo "  2) Ubuntu"
  echo "  3) Debian"
  if [[ -n "$hint" ]]; then
    printf "检测到本机可能是 %s，直接回车可采用检测结果\n" "$hint"
  fi
  local choice
  while true; do
    read -r -p "选择 [1-3${hint:+，回车=检测}]: " choice
    if [[ -z "$choice" && -n "$hint" ]]; then
      DEPLOY_OS="$hint"
      break
    fi
    case "$choice" in
      1) DEPLOY_OS=centos; break ;;
      2) DEPLOY_OS=ubuntu; break ;;
      3) DEPLOY_OS=debian; break ;;
      *) echo "请输入 1 / 2 / 3" ;;
    esac
  done
}

prompt_arch() {
  local hint
  hint="$(detect_arch_hint)"
  echo ""
  echo "请选择 CPU 架构（文档以 amd64 / x86_64 为例）："
  echo "  1) amd64 / x86_64"
  echo "  2) arm64 / aarch64"
  if [[ -n "$hint" ]]; then
    printf "检测到本机可能是 %s，直接回车可采用检测结果\n" "$hint"
  fi
  local choice
  while true; do
    read -r -p "选择 [1-2${hint:+，回车=检测}]: " choice
    if [[ -z "$choice" && -n "$hint" ]]; then
      DEPLOY_ARCH="$hint"
      break
    fi
    case "$choice" in
      1) DEPLOY_ARCH=amd64; break ;;
      2) DEPLOY_ARCH=arm64; break ;;
      *) echo "请输入 1 / 2" ;;
    esac
  done
}

prompt_action() {
  echo ""
  echo "请选择下一步："
  echo "  1) 全自动安装并启动（先安装 Docker，已有则跳过；再启动整栈并检查状态）"
  if [[ "$DEPLOY_NETWORK" == "online" ]]; then
    echo "  2) 只安装 Docker（用系统包管理器，已安装则跳过；不启动 EADAF 容器）"
  else
    echo "  2) 只安装 Docker（离线静态包，不启动 EADAF 容器）"
  fi
  echo "  3) 启动整栈（./up.sh，结束后会执行 ./status.sh）"
  echo "  4) 查看状态（./status.sh）"
  echo "  5) 退出"
  local choice
  while true; do
    read -r -p "选择 [1-5]，按回车默认 1: " choice
    case "${choice:-1}" in
      1) ACTION=auto; break ;;
      2) ACTION=install-docker; break ;;
      3) ACTION=up; break ;;
      4) ACTION=status; break ;;
      5) ACTION=exit; break ;;
      *) echo "请输入 1 / 2 / 3 / 4 / 5" ;;
    esac
  done
}

WEB_PORT_DEFAULT=9527
API_PORT_DEFAULT=9526
POSTGRES_PORT_DEFAULT=35432
REDIS_PORT_DEFAULT=36379
MINIO_PORT_DEFAULT=9000
MYSQL_PORT_DEFAULT=13306

ensure_env_file() {
  if [[ ! -f "$ROOT/.env" ]]; then
    [[ -f "$ROOT/env.template" ]] || die "缺少 .env 与 env.template"
    cp "$ROOT/env.template" "$ROOT/.env"
    echo "已从 env.template 生成 .env"
  fi
}

upsert_env() {
  local key="$1" value="$2" file="$ROOT/.env"
  if grep -q "^${key}=" "$file"; then
    if [[ "$(uname -s)" == "Darwin" ]]; then
      sed -i '' "s|^${key}=.*|${key}=${value}|" "$file"
    else
      sed -i "s|^${key}=.*|${key}=${value}|" "$file"
    fi
  else
    printf '%s=%s\n' "$key" "$value" >>"$file"
  fi
}

keep_packed_ports() {
  : "${EADAF_WEB_HOST_PORT:=$WEB_PORT_DEFAULT}"
  : "${EADAF_API_HOST_PORT:=$API_PORT_DEFAULT}"
  : "${POSTGRES_HOST_PORT:=$POSTGRES_PORT_DEFAULT}"
  : "${REDIS_HOST_PORT:=$REDIS_PORT_DEFAULT}"
  : "${MINIO_HOST_PORT:=$MINIO_PORT_DEFAULT}"
  : "${MYSQL_HOST_PORT:=$MYSQL_PORT_DEFAULT}"
  : "${USE_MYSQL:=0}"
  : "${PACK_MYSQL:=1}"
}

mysql_is_packed() {
  [[ "${PACK_MYSQL:-1}" == "1" ]]
}

print_packed_defaults() {
  ensure_env_file
  load_dotenv
  keep_packed_ports
  local line="安装包默认：前端 ${EADAF_WEB_HOST_PORT}，后端 ${EADAF_API_HOST_PORT}，Postgres ${POSTGRES_HOST_PORT}，Redis ${REDIS_HOST_PORT}，MinIO ${MINIO_HOST_PORT}"
  if mysql_is_packed; then
    if [[ "$USE_MYSQL" == "1" ]]; then
      line="${line}，使用MySQL作为业务数据库（端口 ${MYSQL_HOST_PORT}）"
    else
      line="${line}，MySQL 否（已打入安装包，安装时可选）"
    fi
  fi
  echo "$line"
}

read_port() {
  local label="$1" default="$2" varname="$3" input
  while true; do
    read -r -p "${label} 对外端口 [${default}]: " input
    input="${input:-$default}"
    if [[ "$input" =~ ^[0-9]+$ ]] && (( input >= 1 && input <= 65535 )); then
      printf -v "$varname" '%s' "$input"
      return 0
    fi
    echo "请输入 1 到 65535 之间的整数"
  done
}

prompt_mysql() {
  keep_packed_ports
  if ! mysql_is_packed; then
    USE_MYSQL=0
    return 0
  fi
  local packed="$USE_MYSQL" packed_text="否"
  if [[ "$packed" == "1" ]]; then
    packed_text="是"
  fi
  echo ""
  echo "是否使用 MySQL 作为业务数据库（安装包默认：${packed_text}）："
  echo "  1) 否"
  echo "  2) 是"
  local choice
  while true; do
    read -r -p "选择 [1-2，回车=沿用安装包默认]: " choice
    case "${choice:-keep}" in
      keep) USE_MYSQL="$packed"; break ;;
      1) USE_MYSQL=0; break ;;
      2) USE_MYSQL=1; break ;;
      *) echo "请输入 1 / 2" ;;
    esac
  done
}

prompt_custom_ports() {
  echo ""
  echo "填写对外映射端口，直接回车使用方括号中的值。"
  read_port "前端" "${EADAF_WEB_HOST_PORT:-$WEB_PORT_DEFAULT}" EADAF_WEB_HOST_PORT
  read_port "后端" "${EADAF_API_HOST_PORT:-$API_PORT_DEFAULT}" EADAF_API_HOST_PORT
  read_port "Postgres" "${POSTGRES_HOST_PORT:-$POSTGRES_PORT_DEFAULT}" POSTGRES_HOST_PORT
  read_port "Redis" "${REDIS_HOST_PORT:-$REDIS_PORT_DEFAULT}" REDIS_HOST_PORT
  read_port "MinIO" "${MINIO_HOST_PORT:-$MINIO_PORT_DEFAULT}" MINIO_HOST_PORT
  if [[ "$USE_MYSQL" == "1" ]]; then
    read_port "MySQL" "${MYSQL_HOST_PORT:-$MYSQL_PORT_DEFAULT}" MYSQL_HOST_PORT
  fi
}

prompt_port_scheme() {
  keep_packed_ports
  echo ""
  echo "端口方案："
  echo "  1) 使用安装包里的端口（默认）"
  echo "     前端 ${EADAF_WEB_HOST_PORT}，后端 ${EADAF_API_HOST_PORT}，Postgres ${POSTGRES_HOST_PORT}，Redis ${REDIS_HOST_PORT}，MinIO ${MINIO_HOST_PORT}"
  if [[ "$USE_MYSQL" == "1" ]]; then
    echo "     MySQL ${MYSQL_HOST_PORT}"
  fi
  echo "  2) 自定义端口"
  local choice
  while true; do
    read -r -p "选择 [1-2，回车=安装包端口]: " choice
    case "${choice:-1}" in
      1) keep_packed_ports; break ;;
      2) prompt_custom_ports; break ;;
      *) echo "请输入 1 / 2" ;;
    esac
  done
}

fill_port_rows() {
  PORT_LABELS=(前端 后端 Postgres Redis MinIO)
  PORT_VALUES=(
    "$EADAF_WEB_HOST_PORT"
    "$EADAF_API_HOST_PORT"
    "$POSTGRES_HOST_PORT"
    "$REDIS_HOST_PORT"
    "$MINIO_HOST_PORT"
  )
  if [[ "$USE_MYSQL" == "1" ]]; then
    PORT_LABELS+=(MySQL)
    PORT_VALUES+=("$MYSQL_HOST_PORT")
  fi
}

port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${port}$"
    return $?
  fi
  if command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${port}$"
    return $?
  fi
  (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1
}

port_owned_by_eadaf() {
  local port="$1"
  command -v docker >/dev/null 2>&1 || return 1
  docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null \
    | grep -E '^EADAF-' \
    | grep -Eq ":${port}->"
}

ports_available() {
  fill_port_rows
  local i j n=${#PORT_VALUES[@]}
  local -a problems=()
  for ((i = 0; i < n; i++)); do
    for ((j = i + 1; j < n; j++)); do
      if [[ "${PORT_VALUES[$i]}" == "${PORT_VALUES[$j]}" ]]; then
        problems+=("${PORT_LABELS[$i]} 与 ${PORT_LABELS[$j]} 都使用了 ${PORT_VALUES[$i]}")
      fi
    done
    if port_in_use "${PORT_VALUES[$i]}" && ! port_owned_by_eadaf "${PORT_VALUES[$i]}"; then
      problems+=("${PORT_LABELS[$i]} 端口 ${PORT_VALUES[$i]} 已被占用")
    fi
  done
  if [[ ${#problems[@]} -eq 0 ]]; then
    echo "端口检查通过。"
    return 0
  fi
  echo ""
  echo "端口冲突："
  local item
  for item in "${problems[@]}"; do
    echo "  - $item"
  done
  return 1
}

write_stack_env() {
  ensure_env_file
  upsert_env USE_MYSQL "$USE_MYSQL"
  upsert_env EADAF_WEB_HOST_PORT "$EADAF_WEB_HOST_PORT"
  upsert_env EADAF_API_HOST_PORT "$EADAF_API_HOST_PORT"
  upsert_env POSTGRES_HOST_PORT "$POSTGRES_HOST_PORT"
  upsert_env REDIS_HOST_PORT "$REDIS_HOST_PORT"
  upsert_env MINIO_HOST_PORT "$MINIO_HOST_PORT"
  upsert_env MYSQL_HOST_PORT "$MYSQL_HOST_PORT"
  local host="${PUBLIC_HOST:-localhost}" scheme="${PUBLIC_SCHEME:-http}" extra=""
  upsert_env EADAF_PUBLIC_URL "${scheme}://${host}:${EADAF_WEB_HOST_PORT}"
  if [[ "$USE_MYSQL" == "1" ]]; then
    extra=" MySQL=${MYSQL_HOST_PORT}"
  fi
  echo "已写入 .env：USE_MYSQL=${USE_MYSQL}，对外端口 前端=${EADAF_WEB_HOST_PORT} 后端=${EADAF_API_HOST_PORT} Postgres=${POSTGRES_HOST_PORT} Redis=${REDIS_HOST_PORT} MinIO=${MINIO_HOST_PORT}${extra}"
}

ask_retry_custom_ports() {
  echo ""
  echo "是否重新制定自定义端口方案？"
  echo "  1) 是，重新填写"
  echo "  2) 否，退出安装"
  local choice
  while true; do
    read -r -p "选择 [1-2]: " choice
    case "$choice" in
      1) return 0 ;;
      2) echo "已退出安装"; exit 1 ;;
      *) echo "请输入 1 / 2" ;;
    esac
  done
}

configure_stack_options() {
  local interactive="$1"
  ensure_env_file
  load_dotenv
  keep_packed_ports
  # 已确认沿用安装包默认值：不再问 MySQL 和端口，只做占用检查。
  if [[ "$interactive" == "1" && "${KEEP_PACKED:-0}" == "1" ]]; then
    while true; do
      if ports_available; then
        break
      fi
      ask_retry_custom_ports
      prompt_custom_ports
    done
    write_stack_env
    return 0
  fi
  if [[ "$interactive" == "1" ]]; then
    prompt_mysql
    local force_custom=0
    while true; do
      if [[ "$force_custom" == "1" ]]; then
        prompt_custom_ports
      else
        prompt_port_scheme
      fi
      if ports_available; then
        break
      fi
      ask_retry_custom_ports
      force_custom=1
    done
  else
    USE_MYSQL="${USE_MYSQL:-0}"
    : "${EADAF_WEB_HOST_PORT:=$WEB_PORT_DEFAULT}"
    : "${EADAF_API_HOST_PORT:=$API_PORT_DEFAULT}"
    : "${POSTGRES_HOST_PORT:=$POSTGRES_PORT_DEFAULT}"
    : "${REDIS_HOST_PORT:=$REDIS_PORT_DEFAULT}"
    : "${MINIO_HOST_PORT:=$MINIO_PORT_DEFAULT}"
    : "${MYSQL_HOST_PORT:=$MYSQL_PORT_DEFAULT}"
    if ! ports_available; then
      echo "非交互模式无法重填端口，安装退出。"
      exit 1
    fi
  fi
  write_stack_env
}

static_bundle_dir() {
  echo "$STATIC_ROOT/${DEPLOY_OS}-${DEPLOY_ARCH}"
}

run_install_docker() {
  if [[ "$DEPLOY_NETWORK" == "online" ]]; then
    [[ -f "$ROOT/install-docker.sh" ]] || die "缺少 install-docker.sh"
    bash "$ROOT/install-docker.sh"
    return 0
  fi
  local dir installer
  dir="$(static_bundle_dir)"
  installer="$STATIC_ROOT/install-docker-static.sh"
  [[ -f "$installer" ]] || die "缺少 $installer"
  [[ -d "$dir" ]] || die "缺少平台目录: $dir（请确认离线包是否包含该 OS/架构的 Docker 静态包）"
  [[ -f "$dir/docker-compose" ]] || die "缺少 $dir/docker-compose"
  shopt -s nullglob
  local tgzs=("$dir"/docker-*.tgz)
  shopt -u nullglob
  [[ ${#tgzs[@]} -gt 0 ]] || die "缺少 $dir/docker-*.tgz"

  echo ""
  echo "将安装静态 Docker："
  echo "  OS=${DEPLOY_OS}  ARCH=${DEPLOY_ARCH}"
  echo "  目录=${dir}"
  DEPLOY_OS="$DEPLOY_OS" DEPLOY_ARCH="$DEPLOY_ARCH" bash "$installer"
}

run_up() {
  chmod +x "$ROOT/up.sh" "$ROOT/status.sh" "$ROOT/ctl.sh" "$ROOT/init-db.sh" 2>/dev/null || true
  bash "$ROOT/up.sh"
}

run_auto() {
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    echo "已检测到可用的 Docker，跳过安装。"
  else
    echo "未检测到可用的 Docker，开始安装。"
    run_install_docker
  fi
  run_up
}

run_status() {
  chmod +x "$ROOT/status.sh" 2>/dev/null || true
  bash "$ROOT/status.sh"
}

# --- 解析 / 交互 ---
echo "========================================"
echo "  EADAF 平台部署（不含业务应用）"
echo "========================================"

# shellcheck disable=SC1091
source "$ROOT/lib.sh"
load_deploy_choice "$ROOT"
echo "网络: ${DEPLOY_NETWORK}    运行方式: ${DEPLOY_RUNTIME}"
if [[ "$DEPLOY_RUNTIME" == "k8s" ]]; then
  echo "运行方式是 K8s。镜像仍在包内导入，请执行: ./k8s/install.sh"
  exit 0
fi

load_saved_platform

if [[ -n "$CLI_OS" ]]; then
  DEPLOY_OS="$(normalize_os "$CLI_OS")" || die "不支持的 --os: 请用 centos / ubuntu / debian"
fi
if [[ -n "$CLI_ARCH" ]]; then
  DEPLOY_ARCH="$(normalize_arch "$CLI_ARCH")" || die "不支持的 --arch: 请用 amd64 / arm64"
fi

# 命令行未给全时进入交互。已有保存值时，回车或 n 沿用上面列出的全部默认，不再追问。
KEEP_PACKED=0
if [[ -z "${DEPLOY_OS:-}" || -z "${DEPLOY_ARCH:-}" ]]; then
  print_packed_defaults
  [[ -n "${DEPLOY_OS:-}" ]] || prompt_os
  [[ -n "${DEPLOY_ARCH:-}" ]] || prompt_arch
elif [[ -z "$CLI_OS" && -z "$CLI_ARCH" && -t 0 ]]; then
  printf "已保存平台: %s / %s\n" "$DEPLOY_OS" "$DEPLOY_ARCH"
  print_packed_defaults
  read -r -p "是否沿用上面的配置继续安装？[Y/n]，按回车默认 Y: " redo
  redo="$(printf '%s' "$redo" | tr '[:upper:]' '[:lower:]')"
  if [[ -z "$redo" || "$redo" == "y" || "$redo" == "yes" ]]; then
    KEEP_PACKED=1
    echo "沿用上面的安装包默认，不再询问 MySQL 和端口。"
  else
    prompt_os
    prompt_arch
  fi
fi

DEPLOY_OS="$(normalize_os "$DEPLOY_OS")" || die "无效 OS"
DEPLOY_ARCH="$(normalize_arch "$DEPLOY_ARCH")" || die "无效架构"
save_platform

# 交互安装，或非交互直接启动整栈时，先定 MySQL 与对外端口并检查占用。
if [[ -z "$ACTION" && -t 0 ]] || [[ "$ACTION" == "up" ]]; then
  if [[ -t 0 ]]; then
    configure_stack_options 1
  else
    configure_stack_options 0
  fi
fi

if [[ -z "$ACTION" ]]; then
  if [[ -t 0 ]]; then
    prompt_action
  else
    die "非交互模式请指定 --action install-docker|up|status"
  fi
fi

case "$ACTION" in
  auto) run_auto ;;
  install-docker) run_install_docker ;;
  up) run_up ;;
  status) run_status ;;
  exit) echo "已退出"; exit 0 ;;
  *) die "未知 --action: $ACTION（auto|install-docker|up|status）" ;;
esac
