#!/usr/bin/env bash
# 平台包 / 应用包共用：日志、镜像构建、SQL 拷贝、静态 Docker 下载。
# 由 pack-eadaf.sh / pack-app.sh source，不要直接执行。

PACK_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$PACK_LIB_DIR/../.." && pwd)"
SKELETON="$REPO_ROOT/eadaf-runtime"

log() { printf '\n==== %s ====\n' "$*"; }
log_warn() { printf '[WARN] %s\n' "$*" >&2; }
die() { printf '[ERR] %s\n' "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "缺少命令: $1"
}

# MSYS（Git Bash）下 $REPO_ROOT 形如 /d/DEV/UAC2，Windows 版 node 无法 require 这种路径，
# 于是 `package_version` 会取不到版本（旧行为：默认版本为空或与 package.json 不一致）。
# cygpath 存在时统一转成 D:\DEV\UAC2 形态；Linux/macOS 上原样返回。
to_native_path() {
  local p="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$p" 2>/dev/null || printf '%s' "$p"
  else
    printf '%s' "$p"
  fi
}

# 读取某个目录 package.json 的 version（空字符串表示读不到，不报错；容忍 UTF-8 BOM）
package_version_at() {
  local dir="${1:-$REPO_ROOT}"
  node -e '
    const fs = require("fs");
    const path = require("path");
    try {
      const raw = fs.readFileSync(path.join(process.argv[1], "package.json"), "utf8").replace(/^\uFEFF/, "");
      const json = JSON.parse(raw);
      process.stdout.write(typeof json.version === "string" ? json.version.trim() : "");
    } catch {
      process.stdout.write("");
    }
  ' "$(to_native_path "$dir")"
}

# 平台（EADAF）默认版本 = 仓库根 package.json
package_version() {
  package_version_at "$REPO_ROOT"
}

git_sha() {
  git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown
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

platform_of_arch() {
  case "$1" in
    amd64) echo linux/amd64 ;;
    arm64) echo linux/arm64 ;;
    *) return 1 ;;
  esac
}

# ---------------------------------------------------------------------------
# 容器内 pnpm install 的 registry 注入
#
# 构建镜像时容器里会跑 pnpm install，直连 registry.npmjs.org 在国内网络经常被
# TLS 重置（FetchError: Client network socket disconnected before secure TLS
# connection was established）。开发机上的 pnpm 通常已经配好镜像源（全局 .npmrc
# 或 pnpm config），但那套配置不会进容器，于是“主机能装、容器装不上”。
#
# 做法：把主机当前生效的 registry 写进构建上下文的 .npmrc，Dockerfile 在
# pnpm install 之前 COPY 它。优先级：
#   EADAF_NPM_REGISTRY 环境变量 > 主机 `pnpm config get registry` > 不注入
# ---------------------------------------------------------------------------

resolve_npm_registry() {
  if [[ -n "${EADAF_NPM_REGISTRY:-}" ]]; then
    printf '%s\n' "$EADAF_NPM_REGISTRY"
    return 0
  fi
  local reg=""
  if command -v pnpm >/dev/null 2>&1; then
    reg="$(pnpm config get registry 2>/dev/null | tr -d '\r' | head -n1)"
  fi
  if [[ -z "$reg" ]] && command -v npm >/dev/null 2>&1; then
    reg="$(npm config get registry 2>/dev/null | tr -d '\r' | head -n1)"
  fi
  # pnpm/npm 拿不到时会打印 undefined/null
  case "$reg" in
    ""|undefined|null) return 1 ;;
  esac
  printf '%s\n' "$reg"
}

# 把 registry 写进目录下的 .npmrc（保留原有其它配置，并避免覆盖已配置的源）
write_npmrc_registry() {
  local dir="$1"
  local registry="$2"
  local target="$dir/.npmrc"
  [[ -d "$dir" ]] || return 0
  if [[ -f "$target" ]] && grep -qE '^[[:space:]]*registry[[:space:]]*=' "$target" 2>/dev/null; then
    local pinned
    pinned="$(grep -E '^[[:space:]]*registry[[:space:]]*=' "$target" 2>/dev/null | tail -n1 | cut -d= -f2-)"
    log "容器 npm registry 用项目自带的 .npmrc: ${pinned:-<空>}（如拉包失败，用 EADAF_NPM_REGISTRY=... pnpm pack:app 覆盖）"
    return 0
  fi
  {
    printf '# 由 pnpm pack 自动生成：容器内 pnpm install 走的 registry\n'
    printf '# 覆盖方式：EADAF_NPM_REGISTRY=https://your-mirror/ pnpm pack:app\n'
    printf 'registry=%s\n' "$registry"
    if [[ -f "$target" ]]; then
      printf '\n# ---- 以下为项目原有 .npmrc 内容 ----\n'
      cat "$target"
    fi
  } >"$target.tmp.$$"
  mv "$target.tmp.$$" "$target"
  log "已注入容器 npm registry: $registry"
}

