#!/usr/bin/env bash
# 兼容旧路径：等价于选择 CentOS + amd64 后安装静态 Docker。
# 推荐使用上级目录 ./start.sh 交互选择 OS / 架构。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export DEPLOY_OS=centos
export DEPLOY_ARCH=amd64

# 若二进制仍在旧目录 centos-docker-static/，同步到 docker-static/centos-amd64/
OLD="$ROOT/centos-docker-static"
NEW="$ROOT/docker-static/centos-amd64"
mkdir -p "$NEW"
if [[ -f "$OLD/docker-compose" && ! -f "$NEW/docker-compose" ]]; then
  cp -f "$OLD/docker-compose" "$NEW/docker-compose"
fi
shopt -s nullglob
for tgz in "$OLD"/docker-*.tgz; do
  base="$(basename "$tgz")"
  [[ -f "$NEW/$base" ]] || cp -f "$tgz" "$NEW/$base"
done
shopt -u nullglob

exec bash "$ROOT/docker-static/install-docker-static.sh"
