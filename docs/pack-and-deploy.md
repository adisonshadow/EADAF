# 打包与部署

开发机打出压缩包，到 Linux 服务器上再安装。平台包不含业务应用。只支持 CentOS、Ubuntu、Debian，以及 amd64 / arm64。

服务器上用 Node 直接跑开发环境见 [dev-server-deploy.md](./dev-server-deploy.md)。

> 本节说的是 **运行时安装包 / 升级包 / 补丁包**（`packages/EADAF`、`packages/APP` 下的 `.tar.gz`）。  
> 管理端「系统设置」里按实例迁配置与业务数据的 ZIP，见 [data-transfer.md](./data-transfer.md)，二者不要混用。
>
> **数据包补丁已暂时停用。** 升级包、补丁包只含程序（镜像 / 前端 dist），不带表结构，也不带业务数据。表结构只在 **EADAF 安装包** 的 init-db SQL 里。已运行实例之间同步配置与业务数据，用系统设置里的 EADAF / 应用数据包导出、导入。

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

~~数据补丁从开发库读取 `EADAF` 的 `bizdata_scope_codes`。没有 scope、或 scope 下没有实体时，导出失败，不会打出空包或整库。~~ 配置与业务数据改走管理端「系统设置」的 EADAF / 应用数据包，见 [data-transfer.md](./data-transfer.md)。

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

```bash
pnpm pack:app
```

应用仓库根目录需要 `eadaf.app.yaml`。FPCU2 使用 `preset: fpcu2`，示例见 `scripts/deploy/app-presets/fpcu2/eadaf.app.yaml.example`。

默认写到 `packages/APP/`。文件名不含网络和运行方式：

| 种类 | 文件名 |
|------|--------|
| 安装、升级 | `<应用名>-<种类>-<架构>-v<版本>-<日期>-<时分>.tar.gz` |
| 补丁 | `<应用名>-patch-<种类>-<架构>-v<版本>-<日期>-<时分>.tar.gz` |

~~应用数据补丁写入的是该应用在 EADAF 里的 BizData，不是应用自带的另一套库。~~ 应用数据补丁已暂时停用。该应用的配置、模型与业务数据用系统设置里的「应用导出/导入」。

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