# 构建某个上下文前调用：确认 registry 并落到上下文里的 .npmrc
prepare_container_registry() {
  local dir="$1"
  local registry
  if ! registry="$(resolve_npm_registry)"; then
    printf '[WARN] 未取到 npm registry（pnpm/npm config 为空）。容器内 pnpm install 将直连\n' >&2
    printf '       registry.npmjs.org；若打包在拉包阶段失败，请设置：\n' >&2
    printf '       EADAF_NPM_REGISTRY=https://registry.npmmirror.com pnpm pack:app\n' >&2
    return 0
  fi
  write_npmrc_registry "$dir" "$registry"
}

docker_static_arch() {
  case "$1" in
    amd64) echo x86_64 ;;
    arm64) echo aarch64 ;;
  esac
}

download_with_fallback() {
  local dest="$1"
  shift
  local url
  for url in "$@"; do
    echo "尝试下载: $url"
    if curl -fL --retry 2 --connect-timeout 20 -o "$dest" "$url"; then
      echo "下载成功: $dest"
      return 0
    fi
    rm -f "$dest"
  done
  die "全部镜像源下载失败: $dest"
}

pull_platform_image() {
  local name="$1" platform="$2" want_arch="$3"
  if docker image inspect "$name" >/dev/null 2>&1; then
    local existing
    existing="$(docker image inspect "$name" --format '{{.Architecture}}')"
    if [[ "$existing" == "$want_arch" ]]; then
      echo "本地已有 ${want_arch}: $name"
      return 0
    fi
    echo "本地 ${name} 为 ${existing}，需重新拉取 ${want_arch}"
  fi
  local mirrors=(
    "$name"
    "docker.m.daocloud.io/library/${name}"
    "docker.1ms.run/library/${name}"
    "docker.xuanyuan.me/library/${name}"
  )
  local m
  for m in "${mirrors[@]}"; do
    echo "拉取 --platform ${platform}: $m"
    if docker pull --platform "$platform" "$m"; then
      [[ "$m" != "$name" ]] && docker tag "$m" "$name"
      local arch
      arch="$(docker image inspect "$name" --format '{{.Architecture}}')"
      if [[ "$arch" != "$want_arch" ]]; then
        echo "架构不是 ${want_arch}: $name ($arch)，继续尝试下一源"
        continue
      fi
      echo "OK $name arch=$arch"
      return 0
    fi
  done
  die "无法拉取 ${want_arch} 镜像: $name"
}

save_image() {
  local image="$1" dest_dir="$2" want_arch="$3"
  local filename arch
  filename="$(echo "$image" | tr ':' '_').tar"
  mkdir -p "$dest_dir"
  echo "docker save $image -> $filename"
  docker save -o "$dest_dir/$filename" "$image"
  arch="$(docker image inspect "$image" --format '{{.Architecture}}')"
  [[ "$arch" == "$want_arch" ]] || die "${image} 架构为 ${arch}，期望 ${want_arch}"
}

# 复制目录树并排除若干模式（rsync 语义）。
# Git for Windows 不自带 rsync，因此 rsync 不可用时回退到 Node 版复制器，
# 否则 Windows 上 `pnpm pack:app` 会以「缺少命令: rsync」直接失败。
copy_dir_filtered() {
  local src="$1" dest="$2"
  shift 2
  local excludes=("$@")
  local args=() item
  if command -v rsync >/dev/null 2>&1; then
    for item in ${excludes[@]+"${excludes[@]}"}; do
      args+=(--exclude "$item")
    done
    rsync -a ${args[@]+"${args[@]}"} "$src/" "$dest/"
    return 0
  fi
  log_warn "未检测到 rsync（Git for Windows 不自带），改用 Node 复制器 scripts/deploy/copy-tree.cjs"
  local node_args=()
  for item in ${excludes[@]+"${excludes[@]}"}; do
    node_args+=(--exclude "$item")
  done
  node "$PACK_LIB_DIR/copy-tree.cjs" --src "$src" --dest "$dest" ${node_args[@]+"${node_args[@]}"}
}

