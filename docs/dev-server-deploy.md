# 服务器 DEV 部署

面向一台全新的 Linux 云主机（国内网络），从零把 EADAF 跑起来：工作目录、克隆仓库、Node / pnpm / Docker、依赖容器、初始化数据库、pm2 守护。

默认路径：`/var/www/UAC2`。下文以用户 `admin` 为例，请按本机用户替换。

> **注意**：`pnpm init-db` 会 `DROP` 并重建 `uac` schema，只用于开发机 / 首次安装，不要对有数据的库执行。
>
> 本文是在服务器上用仓库源码跑开发环境。发给客户的运行时包里，表结构只在 EADAF 安装包；升级包和补丁包只有程序。~~数据包补丁~~ 已暂时停用。已运行实例的配置与业务数据用管理端「系统设置」的 EADAF / 应用数据包，见 [data-transfer.md](./data-transfer.md)。

---

## 1. 创建工作目录

```bash
sudo mkdir -p /var/www
sudo chown -R $USER:www-data /var/www
sudo chmod -R 755 /var/www
```

---

## 2. Clone EADAF

```bash
cd /var/www
git clone https://github.com/adisonshadow/UAC2
```

HTTPS 克隆或后续 `git pull` 失败时，见文末 [Git 改为 SSH](#8-git-访问异常改为-ssh)。

---

## 3. 安装必要工具

### 3.1 Node.js（用 nvm，不要用 apt）

**不要** `sudo apt install nodejs`，发行版仓库里的版本通常过低。backend 要求 Node **≥ 22.13**，推荐装 **24**。

官网说明：<https://nodejs.org/zh-cn/download>

国内经常拉不下 `https://raw.githubusercontent.com` 上的 nvm 安装脚本，改用代理：

```bash
curl -o- https://githubproxy.cc/https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

**如果还不行，看下面的下面（git clone官方）**

装完后先加载 nvm（不必重开 SSH）：

```bash
# 代替重启 shell
\. "$HOME/.nvm/nvm.sh"

# 下载并安装 Node.js
nvm install 24

node -v
# 应类似 v24.x.x

npm -v
# 应类似 11.x.x
```

把下面两行写进 `~/.bashrc`，以后登录自动生效：

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

#### Git clone 官网 方式

安装nvm
```bash
# 切换到家目录操作
cd ~
# 从gitee镜像拉nvm仓库
git clone https://gitee.com/mirrors/nvm.git .nvm
cd .nvm
# 切到 v0.40.3 版本（和你刚才想用的版本一致）
git checkout v0.40.3
```

环境
```bash
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.bashrc
echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> ~/.bashrc
echo '[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"' >> ~/.bashrc
source ~/.bashrc
nvm --version

```
安装node
```bash
# 列出可安装版本
nvm list-remote

# 选一个LTS，例如22
nvm install 22

# 如果怕麻烦，建议直接安装编译好的版本
nvm install 22 --no-compile

# 安装完自动激活，验证
node -v
which node
```


### 3.2 pnpm

```bash
# 方案 1：curl（推荐）
curl -fsSL https://get.pnpm.io/install.sh | sh -

# 没有 curl 时用 wget
wget -qO- https://get.pnpm.io/install.sh | sh -

source "$HOME/.bashrc"
pnpm -v
```

### 3.3 Docker

国内主机可用阿里云镜像安装：

```bash
curl -fsSL get.docker.com -o get-docker.sh
sudo sh get-docker.sh --mirror Aliyun

sudo systemctl enable docker
sudo systemctl start docker

# 把当前用户加入 docker 组，之后不必每次 sudo docker
sudo usermod -aG docker $USER
```

加入 docker 组后 **必须重新 SSH 登录**，权限才生效。重新登录前若要立刻跑 compose，可暂时用 `sudo docker ...`。

检查：

```bash
docker version
docker compose version
```

---

## 4. 配置 Docker 镜像加速

必须在 Docker 安装完成后再改 `daemon.json`。

### 有阿里云账号（推荐）

控制台生成专属加速地址：<https://cr.console.aliyun.com/cn-shanghai/instances/mirrors>

把控制台给出的地址填进 `registry-mirrors`（下面示例需换成你自己的）：

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": ["https://nwhril78.mirror.aliyuncs.com"]
}
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker
```

### 没有阿里云 / 华为云账号

```bash
sudo tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": [
    "https://docker.xuanyuan.me",
    "https://docker.1ms.run",
    "https://docker.m.daocloud.io"
  ]
}
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker
```

拉镜像出现 `dial tcp xxx:443: i/o timeout` 时，就是加速器不可用，换一组 mirrors 再 `restart docker`。

---

## 5. 启动依赖容器

`docker-compose_with_MySQL.yml` 会拉起：

| 容器 | 镜像 | 宿主机端口 |
|------|------|------------|
| `EADAF-dev-postgres` | postgres:16-alpine | `25432` |
| `EADAF-dev-redis` | redis:7-alpine | `26379` |
| `EADAF-dev-mysql` | mysql:8.0 | `23306`（BizData 可选） |
| `EADAF-dev-minio` | pgsty/minio 社区版 | `9000`（API）、`9001`（控制台），数据卷 `EADAF_minio_data` |

账号口令与 `backend/.env.example` 一致（Postgres：`my_name` / `123456` / `eadaf_db`）。

```bash
cd /var/www/UAC2/backend

ls docker-compose_with_MySQL.yml

# 重新登录 docker 组生效后可去掉 sudo
sudo docker compose -f docker-compose_with_MySQL.yml up -d

docker ps

# 看日志，确认 healthy 后 Ctrl+C 退出跟随
docker compose -f docker-compose_with_MySQL.yml logs -f
```

---

## 6. 配置并初始化 EADAF

```bash
cd /var/www/UAC2/backend

cp .env.example .env.development
cp .env.example .env.production
```

按机器实际情况改 `.env.development`（至少核对 Postgres / Redis 端口）。默认 `API_HOST=0.0.0.0`、`CORS_ORIGIN=*`，用局域网 IP 或公网 IP 访问即可，不必再手写 Origin。安全组 / 防火墙需放行 `29526`、`29527`。

安装 `psql`（`pnpm init-db` 依赖它）：

```bash
sudo apt update
sudo apt install -y postgresql-client
```

在 **仓库根目录** 安装依赖（pnpm workspace，不要只在 backend 里装）：

```bash
cd /var/www/UAC2
pnpm install
```

### 6.1 编译 `@eadaf/ai-base`（必做）

`package/ai-base` 的 `dist/` **不进 Git**（被 `app_example/.gitignore` 忽略）。`pnpm install` 只链上 workspace 包，**不会**自动产出 `dist`。不编译的话，前端依赖 `@eadaf/ai-base` 的入口（`main` / `exports` 指向 `./dist/...`）会缺失，后续 `frontend build` / 预览 / AI 侧栏都容易挂。

```bash
cd /var/www/UAC2/package/ai-base
pnpm run build
```

校验：

```bash
ls dist/index.js dist/index.d.ts dist/style.css
```

日后若只更新了 ai-base 源码、前端行为却对不上，也可在 frontend 目录执行 `pnpm refresh:ai-base`（清缓存 → 再 build → 再 `pnpm install`）。

初始化数据库并**短时**试跑后端（确认能起来就立刻停，不要挂着）：

```bash
cd /var/www/UAC2/backend
pnpm init-db
pnpm dev
```

能正常起来后 **`Ctrl+C` 退出**。检查：

- 健康检查：`curl -s http://localhost:29526/api/v1/health`
- Swagger：<http://localhost:29526/swagger>

默认超管由 `backend/scripts/superadmin.sql` 写入，**初始化完成后尽快改密**。

可选：

```bash
pnpm init-db-with-mock          # 另含 Mock 用户/部门与销售示例实体
pnpm init-db-with-aibase-seed   # 另含 Demo 全量 AI 种子（会 TRUNCATE Skill/Tool）
```

---

## 7. 用 pm2 托管

仓库前后端都带了 pm2（workspace 依赖）。也可以再装一份全局 CLI，方便任意目录执行 `pm2 list`：

```bash
npm install pm2 -g
```

### 低配机器禁止 `pnpm dev` / `pnpm pm2dev`

`pnpm dev` 和 `pnpm pm2dev` 都是**开发热重载**：Vite 未打包直出源码、API 开 watch。和 Docker 里的 Postgres + Redis + MySQL 叠在一起，粗算常驻内存：

| 进程 | 大约占用 |
|------|----------|
| Vite 开发服（antd 管理端） | 600–1200MB（编译时 CPU 打满） |
| API（nodemon / pm2 watch） | 250–400MB（pm2 重启上限 600MB） |
| Postgres + Redis + MySQL | 600MB–1GB |
| 系统 + Docker 开销 | 300–500MB |
| **合计** | **约 2.5–4GB，2 核会卡死或 OOM** |

因此：

- **内存 ≤ 4GB，或 2 核及以下**（含突发 / 共享 / 经济型）：**千万不要**长期跑 `pnpm dev` 或 `pnpm pm2dev`
- 热重载开发建议 **4 核 8GB 及以上**
- 低配云主机用下面的 **`pnpm pm2prod`**（先 build 前端，再 preview 静态资源，内存大约只要 1.5–2.5GB）

低配推荐启动方式（**务必先有 ai-base 的 `dist`**，见 [§6.1](#61-编译-eadafai-base必做)）：

```bash
cd /var/www/UAC2
pnpm --filter ./package/ai-base build
# 或：cd package/ai-base && pnpm run build

pnpm --filter ./frontend build
pnpm pm2prod
```

高配开发机才用（同样建议先编译过一次 ai-base；Vite 虽有源码 alias，但 workspace 包入口仍依赖 `dist`）：

```bash
cd /var/www/UAC2
pnpm --filter ./package/ai-base build
pnpm pm2dev
```

对应进程：

| 命令 | 进程名 | 说明 |
|------|--------|------|
| `pnpm pm2dev` | `uac-api-dev` + `eadaf-web-dev` | 仅高配开发机：API watch 热重启；前端 Vite `--host`（29527）；依赖已编译的 `@eadaf/ai-base` |
| `pnpm pm2prod` | `uac-api` + `eadaf-web` | 低配 / 长期托管：API 读 `.env.production`；需先编译 ai-base，再 `pnpm --filter ./frontend build`，再 `vite preview` |

```bash
pm2 list
pm2 logs uac-api --lines 200      # 低配 pm2prod
# pm2 logs uac-api-dev --lines 200  # 仅高配 pm2dev
pm2 save
pm2 startup    # 按提示把开机自启命令复制执行
```

访问：

- 管理端：`http://<服务器IP>:29527`
- API：`http://<服务器IP>:29526`

安全组 / 防火墙需放行 `29526`、`29527`（以及你要对外的 DB 端口，开发机通常不要把 `25432` 暴露到公网）。

---

## 8. Git 访问异常：改为 SSH

HTTPS 拉仓库或 `git pull` 不稳定时，改用 SSH。

```bash
# 还没有密钥时生成
ssh-keygen -t ed25519 -C "your-email@example.com"

cat ~/.ssh/id_ed25519.pub
```

把公钥加到 <https://github.com/settings/keys>。

```bash
ssh -T git@github.com
# Hi <github-user>! You've successfully authenticated, but GitHub does not provide shell access.

cd /var/www/UAC2
git remote set-url origin git@github.com:adisonshadow/UAC2.git
git remote -v
```

---

## 常见问题

| 现象 | 处理 |
|------|------|
| `get.docker.com` / nvm 脚本超时 | 用文档里的国内镜像或 `githubproxy.cc` |
| `docker compose up` 报 `443 i/o timeout` | 检查 `/etc/docker/daemon.json` 加速器，重启 docker |
| `permission denied` 操作 docker.sock | 重新 SSH 登录，使 docker 组生效 |
| `pnpm init-db` 连接失败 | `docker ps` 看 Postgres 是否 `healthy`；核对 `.env.development` 端口 `25432` |
| 前端能开、接口 CORS 失败 | 确认 `.env.*` 里 `CORS_ORIGIN=*`（或包含当前页面 Origin），并已重启 API |
| `pm2dev` 找不到命令 | 先在仓库根目录执行过 `pnpm install`；全局 CLI 再 `npm i -g pm2` |
| 前端报找不到 `@eadaf/ai-base` / `dist/index.js` | `dist` 未进仓库；按 [§6.1](#61-编译-eadafai-base必做) 执行 `pnpm run build`，或 `pnpm --filter ./package/ai-base build` |
| AI Chat 行为与源码不一致 | 在 frontend 执行 `pnpm refresh:ai-base` 后重启前端进程 |
