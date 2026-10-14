# 打包与部署

开发机打出压缩包，到 Linux 服务器上再安装。平台包不含业务应用。只支持 CentOS、Ubuntu、Debian，以及 amd64 / arm64。

服务器上用 Node 直接跑开发环境见 [dev-server-deploy.md](./dev-server-deploy.md)。

> 本节说的是 **运行时安装包 / 升级包 / 补丁包**（`packages/EADAF`、`packages/APP` 下的 `.tar.gz`）。  
> 管理端导航「应用部署」里按实例迁配置与业务数据的 ZIP，见 [data-transfer.md](./data-transfer.md)，二者不要混用。
>
> **数据包补丁已暂时停用。** 升级包、补丁包只含程序（镜像 / 前端 dist），不带表结构，也不带业务数据。表结构只在 **EADAF 安装包** 的 init-db SQL 里。已运行实例之间同步配置与业务数据，用「应用部署」里的 EADAF / 应用数据包导出、导入。

---

## 0. 两种入口：命令行 与 管理端「应用部署」

| 入口 | 位置 | 说明 |
|------|------|------|
| 命令行 | 仓库根 `pnpm pack:eadaf` / `pnpm pack:app` | 交互式问答（网络、运行方式、种类、端口、版本、输出目录），见第 2、3 节 |
| 管理端 | 导航 **应用部署 → 发布平台 / 发布应用** | 表单填同样的参数，后端在 **DEV 模式** 开发机上执行同一套脚本，页面实时输出日志，结束后给出产物（`.tar.gz`）的目标目录与完整路径 |

「应用部署」菜单项：

- **应用数据导出/导入**、**EADAF数据导出/导入**：实例间迁移数据，见 [data-transfer.md](./data-transfer.md)。这两项已从「系统设置」迁到这里，设置页不再展示。
- **发布平台**（`pnpm pack:eadaf`）、**发布应用**（`pnpm pack:app`）：**仅 DEV 模式可用**（后端 `NODE_ENV=development`，即 `pnpm dev` / `pnpm pm2dev` 起的开发栈）。非 DEV 模式页面会明确提示并禁用按钮，后端接口也会返回 403。

两个发布页的约定：

- **目标目录默认按项目地址拼出**：平台 `<项目目录>/packages/EADAF`、应用 `<项目目录>/packages/APP`（后端用仓库根拼好回给页面，页面上的示例也只显示 `<项目目录>/...` 这种相对写法）。
- **发布应用分两步**：先「选择应用 + 填项目目录」并点校验（目录下必须有 `eadaf.app.yaml`），校验通过后按「应用 → 项目目录」记进**浏览器本地缓存**，下次选同一个应用会自动回填并重新校验；再点「下一步」才出现其余打包配置。
- **打包历史存在浏览器**（`localStorage`）：任务结束后自动记一条（版本、种类配置、状态、目标目录、产物文件名与大小），可直接复制目标目录去取包；换浏览器或清缓存后，服务端若还留着最近一次任务，会补记进历史。历史上限 50 条，可单条移除或整体清空。

### 0.1 默认版本号从哪来

| 目标 | 默认版本来源 | 回退顺序 |
|------|--------------|----------|
| 平台包（`pnpm pack:eadaf`） | 仓库根 `package.json` 的 `version` | `--version` 显式指定 → 根 `package.json` → `0.0.0` |
| 应用包（`pnpm pack:app`） | **应用仓库** `package.json` 的 `version` | `--version` 显式指定 → 应用 `package.json` → `eadaf.app.yaml` 的 `version` → `0.0.0` |

摘要区会打印 `版本: x.y.z（来源: package.json（仓库根）/ package.json（应用仓库根）/ eadaf.app.yaml（回退）/ 命令行 --version）`，便于核对包名里的版本。

### 0.2 Windows 开发机能否打 Linux 包

可以，前提是 **Git for Windows（Git Bash）+ Docker Desktop**：

