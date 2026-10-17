# EADAF Backend

Koa + Sequelize 实现的 EADAF REST API，提供身份权限、应用 SSO、业务数据与 AI 网关能力。

## 功能

- **认证与用户**：登录/登出、验证码、JWT、Refresh Token、用户 CRUD、状态与密码管理
- **组织与角色**：部门树、成员与组织多角色绑定、RBAC 角色与权限
- **权限资源**：菜单 / 按钮 / API 权限维护与角色授权
- **应用与 SSO**：三方应用注册、SSO 配置、应用侧 API 接入
- **业务数据**：实体模型、枚举、关系、物化预览/执行、数据库连接（PostgreSQL / MongoDB / Redis）
- **AI 管理**：Provider、Model、Scope、Tool、Skill、Chat 网关、Tool 调用、请求日志
- **其他**：企业文件存储（轻量 multipart ≤100MB + tus 超大文件断点续传）、健康检查、Swagger 文档

## 安装

### 环境

- Node.js >= 22.13（`package.json` 的 `engines` 是硬要求，启动自检会核对）
- PostgreSQL 14+
- Redis（可选，部分能力依赖）

### 步骤

```bash
# 1. 配置环境变量（数据库、端口、JWT、CORS 等）
cp .env.development .env.development.local   # 按需修改

# 2. 安装依赖
npm install

# 3. 初始化数据库（重建 POSTGRES_SCHEMA 指定的 schema，默认 eadaf）
pnpm init-db                                 # 结构 + 超管 + EADAF 全局/专用 Skill/Tool
pnpm init-db-with-mock                       # 另含 Mock 用户/部门与销售示例实体
pnpm init-db-with-aibase-seed                # 另含 Demo 全量 AI 种子（会 TRUNCATE Skill/Tool）

# 4. 启动（nodemon 热重载，默认端口 29526）
npm run dev
```

### 常用命令

```bash
npm run dev                 # 开发：nodemon 热重载，读 .env.development
npm run prod                # 生产：node 直启（无热重载），NODE_ENV=production，读 .env.production
npm start                   # 等价于 npm run prod（pm2 / PaaS 默认入口）
npm test                    # 单元 / 接口测试
npm run swagger             # 生成 swagger.json
pnpm export-eadaf-ai-skills # 从当前库导出 EADAF Skill/Tool upsert SQL 并写入仓库
pnpm migrate-eadaf-ai-skills # 在目标库幂等 upsert（不重置、不删业务应用 Skill）
npm run db:maintenance:all  # VACUUM / ANALYZE / REINDEX
npm run test:unit           # src 下的纯逻辑单测（node --test）
```

### 启动自检

每次启动都先跑一遍自检（`src/app.js` 的 `bootstrap()` → `src/utils/startupSelfCheck.js`），再监听端口。
**任何一项不通过都不阻塞启动**，但结论必须准：连接失败说连接，表 / schema 缺失说结构，互不冒充。

```
────────────── 启动自检 ──────────────
  ✓ 运行环境    node v24.20.0 · development · :29526
  ✓ env 配置    .env.development · 关键键 10/10
  ✓ PostgreSQL  localhost:25432 · 可用 · 必需
  ✓ MinIO       127.0.0.1:9000 · 可用 · 必需
  ✓ Redis       localhost:26379 · 可用 · 可选（降级）
  ✓ 库结构       eadaf / aibase / bizdata / automation · 57/57 张表
  ✓ 系统存储桶   eadaf-system（eadaf.storage_buckets 已就绪）
  ── 7/7 通过 ──
──────────────────────────────────────
```

- 开发环境始终打完整清单；生产环境全通只留一行，有 ❌ 才打表（避免刷启动日志）
- 「库结构」以 Sequelize 模型为事实来源：新增模型自动纳入检查，不用维护第二份表清单
- 表 / schema 缺失单独报 `数据库结构缺失（xxx 不存在）`，并给两条正路：
  `pnpm init-db`（重建，会清空数据）或 `pnpm migrate-uac-to-eadaf`（遗留 `uac` schema 改名到 `eadaf`）
- 只跑自检、不起服务：

```bash
node -e "require('./src/utils/startupSelfCheck').runStartupChecks().then((rows) => rows.forEach((r) => console.log(r.status, r.label, r.text)))"
```

### 配置（env）加载

**加载逻辑只有一处实现**：`src/config/envFiles.js`（决定顺序）+ `scripts/lib/load-env.cjs`（解析并输出）。
shell 脚本通过 `scripts/env.sh` 的 `load_env_file()` 调用同一个解析器，**不要在任何脚本里再写一套**
（历史上 `env.sh` 只读 `.env.$NODE_ENV`，读不到 `.env.$NODE_ENV.local`，导致备份脚本连错库端口）。

优先级（应用与脚本一致）：

