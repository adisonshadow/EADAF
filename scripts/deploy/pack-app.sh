#!/usr/bin/env bash
# Shell B：打包一个 EADAF 业务应用。包本身不分离线/普通/K8s，现场按平台 .deploy-mode 安装。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib-pack.sh"

APP_DIR=""
ARCH=""
KIND=""
PATCH_PARTS=""
WEB_PORT=""
API_PORT=""
VERSION=""
OUT_DIR=""
NONINT=0
ASSUME_YES=0

usage() {
  cat <<'EOF'
用法: bash scripts/deploy/pack-app.sh [选项]

  --app-dir PATH                应用仓库根目录（内含 eadaf.app.yaml）
  --arch amd64|arm64
  --kind install|upgrade|patch
  --patch web,api               补丁种类（数据补丁 bizdata 已暂时停用）
  --web-port N                  仅安装包
  --api-port N                  仅安装包
  --version VER
  --out DIR                     默认 <仓库>/packages/APP
  --non-interactive --yes
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-dir) APP_DIR="${2:-}"; shift 2 ;;
    --arch) ARCH="${2:-}"; shift 2 ;;
    --kind) KIND="${2:-}"; shift 2 ;;
    --patch) PATCH_PARTS="${2:-}"; shift 2 ;;
    --web-port) WEB_PORT="${2:-}"; shift 2 ;;
    --api-port) API_PORT="${2:-}"; shift 2 ;;
    --version) VERSION="${2:-}"; shift 2 ;;
    --out) OUT_DIR="${2:-}"; shift 2 ;;
    --non-interactive) NONINT=1; shift ;;
    --yes) ASSUME_YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "未知参数: $1" ;;
  esac
done

ask() {
  local prompt="$1" default="${2:-}" answer
  if [[ -n "$default" ]]; then
    read -r -p "$prompt [$default]: " answer
    echo "${answer:-$default}"
  else
    read -r -p "$prompt: " answer
    echo "$answer"
  fi
}

if [[ "$NONINT" != "1" && -t 0 ]]; then
  APP_DIR="$(ask "应用项目目录" "$APP_DIR")"
  [[ -n "$ARCH" ]] || {
    echo "CPU 架构:  1) amd64  2) arm64"
    read -r -p "选择 [1-2，回车=amd64]: " c
    case "${c:-1}" in 1) ARCH=amd64 ;; 2) ARCH=arm64 ;; *) die "无效架构" ;; esac
  }
  [[ -n "$KIND" ]] || {
    echo "种类:  1) 安装  2) 升级  3) 补丁"
    read -r -p "选择 [1-3]: " c
    case "$c" in 1) KIND=install ;; 2) KIND=upgrade ;; 3) KIND=patch ;; *) die "无效种类" ;; esac
  }
  if [[ "$KIND" == "patch" && -z "$PATCH_PARTS" ]]; then
    echo "补丁: 1) 前端 web  2) 后端 api（可逗号多选）"
    # 数据补丁暂时停用。配置与业务数据改走管理端「系统设置」的应用数据包。
    # echo "  3) 数据 bizdata"
    read -r -p "选择: " c
    PATCH_PARTS=""
    IFS=',' read -r -a arr <<<"$c"
    for item in "${arr[@]}"; do
      item="$(printf '%s' "$item" | tr -d '[:space:]')"
      case "$item" in
        1|web) PATCH_PARTS="${PATCH_PARTS:+$PATCH_PARTS,}web" ;;
        2|api) PATCH_PARTS="${PATCH_PARTS:+$PATCH_PARTS,}api" ;;
        # 3|bizdata) PATCH_PARTS="${PATCH_PARTS:+$PATCH_PARTS,}bizdata" ;;
        3|bizdata) die "数据补丁已暂时停用。请用管理端「系统设置」的应用数据包导出、导入。" ;;
        *) die "无效补丁种类: $item" ;;
      esac
    done
  fi
else
  [[ -n "$APP_DIR" && -n "$ARCH" && -n "$KIND" ]] || die "非交互模式需要 --app-dir --arch --kind"
  [[ "$KIND" != "patch" || -n "$PATCH_PARTS" ]] || die "补丁需要 --patch"
  ASSUME_YES=1
