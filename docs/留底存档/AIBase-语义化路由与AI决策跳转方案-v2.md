# AIBase 语义化路由与 AI 决策跳转方案（v2）

> **状态：架构方案层已被新 Agent 架构方案吸收；勿再按本文单独作为总方案实施。**  
> **继任文档**：[`新Agent架构方案/07-语义路由.md`](./新Agent架构方案/07-语义路由.md)（总览见 [`新Agent架构方案/README.md`](./新Agent架构方案/README.md)）。  
> 本文仍可作为字段/派生步骤的附录级参考；增量以新目录第 07 章 + 代码现状为准。
>
> **日期**：2026-08-12（取代说明更新于 2026-08-14）  
> **范围**：`@eadaf/ai-base`（`package/ai-base`）+ `frontend`，后端无改动  
> **取代**：[`AIBase-语义化路由与AI决策跳转方案.md`](./AIBase-语义化路由与AI决策跳转方案.md)（v1；其中 catalog 直挂 `component` 的方案作废）  
> **一句话目标**：废弃「工具成功必跳页」硬编码桥；以**语义路由清单**为单一事实源，派生菜单元数据与业务 `<Route>`，初始化 AIBase 时注入清单，由 AI 经 `navigate_to_page` 决策跳转，并在面板设置中提供可关闭的「自动跳转」开关。

---

## 〇、相对 v1 的关键变更

| 点 | v1 | v2 |
|---|---|---|
| 数据源 | `routes/catalog.tsx` 同时挂语义 + `LazyExoticComponent` | 新建 **语义路由文件**（path / mode / 标题 / 职责）；`config.ts`、`index.tsx` **派生**并补充 UI 信息 |
| `mode` 表单页 | 无法表达 `FormPage mode="create\|edit\|view"` | 语义条目显式 `mode`，element 工厂按 `pageKey + mode` 生成 |
| 页面级 `autoNavigate` / `navigate` | PageScope 可覆盖 | **本期不做**：开关仅全局 + userHabit（与模块级 store 一致） |
| 白名单 | `resolve` 签名缺清单 | `resolveSemanticRoutePath(path, params, routes)` 强制对照清单 |
| Scope Guard | 误写「不重构 index.tsx」 | 改为：特殊路由手写；业务路由由语义清单派生 |
| 开关范围 | 未写清 | 仅约束 `navigate_to_page`；业务 `*_navigate` 仍走自身逻辑（文案标明） |

已确认决策沿用：**D1 删旧桥 / D2 工作流保留 / D3 默认开 / D4 语义清单单一来源**；**D5 改为仅全局**。

---

## 一、背景与问题

### 1.1 现状机制

- `frontend/src/ai/toolMutation.ts` → `installToolNavigationBridge()`
- `subscribeToolInvoke` 监听 Tool 成功后，按工具名正则匹配 `DOMAIN_ROUTES`，命中即 `history.push`
- 写/改类才跳；查询类与 `*_navigate` 不跳

### 1.2 缺陷

1. **太僵硬**：写成功必跳，批量/连续/想留在当前页也会被拉走；
2. **该跳没跳**：只能跳静态入口，带不上 `:id` 进编辑/详情；模糊匹配易漏；
3. **与意图无关**：规则维护成本高，AI 不参与决策。

### 1.3 改造方向

1. **语义路由清单**（path / mode / 标题 / 职责…）作为业务页事实源；
2. **派生** `appRouteMeta`（菜单）与业务 `Routes`（补 `element` / `noContentPadding` 等）；
3. 清单注入 AIBase system prompt；AI 调 `navigate_to_page`；
4. Header「自动跳转」开关可关；关则拦截跳转并让 AI 说明。

---

## 二、目标与非目标

### 2.1 目标

1. 语义清单随 AIBase 初始化注入，AI 知道有哪些页、做什么、何时适合跳；
2. `navigate_to_page` 支持参数化 path（如带 `id` 进编辑页）；
3. 全局「自动跳转」开关可关，关闭后不跳但保留意图表达；
4. 删除写工具成功硬跳桥；mutation 分发（页面刷新）不动；
5. **改路由只改语义清单**：菜单与 `<Route>` 由派生保证不漂移。