- 镜像由 Docker Desktop 的 Linux 引擎构建/导出（`docker build --platform linux/amd64`、`docker save`），产物就是目标机 `docker load` 能用的 Linux 镜像 tar；
- 打包脚本由 Git Bash 执行，包内 `.sh` 保留可执行位（`0755`），脚本换行已在打包时统一为 LF；
- 打包需要 `docker`、`git`、`tar`、`curl`、`pnpm`、`node`；`rsync` 可选——Git for Windows 不自带 rsync，fpcu2 预设的构建上下文复制会自动回退到 Node 复制器（`scripts/deploy/copy-tree.cjs`，排除规则与 rsync 版一致）；
- 网络与磁盘开销：安装包会导出 postgres / mysql / minio / nginx 等镜像（数 GB），并下载静态 Docker（离线包），Windows 上同样可行但更慢；
- 仍需注意：`tar`/`bash` 走的是 Git Bash 的实现，建议打包后按第 4 节在目标 Linux 上先 `tar -tzf` 检查一次包结构。

---

## 1. 网络与运行方式

打包时连续问两件事，程序镜像只构建一次，并且始终打进包里。

1. **网络**：离线还是在线。离线的 Compose 包带静态 Docker。在线的 Compose 包在目标机用 yum/apt 安装 Docker，已经装好则跳过。
2. **运行方式**：Compose，还是 K8s Pod。K8s 需要目标机上已经有集群。镜像用 `k3s ctr`、`ctr -n k8s.io` 或 `docker load` 导入，不从公网拉取。清单是 Deployment / Service / PVC，`hostPort`，副本数为 1，不含 Helm、不含 Ingress。

因此有四种包：离线 + Compose、在线 + Compose、离线 + K8s、在线 + K8s。在线和离线的 K8s 包里装的文件相同，差别写在 `.deploy-mode` 里。

应用包不分这两种选择。现场 `apply.sh` 读取平台目录里的 `.deploy-mode`：Compose 走 `docker compose`，K8s 走 `kubectl apply`。

导出在开发机完成，得到 `.tar.gz`。导入在目标 Linux 上完成：先导入 EADAF 包，平台起来之后再导入应用包。

---

## 2. 导出 EADAF 包

在本仓库根目录执行。交互顺序：网络 → 运行方式 → 默认发行版 → CPU 架构 → 安装 / 升级 / 补丁 →（仅安装包）前后端端口 → 版本 → 输出目录。

对应管理端「应用部署 → 发布平台」（仅 DEV 模式，见第 0 节）。

```bash
pnpm pack:eadaf
# 非交互示例
bash scripts/deploy/pack-eadaf.sh --network offline --runtime compose --os centos --arch amd64 --kind install --non-interactive --yes
```

默认写到 `packages/EADAF/`。文件名：

| 种类 | 文件名 |
|------|--------|
| 安装、升级 | `eadaf-<网络>-<运行方式>-<种类>-<架构>-v<版本>-<日期>-<时分>.tar.gz` |
| 补丁 | `eadaf-<网络>-<运行方式>-patch-<种类>-<架构>-v<版本>-<日期>-<时分>.tar.gz` |

补丁种类是 `web`（前端）、`api`（后端），多选用 `web+api`。~~`bizdata`（数据）；只有数据补丁时文件名不带架构。~~ 数据补丁已暂时停用。

| 种类 | 包里有什么 |
|------|------------|
| 安装 | 运行时引导 + 全部程序镜像 + 前端 dist + 初始化 SQL。端口只写入宿主机映射，容器内仍是 API `9526`、Web `9527`。表结构只在这一类包里 |
| 升级 | 程序镜像 + 前端 dist。~~尚未执行的表结构 SQL~~ 升级包暂时只有代码，不带表结构、不带数据 |
| 补丁 | 只含所选程序种类（`web` / `api`）。~~数据补丁只含系统应用 `EADAF` 的 BizData 模型 upsert~~ 已暂时停用 |

~~数据补丁从开发库读取 `EADAF` 的 `bizdata_scope_codes`。没有 scope、或 scope 下没有实体时，导出失败，不会打出空包或整库。~~ 配置与业务数据改走管理端「应用部署」的 EADAF / 应用数据包，见 [data-transfer.md](./data-transfer.md)。

兼容入口（只出离线包）：

```bash
pnpm offline:deploy                              # 离线安装包，默认 centos + amd64
OFFLINE_OS=ubuntu OFFLINE_ARCH=arm64 pnpm offline:deploy
pnpm offline:patch eadaf-api                     # 后端补丁
pnpm offline:patch eadaf-web                     # 前端补丁
pnpm offline:patch all                           # web + api
```

---

## 3. 导出应用包

在本仓库根目录执行，源码指向应用仓库。交互顺序：应用目录 → CPU 架构（与 EADAF 包一致）→ 安装 / 升级 / 补丁 →（仅安装包）应用前后端端口 → 版本 → 输出目录。

