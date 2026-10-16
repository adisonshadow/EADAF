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

- Node.js 18+
- PostgreSQL 14+
- Redis（可选，部分能力依赖）

### 步骤

```bash
# 1. 配置环境变量（数据库、端口、JWT、CORS 等）
cp .env.development .env.development.local   # 按需修改

# 2. 安装依赖
npm install

# 3. 初始化数据库（会重建 uac schema）
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
```

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