### 2.2 非目标

- 框架布局 / 认证 / 公开 API 文档 / 错误页 / 个人中心：保留手写，不进语义清单；
- 不做跳转历史 / 回退；
- ApiServices 工作流页内导航本期保留（从旧桥剥离为独立订阅）；
- 不改后端；
- 不合并业务 `*_navigate` 进 `navigate_to_page`；
- **本期不做** PageScope 对 `autoNavigate` / `navigate` / 追加 `semanticRoutes` 的覆盖。

---

## 三、总体设计

### 3.1 数据流（单一语义源 → 三路消费）

```text
┌─ frontend/src/routes/semanticRegistry.ts ─────────────────────────────┐
│  业务页语义条目（path / mode / title / description / domain / …）       │
│  + redirect 条目                                                       │
│  + toAIChatSemanticRoutes()  → SemanticRoute[]（给 AIBase）            │
│  + 供派生用的只读清单 EADAF_SEMANTIC_ROUTES                            │
└───────────────┬───────────────────────────┬────────────────────────────┘
                │                           │
    ┌───────────▼──────────┐    ┌───────────▼──────────────────────────┐
    │ routes/config.ts     │    │ routes/index.tsx                      │
    │ buildAppRouteMeta()  │    │ buildBusinessRoutes()                 │
    │ 补充：icon / hideIn  │    │ 补充：element（pageKey+mode→组件）     │
    │ Menu / noContentPad  │    │        scopeGroup→AIChatPageScope     │
    │ ding / requiresFeat  │    │        Navigate redirect              │
    └──────────────────────┘    │ 特殊路由仍手写（layout/auth/public/…） │
                                └──────────────────┬───────────────────┘
                                                   │
                config/aiChat.ts：semanticRoutes + navigate 执行器
                                                   │
┌──────────────────────────────────────────────────▼───────────────────┐
│ @eadaf/ai-base                                                        │
│  prompt 注入「可用页面」+ navigate_to_page harness                      │
│  navigationChannel：autoNavigate（userHabit）+ navigate handler        │
│  AIChatPanel header：设置 → 自动跳转 Switch                           │
└──────────────────────────────────────────────────────────────────────┘
```

关键点：

- **语义文件不挂 React 组件**，只描述「是什么页、什么 mode、干什么」；
- **element / noContentPadding 等**在派生层补充，避免 v1「`LazyExoticComponent` 表达不了 `mode` props」的问题；
- 开关与导航执行器仍在 ai-base **模块级 store**（与 `registerAIChatControls` 同模式），builtin handler 可读；ai-base 不依赖 react-router。

### 3.2 行为矩阵（autoNavigate × 场景）

| 场景 | 开关开 | 开关关 |
|---|---|---|
| AI 认为应跳（写成功后进资源页等） | 白名单通过 → `history.push` | 不跳，返回 `auto_navigate_disabled`，AI 说明并可提示开启 |
| AI 认为不应跳 | 不调工具 | 同左 |
| 用户明确要求打开某页 | 跳转 | 不跳，提示可在设置开启 |
| AI 编造 path | `invalid_target` | 开关优先：直接 `disabled`（不暴露校验细节） |

**开关范围**：仅拦截 harness `navigate_to_page`。Skill 自带 `*_navigate` 不受此开关约束（设置文案写明）；本期不改造业务 navigate。

---

## 四、详细设计

### 4.1 语义路由清单（新文件，事实源）

#### 4.1.1 文件位置与职责

**新文件**：`frontend/src/routes/semanticRegistry.ts`（纯数据 + 纯函数，无 JSX）

职责：

1. 声明全站**业务页**与**业务 redirect**；
2. 导出 `toAIChatSemanticRoutes()` → 注入 `AIChatConfig.semanticRoutes`；
3. 导出清单供 `config.ts` / `index.tsx` 派生。

不负责：懒加载组件、菜单 icon、`noContentPadding`、具体 `element`。

#### 4.1.2 类型（frontend；与 ai-base `SemanticRoute` 对齐可映射）