fi

APP_DIR="$(cd "$APP_DIR" && pwd)"
MANIFEST_FILE="$APP_DIR/eadaf.app.yaml"
if [[ ! -f "$MANIFEST_FILE" ]]; then
  cat >&2 <<EOF
缺少 $MANIFEST_FILE
请在应用根目录添加 eadaf.app.yaml。FPCU2 可写成:

name: fpcu2
version: 1.0.0
preset: fpcu2
applicationCode: FPCU
webPort: 13308
apiPort: 13303

示例文件: scripts/deploy/app-presets/fpcu2/eadaf.app.yaml.example
EOF
  exit 1
fi

META="$(node "$SCRIPT_DIR/read-app-manifest.cjs" "$MANIFEST_FILE")"
meta_get() {
  node -e 'const m=JSON.parse(process.argv[1]); const k=process.argv[2]; process.stdout.write(m[k]==null?"":String(m[k]))' "$META" "$1"
}

APP_NAME="$(meta_get name)"
PRESET="$(meta_get preset)"
APP_CODE="$(meta_get applicationCode)"
VERSION="${VERSION:-$(meta_get version)}"
[[ -n "$VERSION" ]] || VERSION="0.0.0"
WEB_DEFAULT="$(meta_get webPort)"
API_DEFAULT="$(meta_get apiPort)"
WEB_DEFAULT="${WEB_DEFAULT:-8080}"
API_DEFAULT="${API_DEFAULT:-8081}"

ARCH="$(normalize_arch "$ARCH")" || die "不支持的架构"
KIND="$(printf '%s' "$KIND" | tr '[:upper:]' '[:lower:]')"
PLATFORM="$(platform_of_arch "$ARCH")"
[[ -n "$APP_CODE" ]] || die "eadaf.app.yaml 缺少 applicationCode"

if [[ "$NONINT" != "1" && -t 0 ]]; then
  if [[ "$KIND" == "install" ]]; then
    WEB_PORT="$(ask "应用前端宿主机端口" "${WEB_PORT:-$WEB_DEFAULT}")"
    API_PORT="$(ask "应用后端宿主机端口" "${API_PORT:-$API_DEFAULT}")"
  fi
  VERSION="$(ask "版本" "$VERSION")"
  OUT_DIR="$(ask "输出目录" "${OUT_DIR:-$REPO_ROOT/packages/APP}")"
else
  WEB_PORT="${WEB_PORT:-$WEB_DEFAULT}"
  API_PORT="${API_PORT:-$API_DEFAULT}"
  OUT_DIR="${OUT_DIR:-$REPO_ROOT/packages/APP}"
fi

NEED_WEB=0; NEED_API=0; NEED_BIZ=0; PATCH_SLUG=""
if [[ "$KIND" == "patch" ]]; then
  IFS=',' read -r -a parts <<<"$PATCH_PARTS"
  for p in "${parts[@]}"; do
    p="$(printf '%s' "$p" | tr -d '[:space:]')"
    case "$p" in
      web) NEED_WEB=1 ;;
      api) NEED_API=1 ;;
      # bizdata) NEED_BIZ=1 ;;
      bizdata) die "数据补丁已暂时停用。请用管理端「系统设置」的应用数据包导出、导入。" ;;
      *) die "未知补丁种类: $p" ;;
    esac
    PATCH_SLUG="${PATCH_SLUG:+$PATCH_SLUG+}$p"
  done
else
  NEED_WEB=1; NEED_API=1
fi

DATE_STAMP="$(date +%Y%m%d-%H%M)"
if [[ "$KIND" == "patch" && "$NEED_WEB" == "0" && "$NEED_API" == "0" ]]; then
  ARCHIVE="${APP_NAME}-patch-${PATCH_SLUG}-v${VERSION}-${DATE_STAMP}.tar.gz"
elif [[ "$KIND" == "patch" ]]; then
  ARCHIVE="${APP_NAME}-patch-${PATCH_SLUG}-${ARCH}-v${VERSION}-${DATE_STAMP}.tar.gz"
