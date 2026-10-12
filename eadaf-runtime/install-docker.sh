#!/usr/bin/env bash
# 普通模式：目标机可以上网。已有可用 Docker 则跳过，否则按发行版安装。
set -euo pipefail

log() { printf '[install-docker] %s\n' "$*"; }
die() { printf '[ERR] %s\n' "$*" >&2; exit 1; }

if docker info >/dev/null 2>&1; then
  log "本机 Docker 已可用，跳过安装"
  docker compose version >/dev/null 2>&1 || docker-compose version >/dev/null 2>&1 \
    || log "未发现 docker compose 插件。若启动失败，请安装 docker-compose-plugin"
  exit 0
fi

if [[ "$(id -u)" -ne 0 ]]; then
  die "安装 Docker 需要 root。请执行: sudo ./install-docker.sh"
fi

OS_ID=""
if [[ -f /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_ID="${ID:-}"
fi

install_debian() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/${OS_ID}/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://mirrors.aliyun.com/docker-ce/linux/${OS_ID} ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
}

install_rhel() {
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y yum-utils
    dnf config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo || true
    dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  else
    yum install -y yum-utils
    yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
    yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  fi
}

case "$OS_ID" in
  ubuntu|debian) install_debian ;;
  centos|rhel|rocky|almalinux|anolis|opencloudos) install_rhel ;;
  *) die "不支持的发行版: ${OS_ID:-未知}（仅 CentOS / Ubuntu / Debian 及其兼容版）" ;;
esac

systemctl enable --now docker
docker info >/dev/null 2>&1 || die "Docker 安装后仍不可用"
log "Docker 已安装并启动"