build_eadaf_web() {
  local dest="$1"
  log "构建 EADAF 前端"
  if [[ ! -d "$REPO_ROOT/node_modules" ]]; then
    (cd "$REPO_ROOT" && pnpm install)
  fi
  (cd "$REPO_ROOT" && pnpm --filter ./package/ai-base build)
  (cd "$REPO_ROOT" && pnpm --filter ./frontend build)
  [[ -d "$REPO_ROOT/frontend/dist" ]] || die "前端 dist 未生成"
  rm -rf "$dest/frontend/dist"
  mkdir -p "$dest/frontend"
  cp -R "$REPO_ROOT/frontend/dist" "$dest/frontend/dist"
}

build_eadaf_api() {
  local platform="$1" image="${2:-eadaf-api:v1}"
  log "构建 EADAF API 镜像 ($platform)"
  local ignore_backup=""
  if [[ -f "$REPO_ROOT/.dockerignore" ]]; then
    ignore_backup="$REPO_ROOT/.dockerignore.pack-bak"
    mv "$REPO_ROOT/.dockerignore" "$ignore_backup"
  fi
  cp "$PACK_LIB_DIR/build/dockerignore.api" "$REPO_ROOT/.dockerignore"
  cleanup_dockerignore() {
    rm -f "$REPO_ROOT/.dockerignore"
    if [[ -n "${ignore_backup:-}" && -f "$ignore_backup" ]]; then
      mv "$ignore_backup" "$REPO_ROOT/.dockerignore"
    fi
  }
  trap cleanup_dockerignore EXIT
  docker build --platform "$platform" -f "$PACK_LIB_DIR/build/Dockerfile.api" -t "$image" "$REPO_ROOT"
  cleanup_dockerignore
  trap - EXIT
}

copy_platform_sql() {
  local dest="$1"
  mkdir -p "$dest/init-sql"
  local name src
  while IFS= read -r name || [[ -n "$name" ]]; do
    name="${name%%#*}"
    name="$(printf '%s' "$name" | tr -d '[:space:]')"
    [[ -n "$name" ]] || continue
    src="$REPO_ROOT/backend/scripts/$name"
    [[ -f "$src" ]] || die "缺少 SQL: $src"
    cp "$src" "$dest/init-sql/$name"
  done <"$SKELETON/init-sql.manifest"
  cp "$SKELETON/init-sql.manifest" "$dest/init-sql.manifest"
  cp "$SKELETON/schema-baseline.txt" "$dest/schema-baseline.txt"
}

fetch_docker_static() {
  local arch="$1" dest_parent="$2"
  local docker_arch compose_arch
  docker_arch="$(docker_static_arch "$arch")"
  compose_arch="$docker_arch"
  local cache="$REPO_ROOT/packages/.staging/docker-static-$arch"
  mkdir -p "$cache"
  if [[ ! -f "$cache/docker-24.0.9.tgz" ]]; then
    download_with_fallback "$cache/docker-24.0.9.tgz" \
      "https://mirrors.aliyun.com/docker-ce/linux/static/stable/${docker_arch}/docker-24.0.9.tgz" \
      "https://download.docker.com/linux/static/stable/${docker_arch}/docker-24.0.9.tgz"
  fi
  if [[ ! -f "$cache/docker-compose" ]]; then
    download_with_fallback "$cache/docker-compose" \
      "https://github.com/docker/compose/releases/download/v2.20.2/docker-compose-linux-${compose_arch}" \
      "https://mirror.ghproxy.com/https://github.com/docker/compose/releases/download/v2.20.2/docker-compose-linux-${compose_arch}" \
      "https://ghfast.top/https://github.com/docker/compose/releases/download/v2.20.2/docker-compose-linux-${compose_arch}" \
      "https://cdn.jsdelivr.net/gh/docker/compose@v2.20.2/bin/release/docker-compose-linux-${compose_arch}" \
      || true
    if [[ ! -f "$cache/docker-compose" ]]; then
      # 打包机已有 docker compose 插件时，写入说明包装脚本（客户机用 docker compose）
      cat >"$cache/docker-compose" <<'WRAP'
#!/bin/sh
# 离线包未带上 compose 静态二进制时的回退：调用本机 docker compose 插件
exec docker compose "$@"
WRAP
      chmod +x "$cache/docker-compose"
      log_warn "未能下载 docker-compose 静态二进制，已写入 docker compose 插件回退包装"
    else
      chmod +x "$cache/docker-compose"
    fi
  fi
  local os dest
  for os in centos ubuntu debian; do
    dest="$dest_parent/docker-static/${os}-${arch}"
    mkdir -p "$dest"
    cp -f "$cache/docker-24.0.9.tgz" "$dest/docker-24.0.9.tgz"
    cp -f "$cache/docker-compose" "$dest/docker-compose"
    chmod +x "$dest/docker-compose"
  done
  mkdir -p "$dest_parent/docker-static" "$dest_parent/centos-docker-static"
  cp "$SKELETON/docker-static/install-docker-static.sh" "$dest_parent/docker-static/install-docker-static.sh"
  cp "$SKELETON/centos-docker-static/install-docker-static.sh" "$dest_parent/centos-docker-static/install-docker-static.sh"
  chmod +x "$dest_parent/docker-static/install-docker-static.sh" "$dest_parent/centos-docker-static/install-docker-static.sh"
  if [[ "$arch" == "amd64" ]]; then
    cp -f "$dest_parent/docker-static/centos-amd64/docker-24.0.9.tgz" "$dest_parent/centos-docker-static/docker-24.0.9.tgz"
    cp -f "$dest_parent/docker-static/centos-amd64/docker-compose" "$dest_parent/centos-docker-static/docker-compose"
    chmod +x "$dest_parent/centos-docker-static/docker-compose"
  fi
}