else
  ARCHIVE="${APP_NAME}-${KIND}-${ARCH}-v${VERSION}-${DATE_STAMP}.tar.gz"
fi

echo ""
echo "摘要"
echo "  应用: $APP_NAME ($APP_CODE) preset=${PRESET:-无}"
echo "  种类: $KIND ${PATCH_SLUG:+($PATCH_SLUG)}"
echo "  架构: $ARCH"
if [[ "$KIND" == "install" ]]; then
  echo "  端口: web=$WEB_PORT api=$API_PORT"
fi
echo "  输出: $OUT_DIR/$ARCHIVE"
if [[ "${PRESET:-}" == "fpcu2" && -z "${FPCU2_APP_SECRET:-}" ]]; then
  FPCU_SECRET_DEFAULT="62bb0941354d3e506ed5b7d9126f2fd50655e0966d2695d127e3758477b8ed07"
  if [[ "$NONINT" != "1" && -t 0 ]]; then
    read -r -p "FPCU2 应用密钥 [$FPCU_SECRET_DEFAULT]: " FPCU2_APP_SECRET
    FPCU2_APP_SECRET="${FPCU2_APP_SECRET:-$FPCU_SECRET_DEFAULT}"
  else
    FPCU2_APP_SECRET="$FPCU_SECRET_DEFAULT"
  fi
  export FPCU2_APP_SECRET
  echo "  密钥: 已设置（${FPCU2_APP_SECRET:0:8}…）"
fi
confirm_or_die "$ASSUME_YES"

if [[ "$NEED_WEB" == "1" || "$NEED_API" == "1" ]]; then
  need_cmd docker
  if ! docker_err="$(docker info 2>&1 >/dev/null)"; then
    die "Docker 没有启动。请先打开 Docker Desktop，等引擎起来后再打包。${docker_err:+ 详情: ${docker_err}}"
  fi
fi

STAGE="$(mktemp -d "$REPO_ROOT/packages/.staging.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
INNER="${ARCHIVE%.tar.gz}"
DEST="$STAGE/$INNER"
mkdir -p "$DEST/docker-images" "$DEST/k8s"

# 容器内 pnpm install / corepack 的 registry（取主机当前生效的源）。
# 不取到时不传 --build-arg，Dockerfile 里 ARG 为空即退回默认 npmjs。
CONTAINER_NPM_REGISTRY="$(resolve_npm_registry || true)"

build_fpcu2() {
  local bff_image="fpcu2-bff:v1" web_image="fpcu2-web:v1"
  local staging="$REPO_ROOT/.pack-fpcu2-staging"
  local reg_args=()
  [[ -n "$CONTAINER_NPM_REGISTRY" ]] && reg_args=(--build-arg "NPM_REGISTRY=$CONTAINER_NPM_REGISTRY")
  rm -rf "$staging"
  mkdir -p "$staging/fpcu2" "$staging/docker/fpcu2-web"
  need_cmd rsync
  rsync -a --exclude node_modules --exclude .git --exclude EADAF-Deploy \
    --exclude .build-staging --exclude .DS_Store --exclude '**/dist' \
    "$APP_DIR/" "$staging/fpcu2/"
  cp "$SCRIPT_DIR/app-presets/fpcu2/bff/Dockerfile" "$staging/fpcu2/Dockerfile.bff"
  cp "$SCRIPT_DIR/app-presets/fpcu2/bff/dockerignore" "$staging/fpcu2/.dockerignore"
  cp "$SCRIPT_DIR/app-presets/fpcu2/web/Dockerfile" "$staging/docker/fpcu2-web/Dockerfile"
  cp "$SCRIPT_DIR/app-presets/fpcu2/web/nginx.conf.template" "$staging/docker/fpcu2-web/nginx.conf.template"
  cp "$SCRIPT_DIR/app-presets/fpcu2/web/docker-entrypoint.sh" "$staging/docker/fpcu2-web/docker-entrypoint.sh"
  chmod +x "$staging/docker/fpcu2-web/docker-entrypoint.sh"
  # 容器内 pnpm install 的 registry：注入主机当前生效的源，避免直连 npmjs 被 TLS 重置
  prepare_container_registry "$staging/fpcu2"
  if [[ "$NEED_API" == "1" ]]; then
    pull_platform_image "node:22-bookworm" "$PLATFORM" "$ARCH"
    docker build --platform "$PLATFORM" -f "$staging/fpcu2/Dockerfile.bff" -t "$bff_image" \
      ${reg_args[@]+"${reg_args[@]}"} "$staging/fpcu2"
    save_image "$bff_image" "$DEST/docker-images" "$ARCH"
  fi
  if [[ "$NEED_WEB" == "1" ]]; then
    pull_platform_image "node:22-bookworm" "$PLATFORM" "$ARCH"
    pull_platform_image "nginx:1.25-alpine" "$PLATFORM" "$ARCH"
    docker build --platform "$PLATFORM" -f "$staging/docker/fpcu2-web/Dockerfile" -t "$web_image" \
      ${reg_args[@]+"${reg_args[@]}"} "$staging"
    save_image "$web_image" "$DEST/docker-images" "$ARCH"
  fi
  rm -rf "$staging"
  BFF_IMAGE="$bff_image"
  WEB_IMAGE="$web_image"
  BFF_CONTAINER_PORT=13303
  WEB_CONTAINER_PORT=13308
}

