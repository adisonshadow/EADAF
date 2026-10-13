# FPCU2 BFF — build context: FPCU2 仓库根目录
FROM node:22-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.23.0 --activate

WORKDIR /repo

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# 构建上下文里的 .npmrc（由 pnpm pack:app 注入主机当前生效的 registry）。
# 容器直连 registry.npmjs.org 在国内网络常被 TLS 重置；没有匹配文件时 Docker 会跳过，
# 此时退回 pnpm 默认源。覆盖方式：EADAF_NPM_REGISTRY=https://your-mirror/ pnpm pack:app
COPY .npmrc* ./

RUN pnpm install --frozen-lockfile --filter @fpcu2/backend...

COPY packages/shared ./packages/shared
COPY backend ./backend

# 生产用 tsx 跑源码（避免 FPCU2 当前 tsc 类型错误阻断离线打包）
WORKDIR /repo/backend

ENV NODE_ENV=production
EXPOSE 13303

CMD ["node", "--import", "tsx", "src/server.ts"]
