# EADAF Frontend

EADAF 管理端，基于 React 19、Vite、Ant Design 6 与 Pro Components，集成 `@eadaf/ai-base` 对话能力。

## 功能

- **认证**：登录、找回密码、SSO 回调
- **成员与组织**：成员管理、组织架构、角色管理（成员/组织多角色绑定）
- **权限**：菜单、按钮、API 权限维护
- **应用**：三方应用注册、SSO / API 配置
- **业务数据**：数据模型设计、数据执行（物化）、数据库连接管理
- **AI 管理**：服务商、模型、Scopes、Tools、Skills、Chat Demo、请求日志
- **AI Chat**：全局/页面级对话，Tool 调用与 AISurface 页面状态联动
- **个人中心**：资料与密码

## 安装

### 环境

- Node.js 18+
- pnpm 8+（推荐在 monorepo 根目录 `pnpm install`）

### 步骤

```bash
# 在仓库根目录
pnpm install

# 启动开发服务（默认 http://localhost:29527）
cd EADAF_frontend
pnpm dev
```

### 环境配置

分两层，**别再往构建期里塞跨环境的值**：

**1. 开发期**（`config/env.ts`，vite 读取）

| 项 | 默认 |
|----|------|
| 前端端口 | `29527` |
| 开发 API | `http://localhost:29526`（Vite proxy 转发 `/api`） |

**2. 运行时可配**（同一份 `dist` 可跨环境部署，无需重新构建）

解析顺序见 `src/config/deployConfig.ts`：

1. `public/runtime-config.js` 注入的 `window.__EADAF_DEPLOY__`（部署时覆盖该文件即可，支持
   `apiBaseUrl`、`systemStorageBucketCode`；**不要放密钥**，它是公开静态资源）；
2. 后端 `GET /api/v1/system/runtime-config`（同源部署时由后端 env 下发，例如
   `SYSTEM_STORAGE_BUCKET_CODE`）；
3. 构建期兜底/代码默认值（`APP_API_BASE_URL` 仅用于跨域部署的 bootstrap）。

启动顺序由 `src/main.tsx` 保证：先加载运行时可配，**再**动态 `import('./App')`，
这样依赖链里的模块级常量（如 `constants/storage.ts` 的桶 code）才拿到最终值。自检：

```bash
node --import tsx src/config/deployConfig.verify.ts
```

> 生产环境跨域时优先改 `runtime-config.js`（不必重新构建）；Nginx 同源代理 `/api` 时两者都可留空。

### 常用命令

```bash
pnpm dev              # 开发
pnpm build            # 生产构建
pnpm preview          # 预览构建结果
pnpm openapi2ts       # 从后端 OpenAPI 生成 API 类型与客户端
pnpm refresh:ai-base  # 重新链接 / 刷新 @eadaf/ai-base 本地包
```

## 关键注意事项

1. **先启动后端**（`EADAF_backend`，默认 `29526`），否则页面请求会失败。
2. **Monorepo 依赖**：`@eadaf/ai-base` 来自 `package/ai-base`；改 ai-base 源码后需在其目录 `pnpm build`，再执行 `pnpm refresh:ai-base`。
3. **React 单例**：`vite.config.ts` 已对 `react` / `react-dom` 做 dedupe，勿在子包中引入第二份 React。
4. **OpenAPI 类型**：后端接口变更后执行 `pnpm openapi2ts` 更新 `src/services/EADAF/api/`。
5. **菜单与路由**：菜单数据在 `src/routes/config.ts` 的 `appRouteMeta`，新增页面需同步注册路由与菜单项。
6. **AISurface**：业务页通过 `useAISurface` 暴露可读状态，供 AI Tool 读取与 `applyMutation` 刷新；物化等写操作见 `toolMutation` / `registerBizDataTools`。
7. **开发热更新**：后端 nodemon 自动重启，前端 Vite HMR，一般无需手动重启。