build_generic() {
  node -e '
    const m = JSON.parse(process.argv[1]);
    const services = m.services || [];
    if (!services.length) { console.error("eadaf.app.yaml 缺少 services，且没有 preset"); process.exit(1); }
    for (const s of services) {
      if (!s.name || !s.role || !s.image || !s.dockerfile) {
        console.error("service 需要 name/role/image/dockerfile"); process.exit(1);
      }
      console.log([s.role, s.name, s.image, s.dockerfile, s.context || ".", s.containerPort || ""].join("\t"));
    }
  ' "$META" >"$DEST/services.tsv"
  while IFS=$'\t' read -r role name image dockerfile context port; do
    [[ -n "$role" ]] || continue
    if [[ "$role" == "api" && "$NEED_API" != "1" ]]; then continue; fi
    if [[ "$role" == "web" && "$NEED_WEB" != "1" ]]; then continue; fi
    local ctx="$APP_DIR/$context"
    # 通用流程同理：registry 既落到上下文 .npmrc，也通过 build-arg 传给 Dockerfile
    prepare_container_registry "$ctx"
    local reg_args=()
    [[ -n "$CONTAINER_NPM_REGISTRY" ]] && reg_args=(--build-arg "NPM_REGISTRY=$CONTAINER_NPM_REGISTRY")
    docker build --platform "$PLATFORM" -f "$APP_DIR/$dockerfile" -t "$image" \
      ${reg_args[@]+"${reg_args[@]}"} "$ctx"
    save_image "$image" "$DEST/docker-images" "$ARCH"
    if [[ "$role" == "api" ]]; then
      BFF_IMAGE="$image"; BFF_CONTAINER_PORT="${port:-8081}"
    fi
    if [[ "$role" == "web" ]]; then
      WEB_IMAGE="$image"; WEB_CONTAINER_PORT="${port:-8080}"
    fi
  done <"$DEST/services.tsv"
}

BFF_IMAGE=""; WEB_IMAGE=""; BFF_CONTAINER_PORT=""; WEB_CONTAINER_PORT=""
if [[ "$NEED_WEB" == "1" || "$NEED_API" == "1" ]]; then
  if [[ "$PRESET" == "fpcu2" ]]; then
    build_fpcu2
  else
    build_generic
  fi
fi

# 数据补丁暂时停用。应用的配置与业务数据改走管理端「系统设置」。
# if [[ "$NEED_BIZ" == "1" ]]; then
#   export_bizdata_sql "$APP_CODE" "$DEST/bizdata-patch.sql"
# fi

# 安装包附带注册 SQL（端口写入 URL 占位，现场 apply 再按 PUBLIC_HOST 替换）
if [[ "$KIND" == "install" && "$PRESET" == "fpcu2" ]]; then
  cp "$SCRIPT_DIR/app-presets/fpcu2/application.sql.template" "$DEST/application.sql.template"