write_install_env() {
  local dest="$1" web_port="$2" api_port="$3"
  cp "$SKELETON/env.template" "$dest/.env"
  cp "$SKELETON/env.template" "$dest/env.template"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    sed -i '' \
      -e "s|^EADAF_WEB_HOST_PORT=.*|EADAF_WEB_HOST_PORT=${web_port}|" \
      -e "s|^EADAF_API_HOST_PORT=.*|EADAF_API_HOST_PORT=${api_port}|" \
      -e "s|^EADAF_PUBLIC_URL=.*|EADAF_PUBLIC_URL=http://localhost:${web_port}|" \
      "$dest/.env"
  else
    sed -i \
      -e "s|^EADAF_WEB_HOST_PORT=.*|EADAF_WEB_HOST_PORT=${web_port}|" \
      -e "s|^EADAF_API_HOST_PORT=.*|EADAF_API_HOST_PORT=${api_port}|" \
      -e "s|^EADAF_PUBLIC_URL=.*|EADAF_PUBLIC_URL=http://localhost:${web_port}|" \
      "$dest/.env"
  fi
}

copy_runtime_skeleton() {
  local dest="$1"
  local f
  for f in docker-compose.yml lib.sh up.sh ctl.sh status.sh init-db.sh start.sh \
    apply-schema.sh apply-upgrade.sh apply-patch.sh install-docker.sh \
    env.template init-sql.manifest schema-baseline.txt; do
    cp "$SKELETON/$f" "$dest/$f"
  done
  mkdir -p "$dest/nginx/conf" "$dest/init" "$dest/logs/api" "$dest/logs/nginx" \
    "$dest/data" "$dest/frontend" "$dest/docker-images" "$dest/k8s"
  cp "$SKELETON/nginx/conf/default.conf" "$dest/nginx/conf/default.conf"
  cp "$SKELETON/init/fix-db-connection.js" "$dest/init/fix-db-connection.js"
  cp "$SKELETON/k8s/"*.yaml "$SKELETON/k8s/"*.sh "$dest/k8s/"
  : >"$dest/logs/api/.gitkeep"
  : >"$dest/logs/nginx/.gitkeep"
  : >"$dest/data/.gitkeep"
  : >"$dest/frontend/.gitkeep"
  : >"$dest/docker-images/.gitkeep"
  chmod +x "$dest/"*.sh "$dest/k8s/"*.sh 2>/dev/null || true
}

lf_fix() {
  local dest="$1"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    find "$dest" -type f \( -name '*.sh' -o -name '*.yml' -o -name '*.yaml' -o -name '.env' -o -name '*.conf' \) \
      -exec sed -i '' $'s/\r$//' {} +
  else
    find "$dest" -type f \( -name '*.sh' -o -name '*.yml' -o -name '*.yaml' -o -name '.env' -o -name '*.conf' \) \
      -exec sed -i 's/\r$//' {} +
  fi
}

export_bizdata_sql() {
  # 数据补丁暂时停用。配置与业务数据改走管理端「系统设置」的 EADAF / 应用数据包。
  die "数据补丁已暂时停用。请用管理端「系统设置」的 EADAF / 应用数据包导出、导入。"
  # local application="$1" out="$2"
  # need_cmd node
  # node "$PACK_LIB_DIR/export-bizdata.cjs" --application "$application" --out "$out"
}

confirm_or_die() {
  local nonint="$1"
  if [[ "$nonint" == "1" ]]; then
    return 0
  fi
  local answer
  read -r -p "确认开始构建？[Y/n]: " answer
  answer="$(printf '%s' "$answer" | tr '[:upper:]' '[:lower:]')"
  [[ -z "$answer" || "$answer" == "y" || "$answer" == "yes" ]] || die "已取消"
}
