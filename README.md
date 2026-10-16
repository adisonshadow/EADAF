# EADAF

企业智能数据应用底座（Enterprise AI-Driven Data Application Foundation）是一套面向企业应用的数据智能应用平台，由统一身份权限、三方应用接入、业务数据建模、API 服务与 AI 能力编排组成。本仓库是 **pnpm monorepo**。

## 1. 仓库组成


| 目录                          | 说明                                      |
| --------------------------- | --------------------------------------- |
| `backend`                   | Koa + Sequelize REST API                |
| `frontend`                  | React + Vite 管理端                        |
| `app_example`               | 业务应用示例：雨伞品牌独立站销售管理（前端极简，账号/数据/AI 全部复用平台） |
| `package/ai-base`           | `@eadaf/ai-base` 源码包（AI 助手前端组件，workspace 引用） |
| `eadaf-runtime`            | 平台运行时骨架（在线 / 离线 × Compose / K8s，不含业务应用） |
| `scripts/deploy`            | 开发机打包脚本（平台包、应用包）                        |
| `deploy-artifacts/EADAF`、`deploy-artifacts/APP` | 打包产物目录（不入库）                             |




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

后端读取 `backend/.env.development`（或 `backend/.env.development.local`，后者优先，见 `backend/src/config/index.js`）。仓库里只有 `.env.example`，第一次要自己复制一份：

```bash
cd backend
cp .env.example .env.development              # 默认值即可连本机 Docker 起的 PostgreSQL / Redis
# 或只做本地覆盖，保持 .env.development 干净：
cp .env.example .env.development.local        # 按需修改连接信息
pnpm init-db                                  # 结构 + 超管 + EADAF 全局/专用 Skill/Tool
# pnpm init-db-with-mock                      # 另含 Mock 用户/部门与销售示例实体
# pnpm init-db-with-aibase-seed               # 另含 Demo 全量 AI 种子（会 TRUNCATE Skill/Tool）
```

`pnpm dev` 在后端启动前也会检查这两个文件；缺失时只打印告警（用内置默认值继续），不会阻断启动。

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

仓库根目录一条命令会先等 API 监听成功，再起前端（**Windows / macOS / Linux 同一条命令**）：

```bash
pnpm dev          # API 29526 + 管理端 29527
pnpm killdev      # 停掉本次 dev 拉起的进程（会先列进程并要一次确认）
pnpm killdev:yes  # 同上，跳过确认（CI / 脚本里用）
```

也可以分两个终端：

```bash
cd backend && pnpm dev     # API，默认 29526，nodemon 热重载
cd frontend && pnpm dev    # 管理端，默认 29527
```

文件上传、预览和裁剪走本机 MinIO。在 `backend` 目录用开发 Compose 拉起（数据卷 `EADAF_minio_data`，账号与 `backend/.env.example` 一致）：

```bash
cd backend
docker compose -f docker-compose.yml up -d          # PostgreSQL + Redis + MinIO
docker compose -f docker-compose.yml up -d minio    # 只要 MinIO
# 需要 MySQL 时改用：docker compose -f docker-compose_with_MySQL.yml up -d minio
```