fi

HOST_WEB="$WEB_PORT"
HOST_API="$API_PORT"
if [[ "$KIND" != "install" ]]; then
  HOST_WEB="$WEB_DEFAULT"
  HOST_API="$API_DEFAULT"
fi

if [[ -n "$BFF_IMAGE" || -n "$WEB_IMAGE" ]]; then
  {
    echo "services:"
    if [[ -n "$WEB_IMAGE" ]]; then
      cat <<EOF
  ${APP_NAME}-web:
    image: ${WEB_IMAGE}
    container_name: ${APP_NAME}-web
    restart: unless-stopped
    ports:
      - "${HOST_WEB}:${WEB_CONTAINER_PORT}"
    env_file:
      - .env
    environment:
      EADAF_WEB_HOST_PORT: "\${EADAF_WEB_HOST_PORT:-9527}"
      FPCU2_SSO_APPLICATION_ID: "\${FPCU2_APPLICATION_ID:-10000000-0001-4000-8000-000000006666}"
      FPCU2_BFF_UPSTREAM: "${APP_NAME}-bff:${BFF_CONTAINER_PORT:-13303}"
EOF
    fi
    if [[ -n "$BFF_IMAGE" ]]; then
      cat <<EOF
  ${APP_NAME}-bff:
    image: ${BFF_IMAGE}
    container_name: ${APP_NAME}-bff
    restart: unless-stopped
    ports:
      - "${HOST_API}:${BFF_CONTAINER_PORT}"
    env_file:
      - .env
    environment:
      # 容器内互调，与客户访问 IP/域名无关
      EADAF_API_BASE_URL: "\${EADAF_API_BASE_URL:-http://eadaf-api:9526}"
      EADAF_WEB_HOST_PORT: "\${EADAF_WEB_HOST_PORT:-9527}"
      FPCU2_WEB_HOST_PORT: "${HOST_WEB}"
      FPCU2_API_HOST_PORT: "${HOST_API}"
      FPCU2_APPLICATION_ID: "\${FPCU2_APPLICATION_ID:-10000000-0001-4000-8000-000000006666}"
      FPCU2_APP_SECRET: "\${FPCU2_APP_SECRET:-62bb0941354d3e506ed5b7d9126f2fd50655e0966d2695d127e3758477b8ed07}"
      SSO_JWT_SALT: "\${SSO_JWT_SALT:-\${FPCU2_APP_SECRET:-62bb0941354d3e506ed5b7d9126f2fd50655e0966d2695d127e3758477b8ed07}}"
      # 勿继承平台 .env 的 SSO_REDIRECT_MODE=POST_REDIRECT
      SSO_REDIRECT_MODE: HEADER_REDIRECT
    depends_on:
      eadaf-api:
        condition: service_healthy
EOF
    fi
  } >"$DEST/compose.yml"

  : >"$DEST/k8s/app.yaml"
  if [[ -n "$BFF_IMAGE" ]]; then
    cat >>"$DEST/k8s/app.yaml" <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${APP_NAME}-bff
  namespace: eadaf
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${APP_NAME}-bff
  template:
    metadata:
      labels:
        app: ${APP_NAME}-bff
    spec:
      containers:
        - name: bff
          image: ${BFF_IMAGE}
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: ${BFF_CONTAINER_PORT}
              hostPort: ${HOST_API}
---
apiVersion: v1
kind: Service
metadata:
  name: ${APP_NAME}-bff
  namespace: eadaf
spec:
  selector:
    app: ${APP_NAME}-bff
  ports:
    - port: ${BFF_CONTAINER_PORT}
      targetPort: ${BFF_CONTAINER_PORT}
EOF
  fi
  if [[ -n "$WEB_IMAGE" ]]; then
    cat >>"$DEST/k8s/app.yaml" <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${APP_NAME}-web
  namespace: eadaf
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${APP_NAME}-web
  template:
    metadata:
      labels:
        app: ${APP_NAME}-web
    spec:
      containers:
        - name: web
          image: ${WEB_IMAGE}
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: ${WEB_CONTAINER_PORT}
              hostPort: ${HOST_WEB}
