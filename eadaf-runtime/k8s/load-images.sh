#!/usr/bin/env bash
# 把包内 docker-images/*.tar 导入当前节点的容器运行时。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMG_DIR="$ROOT/docker-images"

die() { printf '[ERR] %s\n' "$*" >&2; exit 1; }

shopt -s nullglob
tars=("$IMG_DIR"/*.tar)
shopt -u nullglob
[[ ${#tars[@]} -gt 0 ]] || die "没有镜像包: $IMG_DIR"

import_one() {
  local tar="$1"
  echo "导入 $(basename "$tar")"
  if command -v k3s >/dev/null 2>&1; then
    k3s ctr images import "$tar" && return 0
  fi
  if command -v ctr >/dev/null 2>&1; then
    ctr -n k8s.io images import "$tar" && return 0
  fi
  if command -v docker >/dev/null 2>&1; then
    docker load -i "$tar" && return 0
  fi
  return 1
}

for tar in "${tars[@]}"; do
  import_one "$tar" || die "无法导入 $tar（需要 k3s ctr、ctr -n k8s.io 或 docker）"
done
echo "镜像导入完成"