```ts
/** 与 AIChatPageScope wrapper 对齐的分组（用于 index 派生嵌套） */
export type RouteScopeGroup =
  | 'member_org'
  | 'service_provider'
  | 'file_storage'
  | 'bizdata_design'
  | 'bizdata_materialize'
  | 'bizdata_metadata'
  | 'system'
  | 'api_services'
  | 'ai_management';

/** 页面模式：派生 FormPage/Test 等 element props，并帮助 AI 理解页面形态 */
export type SemanticRouteMode =
  | 'list'
  | 'create'
  | 'edit'
  | 'view'
  | 'test'
  | 'dashboard'
  | 'graph'
  | 'schema'
  | 'data'
  | 'browser'
  | 'execute'
  | 'settings'
  | 'other';

export interface SemanticRouteParamDef {
  type: 'string' | 'number';
  description: string;
  example?: string;
}

/**
 * 业务页语义条目。
 * pageKey：与 element 工厂映射键；同一 pageKey 可多 path（create/edit/view）。
 */
export interface AppSemanticRoute {
  path: string;
  /** 派生 element 与理解页面形态；列表类可省略或标 list */
  mode?: SemanticRouteMode;
  /** element 工厂键，如 'member' | 'memberForm' | 'providerForm' */
  pageKey: string;
  title: string;
  /** AI 决策依据，1~2 句 */
  description: string;
  domain: string;
  scopeGroup: RouteScopeGroup;
  actions?: string[];
  keywords?: string[];
  params?: Record<string, SemanticRouteParamDef>;
  /** true：不进 AI prompt，仍可进白名单（若需要可跳） */
  hiddenFromAI?: boolean;
}

export interface AppSemanticRedirect {
  path: string;
  to: string;
  scopeGroup: RouteScopeGroup;
}

export type AppSemanticEntry = AppSemanticRoute | AppSemanticRedirect;

export function isSemanticRedirect(e: AppSemanticEntry): e is AppSemanticRedirect {
  return 'to' in e;
}
```

ai-base 侧保持精简消费类型（与 v1 一致，略）：

```ts
export interface SemanticRoute {
  path: string;
  title: string;
  description: string;
  domain: string;
  actions?: string[];
  keywords?: string[];
  params?: Record<string, SemanticRouteParam>;
  hidden?: boolean;
}
```

`toAIChatSemanticRoutes()`：过滤 redirect、映射 `hiddenFromAI → hidden`，不传 `pageKey`/`mode`/`scopeGroup`（AI 不需要实现细节；`mode` 可写入 description 或 title，如「编辑成员」）。

#### 4.1.3 清单内容范围（对照现 `routes/index.tsx` 业务路由）

按 `scopeGroup` 覆盖（含参数化 path 与 redirect）：

- `member_org`：member / organization（list+create+`:id/edit`）、role、permissions menu|button|api；redirect `/member_org`、`/permissions`
- `bizdata_design`：model-design、relations-graph
- `bizdata_materialize`：materialization/execute、database-connections、database、tables/:entityId/schema|data、metrics（list/create/:id/edit/dashboard）；redirect materialization、`/business_data`
- `bizdata_metadata`：data-standards、metadata
- `api_services`：list/create/:id/edit|test、exception-responses、collection-pipelines、outbound-webhooks；redirect `/api_services`
- `ai_management`：providers|models|scopes|tools|skills（list/create/:id/edit/:id view）、chat-demo、request-logs；redirect `/ai_management`
- `service_provider`：list/create/:id/edit/:id/top-level-skill
- `file_storage`：buckets、browser；redirect `/file_storage`
- `system`：settings

#### 4.1.4 格式化（给 AIBase）

```ts
/** 语义清单 → ai-base SemanticRoute[]（redirect 忽略；hiddenFromAI → hidden） */
export function toAIChatSemanticRoutes(
  entries?: AppSemanticEntry[],
): SemanticRoute[];
```

Markdown 渲染仍在 **ai-base**（`semanticRoutesToMarkdown`）：按 `domain` 分组、紧凑行式、过滤 `hidden`。前端不负责 prompt 文本。

示例行：

```text
- [member_org] 编辑成员 /member_org/member/:id/edit —— 编辑已有成员（params: id）
```