---
apiVersion: v1
kind: Service
metadata:
  name: ${APP_NAME}-web
  namespace: eadaf
spec:
  selector:
    app: ${APP_NAME}-web
  ports:
    - port: ${WEB_CONTAINER_PORT}
      targetPort: ${WEB_CONTAINER_PORT}
EOF
  fi
fi

cat >"$DEST/apply.sh" <<'APPLY'
#!/usr/bin/env bash
# 把应用包装进已经装好的 EADAF 平台。模式读取平台目录的 .deploy-mode。
set -euo pipefail
PATCH_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
die() { printf '[ERR] %s\n' "$*" >&2; exit 1; }
if [[ -z "${DEPLOY_ROOT:-}" ]]; then
  die "请设置 DEPLOY_ROOT=/path/to/eadaf-runtime（已安装的 EADAF 平台目录）"
fi
DEPLOY_ROOT="$(cd "$DEPLOY_ROOT" && pwd)"
[[ -f "$DEPLOY_ROOT/docker-compose.yml" || -d "$DEPLOY_ROOT/k8s" ]] || die "$DEPLOY_ROOT 不是 EADAF 平台目录"
# 平台 lib.sh 可能是旧版（无 load_deploy_choice）；应用包自带兼容实现，不依赖平台脚本版本。
# shellcheck disable=SC1091
[[ -f "$DEPLOY_ROOT/lib.sh" ]] && source "$DEPLOY_ROOT/lib.sh"
if ! declare -F load_deploy_choice >/dev/null 2>&1; then
  load_deploy_choice() {
    local root="${1:-.}"
    if [[ -f "$root/.deploy-mode" ]]; then
      # shellcheck disable=SC1091
      source "$root/.deploy-mode"
    fi
    if [[ -z "${DEPLOY_RUNTIME:-}" && -n "${DEPLOY_MODE:-}" ]]; then
      case "$DEPLOY_MODE" in
        k8s) DEPLOY_RUNTIME=k8s; DEPLOY_NETWORK="${DEPLOY_NETWORK:-offline}" ;;
        normal|online) DEPLOY_RUNTIME=compose; DEPLOY_NETWORK=online ;;
        *) DEPLOY_RUNTIME=compose; DEPLOY_NETWORK="${DEPLOY_NETWORK:-offline}" ;;
      esac
    fi
    DEPLOY_NETWORK="${DEPLOY_NETWORK:-offline}"
    DEPLOY_RUNTIME="${DEPLOY_RUNTIME:-compose}"
    if [[ "$DEPLOY_RUNTIME" == "k8s" ]]; then
      DEPLOY_MODE=k8s
    elif [[ "$DEPLOY_NETWORK" == "online" ]]; then
      DEPLOY_MODE=normal
    else
      DEPLOY_MODE=offline
    fi
    export DEPLOY_NETWORK DEPLOY_RUNTIME DEPLOY_MODE
  }
fi
load_deploy_choice "$DEPLOY_ROOT"
APP_NAME="$(awk -F= '/^name=/{print $2}' "$PATCH_ROOT/app.meta")"
APP_WEB_PORT="$(awk -F= '/^web_port=/{print $2}' "$PATCH_ROOT/app.meta")"
APP_API_PORT="$(awk -F= '/^api_port=/{print $2}' "$PATCH_ROOT/app.meta")"
APP_WEB_PORT="${APP_WEB_PORT:-13308}"
APP_API_PORT="${APP_API_PORT:-13303}"

