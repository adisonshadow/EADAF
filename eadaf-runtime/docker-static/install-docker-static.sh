#!/usr/bin/env bash
# 按 start.sh 选定的 OS / 架构，从 docker-static/<os>-<arch>/ 安装静态 Docker。
# 也可：DEPLOY_OS=ubuntu DEPLOY_ARCH=amd64 ./install-docker-static.sh
set -euo pipefail

STATIC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$STATIC_ROOT/.." && pwd)"
PLATFORM_FILE="$ROOT/.deploy-platform"

if [[ -z "${DEPLOY_OS:-}" || -z "${DEPLOY_ARCH:-}" ]]; then
  if [[ -f "$PLATFORM_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$PLATFORM_FILE"
  fi
fi

DEPLOY_OS="${DEPLOY_OS:-centos}"
DEPLOY_ARCH="${DEPLOY_ARCH:-amd64}"
BUNDLE_DIR="$STATIC_ROOT/${DEPLOY_OS}-${DEPLOY_ARCH}"

die() { printf '[ERR] %s\n' "$*" >&2; exit 1; }

[[ -d "$BUNDLE_DIR" ]] || die "缺少平台目录: $BUNDLE_DIR"
[[ -f "$BUNDLE_DIR/docker-compose" ]] || die "缺少 $BUNDLE_DIR/docker-compose"

shopt -s nullglob
TGZS=("$BUNDLE_DIR"/docker-*.tgz)
shopt -u nullglob
[[ ${#TGZS[@]} -gt 0 ]] || die "缺少 $BUNDLE_DIR/docker-*.tgz"
TGZ="${TGZS[0]}"

echo "===== 离线安装静态 Docker（${DEPLOY_OS} / ${DEPLOY_ARCH}）====="
echo "包: $TGZ"

echo "1. 解压 docker 静态包"
rm -rf "$BUNDLE_DIR/docker"
tar -zxvf "$TGZ" -C "$BUNDLE_DIR"

echo "2. 拷贝 docker 到 /usr/local/bin"
cp "$BUNDLE_DIR"/docker/* /usr/local/bin/
chmod +x /usr/local/bin/docker*

echo "3. 安装 docker-compose"
cp "$BUNDLE_DIR/docker-compose" /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
ln -sf /usr/local/bin/docker-compose /usr/local/bin/docker-compose-v2

echo "4. 写入 docker systemd 服务"
cat >/etc/systemd/system/docker.service <<'EOF'
[Unit]
Description=Docker Application Container Engine
Documentation=https://docs.docker.com
After=network-online.target firewalld.service
Wants=network-online.target

[Service]
Type=notify
ExecStart=/usr/local/bin/dockerd
ExecReload=/bin/kill -s HUP $MAINPID
TimeoutSec=0
RestartSec=2
Restart=always
LimitNOFILE=infinity
LimitNPROC=infinity
LimitCORE=infinity

[Install]
WantedBy=multi-user.target
EOF

echo "5. 启动 Docker 并设置开机自启"
systemctl daemon-reload
systemctl enable docker
systemctl start docker

echo ""
echo "===== 验证结果 ====="
docker --version
docker-compose --version
echo "Docker 安装完成！"
echo ""
echo "按需放行端口（示例：9526 / 9527；业务应用如 FPCU2 另有 13303 / 13308）："
case "$DEPLOY_OS" in
  centos)
    cat <<'EOF'
  # firewalld（CentOS / RHEL 等）
  firewall-cmd --add-port=9526/tcp --permanent
  firewall-cmd --add-port=9527/tcp --permanent
  firewall-cmd --add-port=13303/tcp --permanent
  firewall-cmd --add-port=13308/tcp --permanent
  firewall-cmd --reload
EOF
    ;;
  ubuntu|debian)
    cat <<'EOF'
  # ufw（Ubuntu / Debian，若已启用）
  ufw allow 9526/tcp
  ufw allow 9527/tcp
  ufw allow 13303/tcp
  ufw allow 13308/tcp
  ufw reload
EOF
    ;;
esac