#### 4.1.5 路径解析与白名单（`frontend/src/ai/semanticRoutes.ts`）

```ts
/** 必须对照清单：非法模板 / 缺参 / 注入 → null */
export function resolveSemanticRoutePath(
  path: string,
  params: Record<string, unknown> | undefined,
  routes: SemanticRoute[],
): string | null;

export function isAllowedNavigationTarget(
  url: string,
  routes: SemanticRoute[],
): boolean;
```

安全约束：

- path 必须等于清单某条模板（禁止清单外字符串）；
- params 仅 `encodeURIComponent` 替换；拒绝 `..`、`//`、`http(s):`、`javascript:`；
- 参数类型对照该条 `params` 声明。

---

### 4.2 派生层 A：`routes/config.ts`（菜单元数据）

#### 4.2.1 原则

- `appRouteMeta` **不再手写全表**，由语义清单 + **UI 补充表**生成；
- 语义清单提供 `path` / `title`（→ `name`）；
- UI 补充：`icon`、`hideInMenu`、`hideMenu`、`layout`、`noContentPadding`、`requiresFeature`、以及仅菜单存在的「分组根」（如 `/member_org`、`/business_data`）——分组根若已是 redirect 条目，可在 UI 表补 `name`/`icon`。

#### 4.2.2 UI 补充（同目录小表，或本文件内常量）

```ts
/** path → 菜单/布局补充；未列出的字段用默认 */
export const ROUTE_UI_BY_PATH: Record<string, Partial<AppRouteMeta>> = {
  '/member_org': { name: '成员与组织', icon: 'TeamOutlined' },
  '/business_data/model-design': { noContentPadding: true },
  '/business_data/model-design/relations-graph': {
    name: '关系图谱',
    hideInMenu: true,
    noContentPadding: true,
  },
  '/business_data/data-standards': { requiresFeature: 'metadataEnabled' },
  // …对照现 config.ts 全量迁入
};
```

#### 4.2.3 派生函数

```ts
export function buildAppRouteMeta(
  entries: AppSemanticEntry[] = EADAF_SEMANTIC_ROUTES,
  uiByPath: Record<string, Partial<AppRouteMeta>> = ROUTE_UI_BY_PATH,
): AppRouteMeta[];
```

规则建议：

- redirect 条目：默认可不进菜单；若 UI 表给了 `name`（分组根），则进 `appRouteMeta`；
- 页面条目：`name = ui.name ?? title`；合并 `ROUTE_UI_BY_PATH[path]`；
- 保留现有 `buildMenuData` / `findRouteMeta` 逻辑不变，只换数据来源。

---

### 4.3 派生层 B：`routes/index.tsx`（业务 Route）

#### 4.3.1 element 工厂（新文件，含 JSX）

**新文件**：`frontend/src/routes/routeElements.tsx`

```tsx
import { lazy, type ReactNode } from 'react';

const Member = lazy(() => import('@/pages/MemberOrg/Member'));
const MemberFormPage = lazy(() => import('@/pages/MemberOrg/Member/FormPage'));
// …

type PageMode = 'create' | 'edit' | 'view' | 'test' | …;

/**
 * pageKey → 无 mode 的页面，或 (mode) => element
 * 解决 FormPage 必须传 mode 的问题
 */
export const PAGE_ELEMENTS: Record<
  string,
  ReactNode | ((mode: string) => ReactNode)
> = {
  member: <Member />,
  memberForm: (mode) => <MemberFormPage mode={mode as 'create' | 'edit'} />,
  providerForm: (mode) => (
    <ProviderFormPage mode={mode as 'create' | 'edit' | 'view'} />
  ),
  // …
};

export function resolveRouteElement(route: AppSemanticRoute): ReactNode {
  const factory = PAGE_ELEMENTS[route.pageKey];
  if (!factory) throw new Error(`Missing PAGE_ELEMENTS[${route.pageKey}]`);
  if (typeof factory === 'function') {
    if (!route.mode) throw new Error(`${route.path} needs mode`);
    return factory(route.mode);
  }
  return factory;
}
```

#### 4.3.2 scope wrapper 映射