对应管理端「应用部署 → 发布应用」（仅 DEV 模式，见第 0 节）：页面上填应用目录、点「校验」读回 `eadaf.app.yaml` 与应用 `package.json` 版本后再打包。

```bash
pnpm pack:app
```

应用仓库根目录需要 `eadaf.app.yaml`。FPCU2 使用 `preset: fpcu2`，示例见 `scripts/deploy/app-presets/fpcu2/eadaf.app.yaml.example`。

默认写到 `packages/APP/`。文件名不含网络和运行方式：

| 种类 | 文件名 |
|------|--------|
| 安装、升级 | `<应用名>-<种类>-<架构>-v<版本>-<日期>-<时分>.tar.gz` |
| 补丁 | `<应用名>-patch-<种类>-<架构>-v<版本>-<日期>-<时分>.tar.gz` |

~~应用数据补丁写入的是该应用在 EADAF 里的 BizData，不是应用自带的另一套库。~~ 应用数据补丁已暂时停用。该应用的配置、模型与业务数据用「应用部署 → 应用数据导出/导入」。

---

## 4. 导入 EADAF 包

把对应 `.tar.gz` 拷到目标机后解压。安装包解压出来的目录名是 `eadaf-runtime`。升级包和补丁包的目录名与压缩包文件名相同，不要直接盖到正在运行的目录上。

### 4.1 导入安装包

Compose（离线或在线）：

```bash
tar -zxf eadaf-offline-compose-install-amd64-v1.2.0-20261007-1430.tar.gz
cd eadaf-runtime
# 编辑 .env：PUBLIC_HOST、JWT_SECRET、ENCRYPTION_KEY、数据库口令
chmod +x start.sh up.sh status.sh ctl.sh init-db.sh
./start.sh
```

在线 Compose 会走 `install-docker.sh`（已有 Docker 则跳过）。离线 Compose 安装包内的静态 Docker。

K8s（在线或离线）在同一目录执行 `./k8s/install.sh`。集群需要已经存在。

非交互示例：`./start.sh --os ubuntu --arch amd64 --action up`。

`./up.sh` 会加载镜像、启动 Postgres / Redis / MySQL、初始化库、启动 API 与 Web，最后用 `./status.sh` 判断是否成功。库里已有表时不会 DROP。

```bash
./ctl.sh reinstall eadaf-web
./ctl.sh logs eadaf-api --tail 100
./ctl.sh down          # 停栈，保留数据卷
```

### 4.2 导入升级包或补丁包

`DEPLOY_ROOT` 指向已经在跑的平台目录。升级保留 `.env` 和数据卷，不重装 Docker / 集群，也不改表结构和业务数据。补丁只换前端 dist 或 API 镜像。

```bash
tar -zxf eadaf-offline-compose-upgrade-amd64-v1.2.0-20261007-1430.tar.gz
cd eadaf-offline-compose-upgrade-amd64-v1.2.0-20261007-1430
DEPLOY_ROOT=/path/to/eadaf-runtime ./apply.sh
```

补丁包同样是解压后执行 `./apply.sh`。~~升级用 `uac.schema_migrations` 记账；旧库第一次升级只把 `schema-baseline.txt` 里已发布过的 SQL 记为已执行，不重放。~~ 升级暂时不跑表结构迁移。表结构只在 EADAF 安装包的 init-db 里。

若现场还留着旧整包里的 FPCU 容器，这次升级不会删除它们。之后用应用包接管。

---

## 5. 导入应用包

先完成第 4 节，确认 EADAF 已经启动，再导入应用包。`apply.sh` 读取平台目录里的 `.deploy-mode`：Compose 走 `docker compose`，K8s 走 `kubectl apply`。

```bash
tar -zxf fpcu2-install-amd64-v0.1.3-20261007-1430.tar.gz
cd fpcu2-install-amd64-v0.1.3-20261007-1430
DEPLOY_ROOT=/path/to/eadaf-runtime ./apply.sh
```

应用的升级包、补丁包用同一条命令。应用包不负责安装 Docker 或创建集群。

