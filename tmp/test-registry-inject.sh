#!/usr/bin/env bash
# lib-pack.sh 里 registry 注入相关函数的自测（不需要 docker / 网络）
set -uo pipefail

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/deploy/lib-pack.sh"
# shellcheck source=/dev/null
source "$LIB"

PASS=0
FAIL=0
ok()   { printf '  OK   %s\n' "$1"; PASS=$((PASS + 1)); }
bad()  { printf '  FAIL %s\n' "$1"; FAIL=$((FAIL + 1)); }
check() { if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1 (期望 [$3] 实际 [$2])"; fi; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

log() { :; }   # 静音

printf '=== 1) EADAF_NPM_REGISTRY 优先 ===\n'
check "环境变量覆盖" "$(EADAF_NPM_REGISTRY=https://mirror.internal/npm/ resolve_npm_registry)" "https://mirror.internal/npm/"

printf '=== 2) 未设置时取主机 pnpm/npm 的源 ===\n'
HOST_REG="$(resolve_npm_registry || true)"
if [[ -n "$HOST_REG" ]]; then ok "取到主机源: $HOST_REG"; else bad "没取到主机源"; fi

printf '=== 3) 无 .npmrc 时写入 registry ===\n'
D1="$TMP/c1"; mkdir -p "$D1"
write_npmrc_registry "$D1" "https://registry.example.test/"
check "写入内容" "$(grep -c '^registry=https://registry.example.test/$' "$D1/.npmrc")" "1"
check "不残留临时文件" "$(find "$D1" -name '*.tmp.*' | wc -l | tr -d ' ')" "0"

printf '=== 4) 已配置 registry 的 .npmrc 不覆盖 ===\n'
D2="$TMP/c2"; mkdir -p "$D2"; printf 'registry=https://already.set/\nstrict-peer-dependencies=false\n' >"$D2/.npmrc"
write_npmrc_registry "$D2" "https://registry.example.test/"
check "保留原 registry" "$(grep -c '^registry=https://already.set/$' "$D2/.npmrc")" "1"
check "未写入新 registry" "$(grep -c 'registry.example.test' "$D2/.npmrc")" "0"

printf '=== 5) 有 .npmrc 但没有 registry 行时：追加并保留原内容 ===\n'
D3="$TMP/c3"; mkdir -p "$D3"; printf 'strict-peer-dependencies=false\n# 项目自定义\nauto-install-peers=true\n' >"$D3/.npmrc"
write_npmrc_registry "$D3" "https://registry.example.test/"
check "注入 registry" "$(grep -c '^registry=https://registry.example.test/$' "$D3/.npmrc")" "1"
check "保留原配置" "$(grep -c '^strict-peer-dependencies=false$' "$D3/.npmrc")" "1"
check "保留原注释" "$(grep -c '^# 项目自定义$' "$D3/.npmrc")" "1"
check "保留 auto-install-peers" "$(grep -c '^auto-install-peers=true$' "$D3/.npmrc")" "1"

printf '=== 6) prepare_container_registry 端到端（用环境变量）===\n'
D4="$TMP/c4"; mkdir -p "$D4"
EADAF_NPM_REGISTRY=https://registry.npmmirror.com prepare_container_registry "$D4"
check "上下文 .npmrc 生成" "$(grep -c '^registry=https://registry.npmmirror.com$' "$D4/.npmrc")" "1"

printf '\n==> %d 通过, %d 失败\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
