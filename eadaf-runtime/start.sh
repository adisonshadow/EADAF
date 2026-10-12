#!/usr/bin/env bash
# 离线包客户侧入口：选择操作系统与 CPU 架构后，再安装 Docker / 启动整栈。
# 用法：
#   ./start.sh
#   ./start.sh --os ubuntu --arch amd64 --action up
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLATFORM_FILE="$ROOT/.deploy-platform"
STATIC_ROOT="$ROOT/docker-static"

CLI_OS=""
CLI_ARCH=""
ACTION=""

usage() {
  cat <<'EOF'
用法: ./start.sh [--os centos|ubuntu|debian] [--arch amd64|arm64] [--action install-docker|up|status]

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
# 由 ./start.sh 生成；勿手改除非清楚含义
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
  if [[ "$DEPLOY_NETWORK" == "online" ]]; then
    echo "  1) 用系统包管理器安装 Docker（已安装则跳过）"
  else
    echo "  1) 安装静态 Docker（首次，需包内有对应平台二进制）"
  fi
  echo "  2) 启动整栈（./up.sh）"
  echo "  3) 查看状态（./status.sh）"
  echo "  4) 退出"
  local choice
  while true; do
    read -r -p "选择 [1-4]: " choice
    case "$choice" in
      1) ACTION=install-docker; break ;;
      2) ACTION=up; break ;;
      3) ACTION=status; break ;;
      4) ACTION=exit; break ;;
      *) echo "请输入 1 / 2 / 3 / 4" ;;
    esac
  done
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

# 命令行未给全时进入交互；已有保存值可选择沿用
if [[ -z "${DEPLOY_OS:-}" || -z "${DEPLOY_ARCH:-}" ]]; then
  [[ -n "${DEPLOY_OS:-}" ]] || prompt_os
  [[ -n "${DEPLOY_ARCH:-}" ]] || prompt_arch
elif [[ -z "$CLI_OS" && -z "$CLI_ARCH" && -t 0 ]]; then
  printf "已保存平台: %s / %s\n" "$DEPLOY_OS" "$DEPLOY_ARCH"
  read -r -p "是否重新选择？[y/N]: " redo
  redo="$(printf '%s' "$redo" | tr '[:upper:]' '[:lower:]')"
  if [[ "$redo" == "y" || "$redo" == "yes" ]]; then
    prompt_os
    prompt_arch
  fi
fi

DEPLOY_OS="$(normalize_os "$DEPLOY_OS")" || die "无效 OS"
DEPLOY_ARCH="$(normalize_arch "$DEPLOY_ARCH")" || die "无效架构"
save_platform

if [[ -z "$ACTION" ]]; then
  if [[ -t 0 ]]; then
    prompt_action
  else
    die "非交互模式请指定 --action install-docker|up|status"
  fi
fi

case "$ACTION" in
  install-docker) run_install_docker ;;
  up) run_up ;;
  status) run_status ;;
  exit) echo "已退出"; exit 0 ;;
  *) die "未知 --action: $ACTION（install-docker|up|status）" ;;
esac
