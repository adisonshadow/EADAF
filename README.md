# EADAF

企业智能数据应用底座（Enterprise AI-Driven Data Application Foundation）是一套面向企业应用的数据智能应用平台，由统一身份权限、三方应用接入、业务数据建模、API 服务与 AI 能力编排组成。本仓库是 **pnpm monorepo**。

## 1. 仓库组成


| 目录                          | 说明                                      |
| --------------------------- | --------------------------------------- |
| `backend`                   | Koa + Sequelize REST API                |
| `frontend`                  | React + Vite 管理端                        |
| `AIBase_with_example`       | AI Base 演示与 `@eadaf/ai-base` 源码包        |
| `eadaf-runtime`            | 平台运行时骨架（在线 / 离线 × Compose / K8s，不含业务应用） |
| `scripts/deploy`            | 开发机打包脚本（平台包、应用包）                        |
| `packages/EADAF`、`packages/APP` | 打包产物目录（不入库）                             |




## 2. 能力概览



### 2.1 身份与访问管理（IAM）

- **成员管理**：账号全生命周期、部门归属、状态控制、密码重置
- **组织管理**：多层级部门树（邻接表 + 闭包表）
- **角色管理**：RBAC 角色定义与权限绑定
- **角色绑定**：成员、组织均可绑定多个角色；成员有效角色 = 直接角色 ∪ 组织继承角色
- **权限**：菜单、按钮、API 三级权限资源
- **认证**：登录验证码、JWT / Refresh Token、会话校验



### 2.2 应用与单点登录（SSO）

- **应用**：三方应用注册、密钥与回调配置
- **SSO**：统一认证入口，按应用配置对接（如 OAuth 2.0、SAML）
- **API 接入**：应用侧 API 连通与数据范围配置



### 2.3 业务数据（BizData）

- **数据模型**：Scope 树、ER 实体、字段、枚举、关系的可视化设计
- **数据执行**：按实体生成 DDL / 结构预览，向目标库执行物化
- **数据库连接**：支持 PostgreSQL、MongoDB、Redis 连接管理与测试
- **物化历史**：执行记录、版本 stale 状态、按连接筛选
- **AI 联动**：通过 AISurface / Tool 与对话侧联动刷新页面状态



### 2.4 AI 管理（AIBase）

- **服务商与模型**：Provider、Model、能力标签管理
- **Scopes / Tools / Skills**：工具注册、Skill 编排、应用绑定
- **AI 网关**：统一 Chat 上游转发、流式响应、Tool 调用
- **请求日志**：AI 调用审计与排查
- **前端 AI Chat**：基于 `@eadaf/ai-base` 的嵌入式对话与 Tool 步骤展示



## 3. 本地开发配置



### 3.1 环境要求

- Node.js **≥ 22.13**（与 `backend` 的 `engines` 一致）
- pnpm **10+**（仓库使用 `pnpm@10.33.2`）
- PostgreSQL 14+（开发默认 `localhost:25432`）
- Redis（开发默认 `localhost:26379`，可选）



### 3.2 安装依赖

在仓库根目录执行一次即可，不要再进 `backend` 单独 `npm install`。

```bash
pnpm install
```



### 3.3 初始化数据库

```bash
cd backend
cp .env.development .env.development.local   # 按需修改连接信息
pnpm init-db                                 # 结构 + 超管 + EADAF 全局/专用 Skill/Tool
# pnpm init-db-with-mock                     # 另含 Mock 用户/部门与销售示例实体
# pnpm init-db-with-aibase-seed              # 另含 Demo 全量 AI 种子（会 TRUNCATE Skill/Tool）
```

默认 `init-db` 会 **DROP 并重建** `uac` **schema**，只用于本机或空库。它不会写入销售域测试实体。EADAF 系统 Skill（如 `bizdata-model-design`）由 `scripts/migrate-eadaf-ai-skills.sql` 幂等写入。

