# FPCU2 Web — build context: staging 根（含 fpcu2/ 与 docker/fpcu2-web/）
FROM node:22-bookworm AS builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.23.0 --activate

# 容器内拉包走哪个 registry：两个变量合起来才能覆盖全部拉包动作
#   COREPACK_NPM_REGISTRY —— corepack prepare pnpm 自己下载 pnpm 时用（它不读 .npmrc）
#   NPM_CONFIG_REGISTRY   —— 之后 pnpm install 用
# 由 pnpm pack:app 传入主机当前生效的源；不传时退回默认 npmjs。
ARG NPM_REGISTRY
ENV COREPACK_NPM_REGISTRY=${NPM_REGISTRY}
ENV NPM_CONFIG_REGISTRY=${NPM_REGISTRY}

WORKDIR /repo

COPY fpcu2/pnpm-workspace.yaml fpcu2/pnpm-lock.yaml fpcu2/package.json fpcu2/tsconfig.base.json ./
COPY fpcu2/packages/shared/package.json ./packages/shared/
COPY fpcu2/frontend/package.json ./frontend/
COPY fpcu2/backend/package.json ./backend/

# 构建上下文里的 .npmrc（由 pnpm pack:app 注入主机当前生效的 registry）。
# 容器直连 registry.npmjs.org 在国内网络常被 TLS 重置；没有匹配文件时 Docker 会跳过，
# 此时退回 pnpm 默认源。覆盖方式：EADAF_NPM_REGISTRY=https://your-mirror/ pnpm pack:app
COPY fpcu2/.npmrc* ./

RUN pnpm install --frozen-lockfile --filter @fpcu2/frontend...

COPY fpcu2/packages/shared ./packages/shared
COPY fpcu2/frontend ./frontend
COPY fpcu2/docs ./docs

RUN pnpm --filter @fpcu2/frontend build

FROM nginx:1.25-alpine

RUN apk add --no-cache gettext

COPY docker/fpcu2-web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/fpcu2-web/docker-entrypoint.sh /docker-entrypoint.sh
COPY --from=builder /repo/frontend/dist /usr/share/nginx/html

RUN chmod +x /docker-entrypoint.sh

ENV LISTEN_PORT=13308
ENV FPCU2_BFF_UPSTREAM=fpcu2-bff:13303
ENV EADAF_WEB_HOST_PORT=9527
ENV FPCU2_SSO_APPLICATION_ID=10000000-0001-4000-8000-000000006666

EXPOSE 13308

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