```tsx
const SCOPE_WRAPPERS: Record<RouteScopeGroup, ComponentType<{ children?: ReactNode }> | null> = {
  member_org: MemberOrgAI,
  bizdata_design: BusinessDataDesignAI,
  bizdata_materialize: BusinessDataMaterializeAI,
  bizdata_metadata: BusinessDataMetadataAI, // 注意：现状为 lazy，派生时统一处理
  api_services: ApiServicesAI,
  ai_management: AIManagementAI,
  service_provider: null,
  file_storage: null,
  system: null,
};
```

#### 4.3.3 `buildBusinessRoutes`

```tsx
/** 按 scopeGroup 分组，生成与现 index 等价的业务 <Route> 树（含 Navigate） */
export function buildBusinessRoutes(
  entries: AppSemanticEntry[] = EADAF_SEMANTIC_ROUTES,
): ReactNode;
```

- 同组页面包在同一 `element={<Wrapper />}` 下（`null` 则平铺）；
- redirect → `<Navigate to={to} replace />`；
- 页面 → `<Route path={path} element={resolveRouteElement(route)} />`。

**仍手写、不进语义清单**：

- `/` → member_org；
- `/public/applications/...`；
- `/auth/*` + `AIChatHidden`；
- `SecurityLayout` / `AppLayout` 外壳；
- `/account/center`；
- 401/403/404/500；
- `NavigationBinder`。

---

### 4.4 AI 决策通道：`navigate_to_page`

#### 4.4.1 模块级通道（ai-base `navigation/navigationChannel.ts`）

与 v1 相同：`NavigationRequest` / `NavigationResult` / `registerNavigationHandler` / `getAutoNavigate` / `setAutoNavigate` / `subscribeAutoNavigate`；userHabit key：`chat.autoNavigate`；**config 默认 ← userHabit 覆盖**（关过一次不回弹）。

#### 4.4.2 工具（`builtinTools.ts` + `useAIBaseChat.ts`）

- 常量 `NAVIGATE_TO_PAGE_TOOL`，加入 `HARNESS_TOOL_NAMES`；
- **独立** `NAVIGATE_TO_PAGE_OPENAI_TOOL`，**不进** `HARNESS_OPENAI_TOOLS`；
- `useAIBaseChat` 在 `semanticRoutes?.length` 非空时与 harness 并列注入（不依赖 Skill、不依赖结构化终止开关）；
- `STRUCTURED_HARNESS_TOOL_NAMES` 增加 `navigate_to_page`；
- handler：先开关 → 再 handler → 透传；白名单在前端执行器；`invalid_target` / `disabled` **不视为 Tool 失败**（不重试）。

#### 4.4.3 与 `*_navigate` 业务工具

并存不合并。设置文案注明：自动跳转开关只影响助手的页面跳转工具。

---

### 4.5 system prompt 注入（`skillLoader.ts`）

`buildCombinedSystemPrompt` 在 Skills 段后追加「可用页面」协议 + `semanticRoutesToMarkdown(routes)`；仅当 `semanticRoutes.length > 0`。

决策准则（摘要）：

- 应当跳：写成功且需在目标页呈现；或用户明确要求打开某页；
- 不应跳：纯问答；当前页已能展示；批量中途；
- path 必须用清单模板；id 走 params；
- 关闭时返回 disabled → 向用户说明并提示设置开启。

---

### 4.6 配置与接线

#### 4.6.1 `AIChatConfig`（ai-base）

```ts
semanticRoutes?: SemanticRoute[];
autoNavigate?: boolean;  // 默认 true
navigate?: (req: NavigationRequest) => NavigationResult | Promise<NavigationResult>;
```

#### 4.6.2 前端 `config/aiChat.ts`

```ts
const semanticRoutes = toAIChatSemanticRoutes();

navigate: async ({ path, params }) => {
  const target = resolveSemanticRoutePath(path, params, semanticRoutes);
  if (!target) {
    return {
      navigated: false,
      reason: 'invalid_target',
      message: `未知或非法页面: ${path}`,
    };
  }
  history.push(target);
  return { navigated: true, path: target };
},
semanticRoutes,
autoNavigate: true,
```