- 管理端：[http://localhost:29527](http://localhost:29527)
- API 文档：[http://localhost:29526/swagger](http://localhost:29526/swagger)
- 健康检查：`curl http://localhost:29526/api/v1/health`



### 3.5.1 启动依赖自检（Docker 忘了起时不再刷屏）

后端 `pnpm dev` 会先并行探一次 PostgreSQL / MinIO / Redis 的端口，把结论打在一张表里：

```
────────────── 启动依赖自检 ──────────────
  ✗ PostgreSQL  localhost:25432   ECONNREFUSED   必需
  ✗ MinIO       127.0.0.1:9000    ECONNREFUSED   必需
  ✗ Redis       localhost:26379   ECONNREFUSED   可选（降级）
  ⚠️  2 项必需依赖不可用（PostgreSQL、MinIO）：服务仍会启动，但数据库不可用，几乎所有接口都会失败；上传 / 预览 / 导出不可用。
  🔧 修复：cd backend && docker compose up -d   （本机 Docker 似乎没启动）
```

- 必需依赖是 PostgreSQL 与 MinIO，不可用时服务仍会启动（便于 nodemon / 前端继续连着），但相关接口会失败；Redis 不可用自动降级为「仅 PostgreSQL」，并每 30s 自动重试，起好容器后无需重启即可恢复。
- 某个依赖判为不可用后，控制台只说一次；之后的同类报错只写 `logs/error-*.log`（完整堆栈和出现次数都在），不会每几百毫秒刷一条。
- 依赖已恢复时日志里会补一条 `依赖已恢复：...`。
- 探活实现见 [backend/src/utils/dependencyDiagnostics.js](./backend/src/utils/dependencyDiagnostics.js)，判定逻辑有单测：`cd backend && node --test src/utils/dependencyDiagnostics.test.js`。



### 3.5.2 跨平台运行方式（Windows 不用装 WSL 也能 `pnpm dev`）

`pnpm dev` 的入口是 **Node**（[scripts/dev.cjs](./scripts/dev.cjs)），不是 shell 脚本，所以 cmd / PowerShell / Git Bash / WSL 里表现一致。它会先探环境、再选 runner：

```bash
pnpm dev:check    # 只打印判别矩阵（平台、可用 shell、换行符、.env、端口），不启动服务
```

| 平台 | runner | 说明 |
| --- | --- | --- |
| Windows | `native` | 纯 Node 引擎。不依赖 bash / lsof / nc / curl / netstat |
| macOS / Linux | `native` | 同一份引擎，行为与原 `dev.sh` 一致 |
| Windows（需要时） | `git-bash` / `wsl` | `DEV_RUNNER=git-bash` 走 `scripts/dev.sh`；`DEV_RUNNER=wsl` 走 `wsl.exe` |

实现拆成三层，互不重复：

| 文件 | 作用 |
| --- | --- |
| [scripts/lib/dev-core.cjs](./scripts/lib/dev-core.cjs) | 跨平台引擎：进程树、端口/健康检查、`API Server started` 日志判定、Ctrl+C 清理 |
| [scripts/dev.cjs](./scripts/dev.cjs) / [scripts/preview.cjs](./scripts/preview.cjs) | 环境判别 + runner 选择（`--check` 打印判别矩阵） |
| [scripts/dev.cmd](./scripts/dev.cmd) / [scripts/killdev.cmd](./scripts/killdev.cmd) | Windows 双击 / cmd 入口，只是转调上面的 Node 脚本 |

`pnpm killdev` 同样是 Node 实现（[scripts/killdev.cjs](./scripts/killdev.cjs)）：先找 dev 入口进程（`node scripts/dev.cjs`、`pnpm --filter ./backend dev`），再做**进程树闭包**，最后用 `taskkill /T /F` 结束。根进程判定是锚定匹配，不会误伤 IDE / 别的项目的 `node.exe`；改动用 `node scripts/test-killdev-matcher.cjs` 自测（29 项）。

### 3.5.3 编辑代码不会再把 dev 服务弄崩（Windows 原子写盘）

Windows 上如果 `scripts/dev.sh` 报这个错，是**换行符**问题而不是命令写错：

```
scripts/dev.sh: line 13: $'\r': command not found
: invalid option name14: set: pipefail
```

因为 `core.autocrlf=true` 会把 LF 检出成 CRLF，bash 把 `\r` 当成命令的一部分。仓库根的 [.gitattributes](./.gitattributes) 已把 `*.sh` 固定为 `eol=lf`；旧工作区刷新一次即可：

```powershell
git config core.autocrlf true
git ls-files '*.sh' | ForEach-Object { Remove-Item $_; git checkout -- $_ }
# 或整体重规范化（会改动索引）
git add --renormalize .
```

其它仍是 Unix-only 的脚本（`offline-deploy.sh`、`pack-*.sh`、`initdb.sh` 等）通过 [scripts/run-sh.cjs](./scripts/run-sh.cjs) 调用：有 Git Bash 就用 Git Bash；没有就明确报错并给出选项，**不会静默走 WSL 转发器**。需要走 WSL 时设 `ALLOW_WSL=1`。



### 3.5.3 编辑代码不会再把 dev 服务弄崩（Windows 原子写盘）

Windows 上「原子写盘」（编辑器保存、代码生成、AI 改代码）会先把内容写进
`.<文件名>.<pid>.<随机>.tmpdir/<文件名>.tmp`，再原子替换目标文件、删掉暂存目录。这段窗口里
`fs.watch` 会抛 `EBUSY`，chokidar 把它 emit 成 `error` 事件，而 Vite 没挂监听者 →
Node 直接以未捕获异常退出，`pnpm recursive run` 随之失败，`dev-core` 会把 backend 一起收掉
（现象就是「一改代码整个 dev 栈都没了」）。

[frontend/vite.config.ts](./frontend/vite.config.ts) 里已经两层兜住，**不要删**：

| 措施 | 作用 |
| --- | --- |
| `server.watch.ignored` 里的 `/\.tmpdir([\\/]\|$)/`、`/\.tmp$/` | 根本不监听暂存目录/临时文件 → 从源头消掉 EBUSY |
| 插件 `watchErrorGuard`（给 watcher 挂 `error` 监听） | 万一还有别的瞬时锁冲突，只打一条告警，绝不退出 |

排查同类问题时可以用 `usePolling: true` 彻底绕开 `fs.watch`（代价是 CPU 占用更高），但不建议长期开。



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
pnpm pack:eadaf    # 平台安装 / 升级 / 补丁 → deploy-artifacts/EADAF/
pnpm pack:app      # 业务应用包 → deploy-artifacts/APP/
```

上传的文件放在 **MinIO** 独立卷 `eadaf_minio_data`，不在 API 容器磁盘里。安装包和升级包带 MinIO 镜像；升级会先启动 MinIO，再重建 API。只打前端补丁不动 MinIO。已经写在旧容器磁盘里的文件不会自动搬进 MinIO。

完整说明（网络与运行方式、包内容、导入步骤）见 [docs/pack-and-deploy.md](./docs/pack-and-deploy.md)。服务器上用 Node 直接跑开发环境见 [docs/dev-server-deploy.md](./docs/dev-server-deploy.md)。

## 6. 数据包导出 / 导入（应用部署）

两套**已运行**的 EADAF 之间同步配置与业务数据，只用管理端。第 5 节的升级包、补丁包不含这些数据；安装包里的 init-db 只建表结构。


| 菜单项               | 文件名示例                           | 迁什么                               |
| ----------------- | ------------------------------- | --------------------------------- |
| **EADAF数据导出/导入** | `eadaf-platform-export-*.zip`   | 平台 Skill、AI 目录、数据标准、系统开关、UAC 权限码等 |
| **应用数据导出/导入**   | `eadaf-app-export-<应用编码>-*.zip` | 单个业务应用的配置、模型、API、可选行数据 / UAC / 文件 |


路径：管理端导航 → **应用部署** → 对应菜单项（这两项已从「系统设置」迁出，设置页不再展示）。内置应用 `EADAF` 不可走「应用数据导出/导入」（平台能力用平台菜单项）。导出可能含明文密钥，请妥善保管。

同一「应用部署」分组下的 **发布平台**（`pnpm pack:eadaf`）与 **发布应用**（`pnpm pack:app`）是第 5 节那两个打包脚本的 Web 控制台：**仅 DEV 模式可用**，表单填参数、实时看日志，结束后给出产物 `.tar.gz` 的目标目录与完整路径。默认版本分别取仓库根 / 应用仓库的 `package.json`。

选项、冲突策略与和运行时包的区别见 [docs/data-transfer.md](./docs/data-transfer.md)；控制台与 Windows 打包说明见 [docs/pack-and-deploy.md](./docs/pack-and-deploy.md)。

## 7. 注意事项



### 7.1 不要对已有数据的库执行 init-db

`pnpm init-db` 会 DROP 并重建 `uac` schema，只用于本机或空库。运行时包里，表结构只打进 EADAF 安装包。~~已有库按升级包导入表结构或数据补丁。~~ 升级包、补丁包暂时只有代码。已运行实例的配置与业务数据走第 6 节。

### 7.2 端口

本地开发默认 API `29526`、管理端 `29527`，监听 `0.0.0.0`。修改本地端口时同时改 `backend/.env.*` 与 `frontend/config/env.ts`。

部署服务器上的安装包只改宿主机映射和 `EADAF_PUBLIC_URL`。容器内端口保持 9526 / 9527，nginx 把 `/api` 反代到 `eadaf-api:9526`。前端生产构建使用相对路径 `/api/v1`。

### 7.3 配置文件

后端以 `.env.development` / `.env.production` 为准，不读 `config.json`。

### 7.4 构建前端前先构建 AI Base

本仓库通过 workspace 引用 `@eadaf/ai-base`，没有直接使用 npm （支持直接使用npm 包， 需要你自己修改配置）。修改 `package/ai-base` 后先在该目录 `pnpm build`，再构建前端。前端也可执行 `pnpm refresh:ai-base` 刷新依赖。

### 7.5 业务数据物化

目标 Schema 或库不存在时，前端会提示确认，然后自动创建（PostgreSQL / MongoDB）。

## 8. 相关文档

1. [docs/pack-and-deploy.md](./docs/pack-and-deploy.md) — 运行时平台包 / 应用包的打包与导入
2. [docs/data-transfer.md](./docs/data-transfer.md) — 系统设置中的平台 / 应用数据包
3. [docs/dev-server-deploy.md](./docs/dev-server-deploy.md) — 服务器 DEV 部署
4. [backend/README.md](./backend/README.md) — API 服务
5. [frontend/README.md](./frontend/README.md) — 管理端前端