# 只写入端口与容器内互调地址；对外 IP/域名由请求 Host 推导，换服务器不必改 .env
upsert_env() {
  local file="$1" key="$2" val="$3"
  touch "$file"
  if grep -qE "^${key}=" "$file" 2>/dev/null; then
    if [[ "$(uname -s)" == "Darwin" ]]; then
      sed -i '' -e "s|^${key}=.*|${key}=${val}|" "$file"
    else
      sed -i -e "s|^${key}=.*|${key}=${val}|" "$file"
    fi
  else
    printf '%s=%s\n' "$key" "$val" >>"$file"
  fi
}
ENV_FILE="$DEPLOY_ROOT/.env"
[[ -f "$ENV_FILE" ]] || { [[ -f "$DEPLOY_ROOT/env.template" ]] && cp "$DEPLOY_ROOT/env.template" "$ENV_FILE"; }
if [[ -f "$ENV_FILE" ]]; then
  upsert_env "$ENV_FILE" EADAF_API_BASE_URL "http://eadaf-api:9526"
  upsert_env "$ENV_FILE" EADAF_WEB_HOST_PORT "${EADAF_WEB_HOST_PORT:-9527}"
  upsert_env "$ENV_FILE" FPCU2_WEB_HOST_PORT "$APP_WEB_PORT"
  upsert_env "$ENV_FILE" FPCU2_API_HOST_PORT "$APP_API_PORT"
  upsert_env "$ENV_FILE" FPCU2_APPLICATION_ID "${FPCU2_APPLICATION_ID:-10000000-0001-4000-8000-000000006666}"
  if ! grep -qE '^FPCU2_APP_SECRET=.+' "$ENV_FILE" 2>/dev/null || grep -qE '^FPCU2_APP_SECRET=change-me$' "$ENV_FILE" 2>/dev/null; then
    upsert_env "$ENV_FILE" FPCU2_APP_SECRET "62bb0941354d3e506ed5b7d9126f2fd50655e0966d2695d127e3758477b8ed07"
  fi
  # 清掉易误导的绝对对外 URL（旧包残留 localhost），避免盖过 Host 跟随
  if [[ "$(uname -s)" == "Darwin" ]]; then
    sed -i '' \
      -e '/^FRONTEND_URL=/d' \
      -e '/^SSO_CALLBACK_URL=/d' \
      -e '/^FPCU2_PUBLIC_URL=/d' \
      -e '/^FPCU2_PUBLIC_API_BASE_URL=/d' \
      "$ENV_FILE" || true
  else
    sed -i \
      -e '/^FRONTEND_URL=/d' \
      -e '/^SSO_CALLBACK_URL=/d' \
      -e '/^FPCU2_PUBLIC_URL=/d' \
      -e '/^FPCU2_PUBLIC_API_BASE_URL=/d' \
      "$ENV_FILE" || true
  fi
fi

mkdir -p "$DEPLOY_ROOT/apps/$APP_NAME"
if [[ -f "$PATCH_ROOT/compose.yml" ]]; then
  cp "$PATCH_ROOT/compose.yml" "$DEPLOY_ROOT/apps/$APP_NAME/compose.yml"
fi
if [[ -d "$PATCH_ROOT/k8s" ]]; then
  mkdir -p "$DEPLOY_ROOT/apps/$APP_NAME/k8s"
  cp -a "$PATCH_ROOT/k8s/." "$DEPLOY_ROOT/apps/$APP_NAME/k8s/"
fi
if [[ -d "$PATCH_ROOT/docker-images" ]]; then
  mkdir -p "$DEPLOY_ROOT/docker-images"
  cp -a "$PATCH_ROOT/docker-images/." "$DEPLOY_ROOT/docker-images/"
