# EADAF Frontend 开发说明

简要说明本地开发与 monorepo 联调，面向日常开发场景。完整功能介绍见 [README.md](./README.md)。

> **构建工具**：本项目已从 Umi 迁移至 **Vite + React Router**，入口为 `index.html` → `src/main.tsx` → `src/App.tsx`。

## 环境要求

- **Node.js**：建议 `20`（见 `.nvmrc`）
- **包管理器**：推荐在 **monorepo 根目录** 使用 `pnpm`（`packageManager` 已锁定版本）

```bash
# 在 monorepo 根目录执行
pnpm install
```

## 启动开发

**先启动后端，再启动前端**（否则 API 请求会 502）：

```bash
# 终端 1：后端（默认 29526）
cd EADAF_backend
pnpm dev

# 终端 2：前端（默认 29527）
cd EADAF_frontend
pnpm dev
```

浏览器访问：<http://localhost:29527>

### 端口与代理

环境变量集中在 [`config/env.ts`](./config/env.ts)：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `APP_ENV.port` | `29527` | Vite dev 端口 |
| `APP_ENV.devApiBaseUrl` | `http://localhost:29526` | dev 代理目标 |
| `APP_ENV.prodApiBaseUrl` | `''` | 生产 API 根地址（同源 Nginx 代理时可留空） |

前端请求 `/api/*` 时，Vite 会代理到 `devApiBaseUrl`，配置见 [`vite.config.ts`](./vite.config.ts) 的 `server.proxy`。

### 常用脚本

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动 Vite 开发服务 |
| `pnpm build` | `tsc -b` 类型检查 + 生产构建（输出 `dist/`） |
| `pnpm preview` | 本地预览生产构建 |
| `pnpm openapi2ts` | 根据 OpenAPI 生成 API 类型（需后端 Swagger 可访问） |
| `pnpm format` | Prettier 格式化 |
| `pnpm refresh:ai-base` | 清除并更新 `@eadaf/ai-base`（见下文） |

## 项目结构（迁移后）

| 路径 | 职责 |
|------|------|
| `index.html` | Vite HTML 入口 |
| `src/main.tsx` | React 挂载 |
| `src/App.tsx` | 全局 Provider（ConfigProvider、InitialState、AIChat、Router） |
| `src/routes/index.tsx` | React Router 路由树（映射原 `config/routes.ts`） |
| `src/routes/config.ts` | ProLayout 菜单元数据 |
| `src/layouts/AppLayout.tsx` | ProLayout 外壳 |
| `src/layouts/SecurityLayout.tsx` | 鉴权布局 |
| `src/utils/request.ts` | axios 请求封装（替代 Umi request） |
| `src/utils/navigation.ts` | 非组件内跳转（`history.push` 等） |
| `src/providers/InitialStateProvider.tsx` | 全局用户/部门状态（替代 `useModel('@@initialState')`） |
| `config/routes.ts` | 原 Umi 路由定义（保留作参考，运行时不再使用） |
| `config/env.ts` | 端口与 API 地址 |

## Monorepo 与 `@eadaf/ai-base`

本项目通过 pnpm workspace 依赖本地包：

```
EADAF/node_modules/@eadaf/ai-base  →  package/ai-base
```

AI Chat 相关能力（`AIChatProvider`、`useChatReference`、Chat Reference 等）均来自该包。

开发时 Vite 通过 alias **直接引用 ai-base 源码**（见 `vite.config.ts` 的 `resolve.alias` + `optimizeDeps.exclude`），修改 ai-base 后 HMR 即可生效；若行为异常可执行 refresh 脚本。

## 清除并更新 `@eadaf/ai-base`

若出现类似 **`useChatReference is not a function`**、AI Chat 行为与 ai-base 源码不一致，通常是 **Vite 预构建缓存** 或 **旧的 workspace 链接** 未刷新。

执行一键脚本（推荐）：

```bash
cd EADAF_frontend
pnpm refresh:ai-base
```

或直接运行：

```bash
bash EADAF_frontend/shells/refresh-ai-base.sh
```

脚本会依次：

1. 删除 `node_modules/@eadaf/ai-base`（根目录与 frontend）
2. 清除 `node_modules/.vite` 预构建缓存
3. 在 `package/ai-base` 重新 `pnpm run build`
4. 在 monorepo 根目录执行 `pnpm install` 重建链接

**完成后务必重启 dev 服务：**

```bash
cd EADAF_frontend && pnpm dev
```

若脚本提示链接未建立，在 monorepo 根目录手动执行一次 `pnpm install`。

手动清缓存（不重建 ai-base）：

```bash
rm -rf node_modules/.vite && pnpm dev
```

## AI Chat 引用（Chat Reference）

业务数据模型设计等页面已接入 Chat Reference：

- 使用 `useChatReference()` 的 `addReference` 添加引用
- 引用目标 UI 使用 `src/components/ChatReferenceTarget`（className：`chat-reference-target`，图标 `/at.svg`）
- 引用会在 AI Chat Sender 上方以 Tag 展示，发送时注入消息前缀

相关 wrapper 示例：`src/wrappers/BusinessDataDesignAI.tsx`。

## AI Tool 执行日志（开发）

Client Tool（如 `bizdata_*`）在浏览器执行，日志会：

1. 输出到浏览器控制台
2. 转发到 **EADAF_frontend dev 终端**（`pnpm dev` 窗口）

Server Tool 日志输出到 **EADAF_backend 终端**。

格式示例：

```
🤖✅ [client] bizdata_get_entity (42ms)
  args: {"entityCode":"sale:customer"}
  result: {"id":"..."}

🤖❌ [client] bizdata_update_entity (120ms)
  args: {"entityCode":"sale:customer","fields":[...]}
  error: Request failed with status code 500
```

修改 `@eadaf/ai-base` 后若日志未生效，执行 `pnpm refresh:ai-base` 并重启 dev。

Vite `configureServer` 已实现 `/__dev/ai-tool-log` 端点（见 `vite.config.ts`）。

## OpenAPI 代码生成

```bash
# 确保 EADAF_backend 已启动且 Swagger 可访问
cd EADAF_frontend
pnpm openapi2ts
```

生成配置见 [`openapi2ts.config.ts`](./openapi2ts.config.ts)，请求库路径已指向 `@/utils/request`。

## 常见问题

| 现象 | 处理 |
|------|------|
| API 502 / `ECONNREFUSED 29526` | 先启动 `EADAF_backend` |
| ai-base 新 API 不生效 | `pnpm refresh:ai-base` 后重启 dev |
| 依赖预构建异常 | 删除 `node_modules/.vite` 后重启 |
| `husky` 提示 `.git can't be found` | 可忽略，不影响 dev/build |
| 生产构建 chunk 过大警告 | 当前为全量打包，后续可按路由拆分 |

## 其他说明

- **首次 clone**：在 monorepo 根目录 `pnpm install`，再分别启动 backend 与 frontend。
- **静态资源**：`public/` 下文件以 URL 引用（如 `/images/EADAF-logo.png`）；需 import 的 JSON 等资源放 `src/assets/`。
- **CSS Modules**：`.module.scss` 文件以 `import styles from './xxx.module.scss'` 方式使用。
