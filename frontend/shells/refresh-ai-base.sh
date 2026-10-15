#!/usr/bin/env bash
# 清除 EADAF_frontend 对 @eadaf/ai-base 的旧缓存，重新构建并链接 workspace 包。
# 适用场景：ai-base 已更新但 frontend 仍报 useChatReference is not a function 等缓存问题。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$FRONTEND_DIR/.." && pwd)"
AI_BASE_PKG="$ROOT_DIR/package/ai-base"

echo "==> 路径"
echo "    monorepo 根目录: $ROOT_DIR"
echo "    frontend:        $FRONTEND_DIR"
echo "    ai-base 包:      $AI_BASE_PKG"
echo ""

if [[ ! -d "$AI_BASE_PKG" ]]; then
  echo "错误: 未找到 ai-base 包目录: $AI_BASE_PKG" >&2
  exit 1
fi

echo "==> 1/3 清理 @eadaf/ai-base 链接与 Vite 预构建缓存"
rm -rf "$FRONTEND_DIR/node_modules/@eadaf/ai-base"
rm -rf "$ROOT_DIR/node_modules/@eadaf/ai-base"
rm -rf "$FRONTEND_DIR/node_modules/.vite"
echo "    已清理 node_modules/@eadaf/ai-base、.vite 缓存"
echo ""

echo "==> 2/3 重新构建 @eadaf/ai-base"
(
  cd "$AI_BASE_PKG"
  if command -v pnpm >/dev/null 2>&1; then
    pnpm run build
  else
    npm run build
  fi
)
echo ""

echo "==> 3/3 重新安装 workspace 依赖（链接 @eadaf/ai-base）"
(
  cd "$ROOT_DIR"
  if command -v pnpm >/dev/null 2>&1; then
    pnpm install
  else
    echo "警告: 未找到 pnpm，请手动在 monorepo 根目录执行 pnpm install" >&2
  fi
)
echo ""

echo "==> 校验导出与链接"
if grep -q "useChatReference" "$AI_BASE_PKG/dist/index.js" 2>/dev/null; then
  echo "    ✓ dist/index.js 包含 useChatReference"
else
  echo "    ✗ dist/index.js 未找到 useChatReference，请检查 ai-base 构建" >&2
  exit 1
fi

if grep -q "setToolInvokeLogger" "$AI_BASE_PKG/dist/index.js" 2>/dev/null; then
  echo "    ✓ dist/index.js 包含 setToolInvokeLogger"
else
  echo "    ✗ dist/index.js 未找到 setToolInvokeLogger，请检查 ai-base 构建" >&2
  exit 1
fi

FOUND_LINK=false
for LINK_PATH in \
  "$ROOT_DIR/node_modules/@eadaf/ai-base" \
  "$FRONTEND_DIR/node_modules/@eadaf/ai-base"; do
  if [[ -e "$LINK_PATH" ]]; then
    LINK_TARGET="$(readlink "$LINK_PATH" 2>/dev/null || realpath "$LINK_PATH" 2>/dev/null || echo "$LINK_PATH")"
    echo "    ✓ 已链接: $LINK_PATH -> $LINK_TARGET"
    FOUND_LINK=true
  fi
done

if [[ "$FOUND_LINK" == false ]]; then
  echo "    ! 未找到 @eadaf/ai-base 链接，请在 monorepo 根目录执行: pnpm install" >&2
fi

echo ""
echo "完成。请重启 dev 服务："
echo "  cd \"$FRONTEND_DIR\" && pnpm dev"