fi
if [[ "$DEPLOY_RUNTIME" == "k8s" ]]; then
  if [[ -d "$PATCH_ROOT/docker-images" ]] && compgen -G "$PATCH_ROOT/docker-images/*.tar" >/dev/null; then
    IMG_DIR="$PATCH_ROOT/docker-images" bash "$DEPLOY_ROOT/k8s/load-images.sh" || {
      for tar in "$PATCH_ROOT"/docker-images/*.tar; do
        docker load -i "$tar" || ctr -n k8s.io images import "$tar" || k3s ctr images import "$tar"
      done
    }
  fi
  if [[ -f "$DEPLOY_ROOT/apps/$APP_NAME/k8s/app.yaml" ]]; then
    kubectl apply -f "$DEPLOY_ROOT/apps/$APP_NAME/k8s/app.yaml"
  fi
else
  # shellcheck disable=SC1091
  source "$DEPLOY_ROOT/lib.sh"
  OFFLINE_ROOT="$DEPLOY_ROOT"
  require_docker
  init_compose
  if compgen -G "$PATCH_ROOT/docker-images/*.tar" >/dev/null; then
    for tar in "$PATCH_ROOT"/docker-images/*.tar; do
      docker load <"$tar"
    done
  fi
  if [[ -f "$DEPLOY_ROOT/apps/$APP_NAME/compose.yml" ]]; then
    (cd "$DEPLOY_ROOT" && "${COMPOSE[@]}" -f docker-compose.yml -f "apps/$APP_NAME/compose.yml" up -d --force-recreate)
  fi
fi
if [[ -f "$PATCH_ROOT/application.sql.template" && -f "$DEPLOY_ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC2046
  export $(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$DEPLOY_ROOT/.env" | sed 's/#.*//' | xargs)
  set +a
  tmp="$(mktemp)"
  sed \
    -e "s|\${FPCU2_APPLICATION_ID}|${FPCU2_APPLICATION_ID:-10000000-0001-4000-8000-000000006666}|g" \
    -e "s|\${FPCU2_APP_SECRET}|${FPCU2_APP_SECRET:-62bb0941354d3e506ed5b7d9126f2fd50655e0966d2695d127e3758477b8ed07}|g" \
    -e "s|\${FPCU2_API_HOST_PORT}|${FPCU2_API_HOST_PORT:-${APP_API_PORT}}|g" \
    -e "s|\${FPCU2_WEB_HOST_PORT}|${FPCU2_WEB_HOST_PORT:-${APP_WEB_PORT}}|g" \
    "$PATCH_ROOT/application.sql.template" >"$tmp"
  if [[ "$DEPLOY_RUNTIME" == "k8s" ]]; then
    pod="$(kubectl get pod -n "${K8S_NAMESPACE:-eadaf}" -l app=eadaf-postgres -o jsonpath='{.items[0].metadata.name}')"
    kubectl exec -i -n "${K8S_NAMESPACE:-eadaf}" "$pod" -- \
      env PGPASSWORD="${POSTGRES_PASSWORD:-123456}" \
      psql -U "${POSTGRES_USER:-my_name}" -d "${POSTGRES_DATABASE:-eadaf_db}" -v ON_ERROR_STOP=1 <"$tmp"
  else
    docker exec -i -e PGPASSWORD="${POSTGRES_PASSWORD:-123456}" "${POSTGRES_CONTAINER:-EADAF-postgres}" \
      psql -U "${POSTGRES_USER:-my_name}" -d "${POSTGRES_DATABASE:-eadaf_db}" -v ON_ERROR_STOP=1 <"$tmp"
  fi
  rm -f "$tmp"
fi
echo "应用 ${APP_NAME} 已应用到 ${DEPLOY_ROOT} （网络 ${DEPLOY_NETWORK}，运行方式 ${DEPLOY_RUNTIME}）"
echo "对外地址跟随浏览器 Host；仅端口 FPCU2_WEB_HOST_PORT=${APP_WEB_PORT} / FPCU2_API_HOST_PORT=${APP_API_PORT}"
APPLY
chmod +x "$DEST/apply.sh"

cat >"$DEST/app.meta" <<EOF
name=${APP_NAME}
code=${APP_CODE}
preset=${PRESET}
web_port=${HOST_WEB}
api_port=${HOST_API}
EOF
cat >"$DEST/MANIFEST.txt" <<EOF
product=app
name=${APP_NAME}
application=${APP_CODE}
kind=${KIND}
parts=${PATCH_SLUG:-all}
arch=${ARCH}
version=${VERSION}
date=${DATE_STAMP}
web_host_port=${HOST_WEB}
api_host_port=${HOST_API}
git=$(git_sha)
EOF

if [[ "$KIND" == "patch" ]]; then
  printf '%s' "$(printf '%s' "$PATCH_SLUG" | tr '+' ',')" >"$DEST/patch-parts"
fi

lf_fix "$DEST"
mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR/$ARCHIVE"
tar -C "$STAGE" -czf "$OUT_DIR/$ARCHIVE" "$INNER"
log "完成"
echo "压缩包: $OUT_DIR/$ARCHIVE"
ls -lh "$OUT_DIR/$ARCHIVE"