#### 4.6.3 Provider / Panel

- mount：`registerNavigationHandler(resolved.navigate)`；
- `autoNavigate`：`getUserHabit('chat.autoNavigate', resolved.autoNavigate)`；
- context 暴露 `autoNavigate` / `setAutoNavigate`；
- header：设置 Popover + Switch（文案区分开/关；注明仅约束助手跳转工具）。

#### 4.6.4 `AIChatPageScope`

**本期不扩展** `semanticRoutes` / `autoNavigate` / `navigate` 字段（避免与模块 store / 白名单闭包不一致）。若未来需要页面追加路由，必须同时打通「有效清单 → prompt + 白名单」单通道，另开任务。

---

### 4.7 旧桥处置（`toolMutation.ts`）

- **删除** `installToolNavigationBridge` 及 `DOMAIN_ROUTES` 等；
- **保留** mutation 分发；
- ApiServices 工作流：从旧桥剥离为独立 `subscribeToolInvoke`（或挂在 `setupAIMutationRouter`），逻辑不变（D2）。

---

### 4.8 交互边界

- `AIChatProvider` 在 Router 下顶层，跳转不丢会话；
- PageScope skills 重载为既有行为；
- `disabled` / `invalid_target` 不触发 auto-continue 重试。

---

### 4.9 可选后续

- P6：ApiServices 工作流收编为 AI + 参数化跳转；
- 按当前 scope 只注入相关 domain（省 token）；
- 业务 `*_navigate` 可选尊重同一 `autoNavigate`；
- PageScope 追加语义路由（需白名单同源）；
- 设置面板扩展模型/宽度等。

---

## 五、涉及文件清单

### 5.1 `@eadaf/ai-base`

| 文件 | 改动 |
|---|---|
| `types.ts` | `SemanticRoute` / `NavigationRequest` / `NavigationResult`；Config 加三字段 |
| `config/runtime.ts` | 默认值 |
| `navigation/navigationChannel.ts`（新） | handler + autoNavigate store |
| `navigation/semanticRoutesToMarkdown.ts`（新） | prompt 渲染 |
| `registry/builtinTools.ts` | navigate 工具 + handler |
| `chat/useAIBaseChat.ts` | 条件注入工具 |
| `chat/autoContinuePolicy.ts` | harness 名集合 |
| `registry/skillLoader.ts` | 「可用页面」段 |
| `provider/AIChatProvider.tsx` / `context.tsx` | 注册 handler、开关 context |
| `ui/AIChatPanel.tsx` + `.css` | 设置入口 |
| `*.verify.ts`（新） | channel / markdown / navigateTool |

### 5.2 frontend

| 文件 | 改动 |
|---|---|
| `src/routes/semanticRegistry.ts`（新） | 语义事实源 + `toAIChatSemanticRoutes` |
| `src/routes/routeUi.ts`（新，可选独立） | `ROUTE_UI_BY_PATH` |
| `src/routes/routeElements.tsx`（新） | `PAGE_ELEMENTS` + `resolveRouteElement` |
| `src/routes/config.ts` | `buildAppRouteMeta` 派生；保留 menu 构建逻辑 |
| `src/routes/index.tsx` | `buildBusinessRoutes`；特殊路由手写 |
| `src/ai/semanticRoutes.ts`（新） | resolve / 白名单 |
| `src/ai/semanticRoutes.verify.ts`（新） | 清单约束 + 解析 + 派生冒烟 |
| `src/config/aiChat.ts` | 注入 semanticRoutes / navigate / autoNavigate |
| `src/ai/toolMutation.ts` | 删旧桥；剥离工作流订阅 |

### 5.3 backend

无。

---

## 六、分阶段实施