**对外地址跟随浏览器 Host**：SSO 回调、FPCU 二次跳转、前端拼 EADAF 地址都用「当前访问的 hostname + 端口」，不把客户 IP/域名写进包。换服务器或改域名一般只需 DNS/访问方式变化，不必改 `.env`。`.env` 里主要是容器内互调（如 `EADAF_API_BASE_URL=http://eadaf-api:9526`）和端口（`FPCU2_WEB_HOST_PORT` / `FPCU2_API_HOST_PORT`）。管理端注册应用时默认勾选「自动跟随本系统域名/IP」，`redirect_uri` 形如 `:13303/auth/callback`。

### 5.1 应用包不含数据结构与数据

应用包（安装 / 升级 / 补丁）**只含程序**：镜像与前端 `dist`。包内**不跑**任何建模型、物化表或写业务数据的脚本，`apply.sh` 只做两件事——注册应用到 EADAF（`application.sql.template`，写 `uac.applications` 一行）与拉起容器。

**模型、表结构、数据 API 与业务数据一律走管理端「应用部署 → 应用数据导出/导入」**，见 [data-transfer.md](./data-transfer.md)：

| 内容 | 走哪里 |
|------|--------|
| 实体 / 字段 / 枚举 / 关系 / scope 文档 | 应用导出包的 `entities` 节 |
| 数据 API 服务与 operation | 应用导出包的 `apiServices` 节 |
| 物化表（`bizdata_mat.…`） | 导入链的 `materialization` 步骤自动完成 |
| 业务数据 | 应用导出包的 `entityData` 节 |
| 存储对象与文件 | 应用导出包的 `storageBuckets` / `storageObjects` + `files/` |

原因：包内 seed 会绕过平台导入的事务与记录（导入结果里有逐节计数与告警），且与「数据结构只在 EADAF 安装包的 init-db SQL、运行期数据走应用导入」这条约定冲突。此前 `07dc330` 曾让应用包自动跑 FPCU seed（`seed-fpcu-bizdata.mjs` / `materialize-fpcu.mjs` / `seed-fpcu-api-services.mjs`），已移除。

> FPCU2 仓库里那几个 seed 脚本仍然保留，作为**开发/演示**用途手工执行（`cd backend && node --env-file=.env.development scripts/seed-fpcu-*.mjs`），只是不再由应用包自动触发。

### 5.2 排障：登录成功后却跳到 localhost

链路是两跳，**两跳都要查**；成因都是「地址按请求 Host 推导，而那一跳的 Host 是 localhost」。

**第一跳：EADAF → BFF（回调地址里的 localhost）**

若应用注册用的是「跟随本系统域名/IP」（`redirect_uri` 存 `:13303/auth/callback` 这类后缀），EADAF 是按**登录请求**的 Host 拼完整地址的——不是按浏览器地址栏，也不是按回调请求。所以只要登录请求的 Host 是 `localhost`，或中途有反向代理/开发代理改写了 Host，回调就会变成 localhost。

```bash
# 两种 Host 的返回应当一致；不一致说明仍按 Host 推导，去找是谁改了 Host
curl -s -H 'Host: localhost:9526'    http://127.0.0.1:9526/api/v1/applications-sso/<application_id> | grep -o '"redirect_uri":"[^"]*"'
curl -s -H 'Host: 192.168.1.10:9526' http://127.0.0.1:9526/api/v1/applications-sso/<application_id> | grep -o '"redirect_uri":"[^"]*"'
```

**第二跳：BFF → 管理端（302 目标里的 localhost）**

BFF 的 `/auth/callback` 默认按**那一跳请求的 Host** 拼管理端地址。回调若是 EADAF 服务端发起的（Host 可能是 localhost），浏览器就会被转到 `http://localhost:<FPCU2_WEB_HOST_PORT>/auth/callback`。对策是在平台 `.env` 显式固定管理端地址（两个 `_FORCE` 必须为 `1` 才生效）：

```bash
FPCU2_FRONTEND_URL=http://192.168.1.10:13308
FRONTEND_URL_FORCE=1
FPCU2_PUBLIC_API_BASE_URL=http://192.168.1.10:13303
FPCU2_PUBLIC_API_BASE_URL_FORCE=1
```

> 注意：`pack-app.sh` 会主动删掉 `.env` 里的 `SSO_CALLBACK_URL` / `FPCU2_PUBLIC_URL` / `FPCU2_PUBLIC_API_BASE_URL` 等绝对 URL（见脚本里「清掉易误导的绝对对外 URL」那段），目的是避免旧包残留的 localhost 盖过 Host 跟随。真要固定成绝对地址，就得在应用安装**之后**再写回 `.env` 并重启 BFF。