### 3.4 同步 Skill 与 Tool

本地改完 Skill / Tool、需要推到已有库时用下面的命令。它不重置库。

```bash
cd backend
pnpm export-eadaf-ai-skills    # 从本地库导出 upsert SQL，然后提交

# 目标库上执行
pnpm migrate-eadaf-ai-skills
```



### 3.5 启动服务

仓库根目录一条命令会先等 API 监听成功，再起前端：

```bash
pnpm dev          # API 29526 + 管理端 29527
pnpm killdev      # 停掉本次 dev 拉起的进程
```

也可以分两个终端：

```bash
cd backend && pnpm dev     # API，默认 29526，nodemon 热重载
cd frontend && pnpm dev    # 管理端，默认 29527
```

文件上传、预览和裁剪走本机 MinIO。在 `backend` 目录用开发 Compose 拉起（数据卷 `EADAF_minio_data`，账号与 `backend/.env.example` 一致）：

```bash
cd backend
docker compose -f docker-compose.yml up -d minio
# 需要 MySQL 时改用：docker compose -f docker-compose_with_MySQL.yml up -d minio
```

- 管理端：[http://localhost:29527](http://localhost:29527)
- API 文档：[http://localhost:29526/swagger](http://localhost:29526/swagger)
- 健康检查：`curl http://localhost:29526/api/v1/health`



### 3.6 默认账号

`init-db` 创建超级管理员 **admin / 123456**（见 `backend/scripts/superadmin.sql`）。初始化完成后尽快修改密码。

## 4. pm2 托管

前后端都提供 `pm2dev` / `pm2prod`。底层是 `pm2 startOrReload`：没在跑就启动，已在跑就按新配置重载，重复执行不会多出进程。

pm2 是 workspace 的 devDependency，不必全局安装。根目录用 `pnpm --filter ./backend exec pm2 <cmd>`；进到包目录后可以直接用 `pm2`。

### 4.1 启动

```bash
# 仓库根目录同时挂起前后端
pnpm pm2dev        # 开发：uac-api-dev + eadaf-web-dev
pnpm pm2prod       # 生产：uac-api + eadaf-web

# 或只挂一边
pnpm --filter ./backend pm2dev
pnpm --filter ./frontend pm2prod
```



### 4.2 进程对照


| 命令                 | pm2 进程名         | 说明                                                                                                |
| ------------------ | --------------- | ------------------------------------------------------------------------------------------------- |
| `backend pm2dev`   | `uac-api-dev`   | `NODE_ENV=development`，pm2 watch 文件变更后自动重启                                                        |
| `backend pm2prod`  | `uac-api`       | `NODE_ENV=production`，加载 `.env.production`                                                        |
| `frontend pm2dev`  | `eadaf-web-dev` | Vite 开发服务（29527，自带 HMR）                                                                           |
| `frontend pm2prod` | `eadaf-web`     | `vite preview` 托管已构建的 `dist`。需要先 `pnpm --filter ./frontend build`。`/api/v1` 代理到 `localhost:29526` |


配置文件：`backend/ecosystem.config.cjs`、`frontend/ecosystem.config.cjs`。每个文件里有 dev / prod 两个进程，脚本用 `--only` 选择。

### 4.3 常用操作

```bash
pm2 list                       # 查看进程
pm2 logs uac-api --lines 200   # 查看日志
pm2 stop uac-api-dev           # 停止（保留进程项）
pm2 delete uac-api eadaf-web   # 移除进程项
pm2 kill                       # 关闭 pm2 守护进程
```



## 5. 打包与部署

开发机打出运行时压缩包，到 Linux 上安装 / 升级。平台包不含业务应用；支持 CentOS、Ubuntu、Debian 与 amd64 / arm64。

升级包和补丁包暂时只有程序（镜像 / 前端 dist），不带表结构、不带业务数据。表结构只在 EADAF 安装包里。~~数据补丁（~~`bizdata`~~）~~ 已暂时停用。

```bash
pnpm pack:eadaf    # 平台安装 / 升级 / 补丁 → packages/EADAF/
pnpm pack:app      # 业务应用包 → packages/APP/
```

上传的文件放在 **MinIO** 独立卷 `eadaf_minio_data`，不在 API 容器磁盘里。安装包和升级包带 MinIO 镜像；升级会先启动 MinIO，再重建 API。只打前端补丁不动 MinIO。已经写在旧容器磁盘里的文件不会自动搬进 MinIO。

完整说明（网络与运行方式、包内容、导入步骤）见 [docs/pack-and-deploy.md](./docs/pack-and-deploy.md)。服务器上用 Node 直接跑开发环境见 [docs/dev-server-deploy.md](./docs/dev-server-deploy.md)。

## 6. 数据包导出 / 导入（系统设置）

两套**已运行**的 EADAF 之间同步配置与业务数据，只用管理端设置页。第 5 节的升级包、补丁包不含这些数据；安装包里的 init-db 只建表结构。


| Tab               | 文件名示例                           | 迁什么                               |
| ----------------- | ------------------------------- | --------------------------------- |
| **EADAF 平台导出/导入** | `eadaf-platform-export-*.zip`   | 平台 Skill、AI 目录、数据标准、系统开关、UAC 权限码等 |
| **应用导出/导入**       | `eadaf-app-export-<应用编码>-*.zip` | 单个业务应用的配置、模型、API、可选行数据 / UAC / 文件 |


路径：管理端 → **系统设置** → 对应 Tab。内置应用 `EADAF` 不可走「应用导出/导入」（平台能力用平台 Tab）。导出可能含明文密钥，请妥善保管。

选项、冲突策略与和运行时包的区别见 [docs/data-transfer.md](./docs/data-transfer.md)。

## 7. 注意事项



### 7.1 不要对已有数据的库执行 init-db

`pnpm init-db` 会 DROP 并重建 `uac` schema，只用于本机或空库。运行时包里，表结构只打进 EADAF 安装包。~~已有库按升级包导入表结构或数据补丁。~~ 升级包、补丁包暂时只有代码。已运行实例的配置与业务数据走第 6 节。

### 7.2 端口

本地开发默认 API `29526`、管理端 `29527`，监听 `0.0.0.0`。修改本地端口时同时改 `backend/.env.*` 与 `frontend/config/env.ts`。

部署服务器上的安装包只改宿主机映射和 `EADAF_PUBLIC_URL`。容器内端口保持 9526 / 9527，nginx 把 `/api` 反代到 `eadaf-api:9526`。前端生产构建使用相对路径 `/api/v1`。

### 7.3 配置文件

后端以 `.env.development` / `.env.production` 为准，不读 `config.json`。

### 7.4 构建前端前先构建 AI Base

本仓库通过 workspace 引用 `@eadaf/ai-base`，没有直接使用 npm （支持直接使用npm 包， 需要你自己修改配置）。修改 `AIBase_with_example/package/ai-base` 后先在该目录 `pnpm build`，再构建前端。前端也可执行 `pnpm refresh:ai-base` 刷新依赖。

### 7.5 业务数据物化

目标 Schema 或库不存在时，前端会提示确认，然后自动创建（PostgreSQL / MongoDB）。

## 8. 相关文档

1. [docs/pack-and-deploy.md](./docs/pack-and-deploy.md) — 运行时平台包 / 应用包的打包与导入
2. [docs/data-transfer.md](./docs/data-transfer.md) — 系统设置中的平台 / 应用数据包
3. [docs/dev-server-deploy.md](./docs/dev-server-deploy.md) — 服务器 DEV 部署
4. [backend/README.md](./backend/README.md) — API 服务
5. [frontend/README.md](./frontend/README.md) — 管理端前端