```
真实环境变量(CI / pm2 / docker -e / 命令行)  >  .env.{NODE_ENV}.local  >  .env.{NODE_ENV}  >  .env
```

手工查看某个键最终生效的值：

```bash
node scripts/lib/load-env.cjs --value POSTGRES_PORT   # 单个键
node scripts/lib/load-env.cjs --files                 # 实际加载了哪些文件
```

**`.env.example` 是生成物**（从 `.env.development` 生成，勿手改）：

```bash
pnpm --filter ./backend config:example   # 重新生成 .env.example
pnpm --filter ./backend config:check     # 一致性检查（CI 可跑）
```

`config:check` 会拦住这几类漂移：**死键**（写了没人读）、**示例过期**（`.env.example` 与生成结果不一致）、
**`NODE_ENV` 写进 env 文件**（应由 cross-env/pm2/compose 决定），并提示未文档化的键、
多文件重复定义、compose 默认值与 env 不一致、`.env.production` 缺键。

**前端运行时可配**：`GET /api/v1/system/runtime-config`（**公开只读**，不含密钥）向下发
`systemStorageBucketCode` 等跨环境会变的值，前端启动时读取——同一份前端产物可部署到不同环境，
不必为"桶 code 不同"重新构建。前端侧解析顺序见 `EADAF_frontend/src/config/deployConfig.ts`。

### 历史命名迁移（UAC → EADAF）

老库的表都建在 `uac` schema 下，AI Tool 名也还是 `uac_*`。已有实例执行一次（幂等，先备份）：

```bash
bash backend/scripts/backup-db-now.sh            # 先备份
pnpm --filter ./backend migrate-uac-to-eadaf     # ALTER SCHEMA + 存库 AI 文本归一
```

新装实例不需要：种子与迁移脚本已是 `eadaf`。数据库 schema 名由 `POSTGRES_SCHEMA` 控制
（默认 `eadaf`，模型统一从该配置读取，不再各自硬编码）。

### 同步 EADAF Skill / Tool

`init-db` 会执行 `scripts/migrate-eadaf-ai-skills.sql`：写入**全局 Skill** 以及绑定应用 `EADAF` 的专用 Skill/Tool（如 `bizdata-model-design`）。不含 SFDEP、sales-demo 等业务应用 Skill，也不含销售域测试实体。

> 销售 Demo（`app_example`）的 AI 工具直接读 **EADAF 物化表**（`bizdata_mat.ys_*`），
> 与页面/API 服务同源 —— 不再有本地 SQLite 演示库。

本地改完 Skill 正文、Tool 或绑定后，导出 SQL 提交，再到服务器执行（不 DROP 库）：

```bash
# 在已改好 Skill 的本地库导出 upsert SQL，然后提交
cd backend
pnpm export-eadaf-ai-skills

# 服务器上（不重置库）
pnpm migrate-eadaf-ai-skills
```

按 `slug` / `function_name` upsert。本批 Skill 上已删除的 Tool 绑定会收敛；其他应用的 Skill 不会被删。

`init-db-with-aibase-seed` 仍使用 `aibase-ai-seed.sql` 全量 TRUNCATE，仅适合 Demo / 可清空的开发库。

### 验证

```bash
curl -s http://localhost:29526/api/v1/health
# Swagger: http://localhost:29526/swagger
```

## 关键注意事项

1. **配置以 `.env.development` / `.env.production` 为准**，启动时由 `src/config/index.js` 加载。
2. **`init-db` 会 DROP SCHEMA `uac` 并重建**，会清空该 schema 下全部数据，禁止对生产库执行。
3. **监听与跨域**：默认 `API_HOST=0.0.0.0`、`CORS_ORIGIN=*`，局域网 IP 与公网域名可直接访问。收紧时把 `CORS_ORIGIN` 改成逗号分隔白名单（不要带 `*`）。
4. **超管账号**：`superadmin.sql` 在 init 时写入，上线前务必改密或删除。
5. **增量表结构**：如 `migrate-storage-tus.sql`、`migrate-bizdata-database-connections.sql`、`migrate-department-roles.sql` 等，在已有库上需手动 `psql -f` 执行。
6. **物化执行**：目标 PostgreSQL Schema / MongoDB 库不存在时返回 409，前端确认后带 `createTargetIfMissing: true` 自动创建。
7. **路由 Swagger**：接口注释即文档源，改路由后请同步更新 JSDoc `@swagger` 备注。
8. **文件存储**：轻量上传 `POST /api/v1/storage/objects/upload` 上限 100MB；超过必须走 tus `POST/HEAD/PATCH /api/v1/storage/tus`（可传小文件，默认上限 5GB）。进度以磁盘 + PostgreSQL 为准，Redis 仅作可选加速。完成后仍用 `objectId` 走 preview/download。