| 阶段 | 内容 | 验收 |
|---|---|---|
| P1 | ai-base 类型 + navigationChannel + verify | verify |
| P2 | navigate_to_page + prompt 注入 + verify | verify；`pnpm build` |
| P3 | Provider + header 开关 UI | 手动开关持久化 |
| P4a | `semanticRegistry` + `toAIChatSemanticRoutes` + resolve/白名单 + verify；**暂不改 config/index** | verify；前端 build |
| P4b | `routeUi` + `buildAppRouteMeta` 替换 `appRouteMeta` 手写表 | 菜单冒烟 |
| P4c | `routeElements` + `buildBusinessRoutes` 替换业务路由手写 | 全站路由冒烟 |
| P4d | `aiChat.ts` 接线真实清单 + navigate | AI 可跳 |
| P5 | 删旧桥 + 工作流独立订阅 | build + 回归 |
| P6（可选） | 工作流收编等 | — |

说明：P4b / P4c 可同 PR 但建议分提交便于回退；P4a 先锁数据约束再动路由。

---

## 七、验证计划

### 7.1 verify

- `navigationChannel`：默认 / 持久化 / 订阅 / handler；
- `navigateTool`：开关开/关、无 handler、透传 `invalid_target`；
- `semanticRoutesToMarkdown`：分组、hidden、空数组；
- `semanticRoutes`（前端）：
  - path 全局唯一、以 `/` 开头；
  - `:param` 与 `params` 声明一致；
  - 每条页面 `pageKey` 在 `PAGE_ELEMENTS` 有映射（P4c 后）；
  - `mode` 需要工厂函数时必填；
  - resolve 注入防护、白名单；
  - `buildAppRouteMeta` 关键 path 与现网菜单关键项一致（可用快照或抽样断言）。

### 7.2 构建

```bash
cd package/ai-base && pnpm build
cd frontend && pnpm refresh:ai-base && pnpm build
```

### 7.3 手动场景

1. 默认开：创建资源后 AI `navigate_to_page` 到**带 id 的编辑/详情**（非仅列表）；
2. 关开关：不跳，说明已关闭；
3. 再开：可跳；
4. 纯问答不跳；
5. 「打开 AI 服务商」→ `/ai_management/providers`（避免与「应用」`/service_provider` 混淆）；
6. 诱导编造 path → `invalid_target`；
7. 刷新后开关仍关；
8. mutation 刷新、会话保留、ApiServices 创建→edit 工作流仍可用。

---

## 八、风险与决策点

| 编号 | 决策点 | 结论 |
|---|---|---|
| D1 | 旧桥 | **删除** |
| D2 | ApiServices 工作流 | **本期保留**，独立订阅 |
| D3 | autoNavigate 默认 | **true** |
| D4 | 事实源 | **semanticRegistry 单一来源**；config / index 派生 |
| D5 | 开关作用域 | **仅全局** + userHabit；不做 PageScope 覆盖 |
| D6 | 工具可见性 | `semanticRoutes` 非空即注入 harness |

### 风险

1. **Token**：清单紧凑行式；后续可按 domain 裁剪；
2. **AI 不调工具**：删桥后依赖模型；验收盯「写成功后是否稳定 navigate」；不稳再加 hint，不恢复硬跳；
3. **P4c 回归面大**：分提交、路由冒烟、可回退；
4. **`*_navigate` 旁路开关**：文案标明；避免用户以为关开关后任何跳转都停；
5. **pageKey 与 element 漏映射**：verify 强制 `pageKey ∈ PAGE_ELEMENTS`。

---

## 九、Scope Guard（本期不做）

- 不把布局 / 认证 / 公开文档 / 错误页 / 个人中心纳入语义清单；
- 不改后端、不迁 Skill 数据；
- 不做跳转历史 / 回退；
- 不合并业务 `*_navigate`；
- 不做 PageScope 级 `autoNavigate` / `navigate` / 追加 `semanticRoutes`；
- 不处理多 Provider 导航通道隔离。

---

## 十、实施检查清单（开工前）

- [ ] 语义条目覆盖现 `index.tsx` 全部业务 path（含 view/test/redirect）
- [ ] 每个需 props 的页有 `pageKey` + `mode`，并在 `PAGE_ELEMENTS` 可解析
- [ ] `ROUTE_UI_BY_PATH` 覆盖现 `appRouteMeta` 的 icon / hide / padding / feature
- [ ] `resolveSemanticRoutePath` 第三参为清单
- [ ] 开关文案写明仅约束 `navigate_to_page`
- [ ] P5 前工作流订阅已剥离
