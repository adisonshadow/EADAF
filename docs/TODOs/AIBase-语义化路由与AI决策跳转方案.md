# AIBase 语义化路由与 AI 决策跳转方案

> **状态**：已由 v2 取代，勿再按本文实施  
> **继任文档（历史）**：[AIBase-语义化路由与AI决策跳转方案-v2.md](./AIBase-语义化路由与AI决策跳转方案-v2.md)  
> **现行总方案**：[新Agent架构方案/07-语义路由.md](./新Agent架构方案/07-语义路由.md)（总览 [README](./新Agent架构方案/README.md)）  
> **日期**：2026-08-12（更新）；取代链说明更新于 2026-08-14  
> **范围**：`@eadaf/ai-base`（`package/ai-base`）+ `frontend`，后端无改动  
> **一句话目标**：废弃"工具成功必跳页"的硬编码规则，改为在初始化 AIBase 时载入语义化路由清单，由 AI 通过 `navigate_to_page` 工具自主决策"何时跳、跳到哪里"，并在 AIBase 面板 header 提供可关闭的"自动跳转"开关。

---

## 一、背景与问题

### 1.1 现状机制

当前页面跳转由一条全局硬编码桥接驱动：

- `frontend/src/ai/toolMutation.ts` → `installToolNavigationBridge()`
- 通过 `subscribeToolInvoke` 监听所有 Tool 执行，成功后按**工具名正则**匹配 `DOMAIN_ROUTES` 硬编码表，命中即 `history.push(path)` 自动跳转
- 规则：写/改类工具（`create/update/delete/upsert/publish/disable/execute/insert/validate`）才跳；查询类与 `*_navigate` 后缀工具不跳

### 1.2 缺陷（实际使用反馈）

1. **太僵硬**：写操作成功即跳，无法区分上下文——批量操作、连续操作、用户只想留在当前页时也会被拉走；
2. **该跳没跳**：规则只能跳到静态入口页（如 `/ai_management/providers`），无法带资源 id 跳到 `/ai_management/providers/:id/edit` 这类详情/编辑页；工具名模糊匹配（`_update_` 之类）也会漏判；
3. **误判误伤**：工具改名（upsert/delete 变体）或新增域时规则要手工维护，且与"用户意图"完全无关——AI 明明知道结果，却不参与决策。

### 1.3 改造方向

把"跳转决策权"从规则代码交给 AI：

- **初始化 AIBase 时载入语义化路由**：`AIChatConfig.semanticRoutes` 传入全站业务路由清单（路径模板、页面职责、动作/关键词），渲染进 system prompt；
- **AI 决策跳转**：新增 harness 工具 `navigate_to_page`，由 AI 判断何时跳、跳到哪里（支持 `:param` 参数化路径）；
- **可关闭**：AIBase header 新增设置入口，内含"自动跳转"开关，关闭后 AI 的跳转请求被拦截并向用户说明，不再执行。

---

## 二、目标与非目标

### 2.1 目标

1. 语义化路由清单随 AIBase 初始化注入 AI 上下文（system prompt），AI 知道系统里有哪些页面、每页做什么、什么场景适合跳转；
2. AI 通过 `navigate_to_page` 工具自主决策跳转，支持参数化路径（如带 `id` 跳编辑页）；
3. Header 设置面板提供"自动跳转"开关，可关闭；关闭后不跳转但保留 AI 意图表达（AI 会提示用户手动前往）；
4. 移除"写工具成功即跳"的硬编码桥，保留 mutation 分发（页面数据刷新）不动。

### 2.2 非目标

- 框架布局与特殊路由（`AppLayout`/`SecurityLayout`/`AIChatHidden`、认证页、公开 API 文档、错误页）保留手写嵌套，不纳入语义化 catalog（它们不是 AI 跳转目标）；
- 不做"跳转历史/回退"增强；
- 不把 `ApiServices` 工作流页内导航（`apiServiceWorkflowNavigation.ts`）收编进 AI 决策（见 5.6，本期保留现状）；
- 不涉及后端任何改动。

---

## 三、总体设计

### 3.1 架构与数据流

```text
┌─────────────────────────── frontend（应用层）──────────────────────────┐
│  routes/catalog.tsx：路由 catalog 单一来源（分组/路径模板/懒加载组件/    │
│                      语义信息 + redirect）+ toSemanticRoutes() 展平      │
│  routes/index.tsx：buildRoutesFromCatalog 生成业务路由（特殊路由手写）    │
│  ai/semanticRoutes.ts：Markdown 渲染 + 白名单 + 路径解析（消费 catalog）  │
│  config/aiChat.ts：createAIChatConfig 注入 semanticRoutes / navigate /  │
│                     autoNavigate                                       │
│  utils/navigation.ts：history（react-router 全局 ref）                   │
└───────────────┬────────────────────────────────────────────────────────┘
                │ AIChatConfig
┌───────────────▼────────────────────────────────────────────────────────┐
│                    @eadaf/ai-base（框架层）                              │
│  types.ts / config/runtime.ts   —— SemanticRoute / autoNavigate /       │
│                                   navigate 字段 + 默认值                 │
│  registry/skillLoader.ts        —— buildCombinedSystemPrompt 追加        │
│                                   「可用页面」段 + 导航协议                │
│  registry/builtinTools.ts       —— 新增 navigate_to_page harness 工具    │
│  navigation/navigationChannel.ts—— 模块级通道：navigation handler 注册/  │
│                                   查询 + autoNavigate 状态（userHabit    │
│                                   持久化 + 订阅）                        │
│  provider/AIChatProvider.tsx    —— 挂载时注册 handler、初始化开关状态，    │
│                                   context 暴露 autoNavigate/setter       │
│  provider/AIChatPageScope.tsx   —— 页面级覆盖 semanticRoutes/autoNavigate│
│  ui/AIChatPanel.tsx             —— header 设置入口 + 自动跳转 Switch      │
└───────────────┬────────────────────────────────────────────────────────┘
                │ 模块级调用（非 React 链路，builtinTools handler 可读）
   navigate_to_page handler ──► getAutoNavigate() ? navigate(req) : disabled
                                       │
                       frontend navigate({path, params}) ──► 白名单校验
                                                            └─► history.push(解析后URL)
```

关键点：**开关状态与导航执行器都在 ai-base 内部以模块级 store 承载**（沿用 `registerAIChatControls` / `subscribeFunctionCalls` 既有模式），这样：

- `builtinTools.ts` 的 handler（模块级注册、无 React context）能同步读到 `autoNavigate` 与 `navigate` 执行器；
- 前端只需提供"路由语义"与"实际跳转函数"，不持有开关状态，职责清晰；
- ai-base 不引入 react-router 依赖。

### 3.2 行为矩阵（autoNavigate 开关 × 场景）

| 场景 | 开关开 | 开关关 |
|---|---|---|
| AI 认为应跳转（写操作后展示结果/进入资源页） | 白名单校验通过 → `history.push` | 不跳，返回 `disabled` 结果，AI 告知用户"自动跳转已关闭" |
| AI 认为不应跳转（纯问答/当前页已展示） | 不调工具，不跳 | 同左 |
| 用户明确要求"打开 XX 页" | 跳转 | 不跳，AI 提示可在设置中开启 |
| AI 幻觉/编造 path | 前端执行器白名单拦截，返回 `invalid_target` | 先返回 `disabled`（开关优先，不执行） |

---

## 四、详细设计

### 4.1 语义路由表（SemanticRoute）

#### 4.1.1 类型定义（ai-base `src/types.ts`）

```ts
export interface SemanticRouteParam {
  type: 'string' | 'number';
  description: string;
  /** 示例值，帮助 AI 理解（如 'uuid'、'service_code'） */
  example?: string;
}

export interface SemanticRoute {
  /** 路由模板，可含 :param 占位，如 /ai_management/providers/:id/edit */
  path: string;
  /** 页面标题（展示/检索用） */
  title: string;
  /** 页面职责描述（AI 决策依据，1~2 句） */
  description: string;
  /** 功能域：member_org / bizdata / api_services / ai_management / file_storage / system … */
  domain: string;
  /** 该页面能完成的代表性动作词 */
  actions?: string[];
  /** 检索关键词 */
  keywords?: string[];
  /** 路径模板参数说明 */
  params?: Record<string, SemanticRouteParam>;
  /** true 时不注入 AI 上下文（异常页/隐藏页），仅用于白名单 */
  hidden?: boolean;
}
```

#### 4.1.2 路由 catalog（单一来源，新文件 `frontend/src/routes/catalog.tsx`）

**设计目标**：语义路由描述与路由定义同源——改路由即改 catalog，`Routes` 与 AI 上下文自动同步，消除「清单 vs 路由表」双维护与漂移。

catalog 按现有 wrapper（`AIChatPageScope`）分组定义，每条页面同时携带路由与语义信息：

```tsx
export type RouteScopeGroup =
  | 'member_org'           // MemberOrgAI
  | 'service_provider'     // 无 wrapper（独立页）
  | 'file_storage'         // 无 wrapper
  | 'bizdata_design'       // BusinessDataDesignAI
  | 'bizdata_materialize'  // BusinessDataMaterializeAI
  | 'bizdata_metadata'     // BusinessDataMetadataAI
  | 'system'               // 无 wrapper
  | 'api_services'         // ApiServicesAI
  | 'ai_management';       // AIManagementAI

export interface RouteCatalogEntry {
  path: string;           // 路由模板，可含 :param
  component: LazyExoticComponent<ComponentType>; // 懒加载页面组件
  // —— 以下为语义信息（AIBase 消费）——
  title: string;          // 页面标题
  description: string;    // 页面职责（AI 决策依据，1~2 句）
  domain: string;         // 功能域（默认同 scopeGroup，可细分如 bizdata.*）
  actions?: string[];     // 代表性动作词
  keywords?: string[];    // 检索关键词
  params?: Record<string, SemanticRouteParam>; // 路径模板参数说明
  hidden?: boolean;       // true：不进 AI 上下文（白名单仍生效）
}

export interface RouteGroupCatalog {
  id: RouteScopeGroup;
  scope: ComponentType<{ children?: ReactNode }> | null; // 页面级 AIChatPageScope wrapper
  routes: Array<RouteCatalogEntry | RouteCatalogRedirect>;
}

export interface RouteCatalogRedirect {
  path: string;
  to: string;             // <Navigate> 重定向（纳入 catalog，AI 上下文忽略）
}
```

预期分组与页面（对照现 `routes/index.tsx` 业务路由全量搬迁，含参数化路径）：

- `member_org`（MemberOrgAI）：`/member_org/member`（含 create、`:id/edit`）、`/member_org/organization`（含 create、`:id/edit`）、`/member_org/role`、`/permissions/menu|button|api`
- `bizdata_design`（BusinessDataDesignAI）：`/business_data/model-design`、`/business_data/model-design/relations-graph`
- `bizdata_materialize`（BusinessDataMaterializeAI）：`/business_data/materialization/execute`、`/business_data/database-connections`、`/business_data/database`、`/business_data/database/tables/:entityId/schema|data`、`/business_data/metrics`（列表/create/:id/edit/dashboard）
- `bizdata_metadata`（BusinessDataMetadataAI）：`/business_data/data-standards`、`/business_data/metadata`
- `api_services`（ApiServicesAI）：`/api_services/list`、`/api_services/create`、`/api_services/:id/edit|test`、`/api_services/exception-responses`、`/api_services/collection-pipelines`（列表/create/:id/edit/:id/test）、`/api_services/outbound-webhooks`（列表/create/:id/edit/:id/test）
- `ai_management`（AIManagementAI）：`/ai_management/providers|models|scopes|tools|skills`（列表/create/:id/edit/:id 查看）、`/ai_management/chat-demo`、`/ai_management/request-logs`
- `service_provider`（无 wrapper）：`/service_provider`、`/service_provider/create`、`/service_provider/:id/edit`、`/service_provider/:id/top-level-skill`
- `file_storage`（无 wrapper）：`/file_storage/buckets`、`/file_storage/browser`
- `system`（无 wrapper）：`/system/settings`

**格式化方法**（新文件对外提供，AIBase 初始化用）：

```ts
/** 展平 catalog → SemanticRoute[]（hidden 过滤、redirect 忽略）；注入 AIChatConfig.semanticRoutes */
export function toSemanticRoutes(groups: RouteGroupCatalog[]): SemanticRoute[];
```

职责分层：`toSemanticRoutes`（数据展平，放 catalog 文件）→ `SemanticRoute[]` 注入 `AIChatConfig` → ai-base `buildCombinedSystemPrompt` 调用 `semanticRoutesToMarkdown` 渲染成 prompt 文本。渲染属于框架层（prompt 组装职责），故 `semanticRoutesToMarkdown` 放 **ai-base**（`src/navigation/semanticRoutesToMarkdown.ts`，消费 `SemanticRoute[]` 的纯函数）；前端只保留路径解析与白名单。

**路径解析/白名单纯函数**（`frontend/src/ai/semanticRoutes.ts`，消费 `SemanticRoute[]`，不依赖 catalog）：

```ts
/** 模板替换 + 参数校验/编码，返回最终 URL；非法返回 null */
export function resolveSemanticRoutePath(
  path: string,
  params?: Record<string, unknown>,
): string | null;

/** 白名单校验：最终 URL 必须由清单内模板解析得出 */
export function isAllowedNavigationTarget(url: string, routes?: SemanticRoute[]): boolean;
```

安全约束：

- 仅接受清单内 path 模板，拒绝清单外字符串；
- `params` 值仅做 `encodeURIComponent` 后替换 `:param`，拒绝 `..`、`//`、`http(s):`、`javascript:` 等注入（resolve 时对模板与参数双重校验）；
- 参数必须匹配该路由 `params` 声明的类型（`string`/`number`）。

#### 4.1.3 路由派生与一致性（单一来源）

- `frontend/src/routes/index.tsx` 改为基于 catalog 生成业务路由：`buildRoutesFromCatalog(groups)` 遍历分组，渲染 `<Route element={group.scope}>` 嵌套结构（等价于现有 `<Route element={<MemberOrgAI />}>` 等）与 `<Navigate>` 重定向（redirect 条目），**业务路由不再手写**；`NavigationBinder` 等既有逻辑不变；
- **保留手写**：框架布局嵌套（`AppLayout`/`SecurityLayout`/`AIChatHidden`）、认证页（`/auth/*`）、`/account/center`、公开 API 文档（`/public/*`）、错误页（401/403/404/500）、首页 `Navigate to="/member_org"`——它们非 AI 跳转目标且结构特殊，为避免高回归风险不纳入 catalog；
- 一致性由「同源」天然保证：AI 上下文与路由渲染都来自 catalog，不存在漂移；`.verify.ts` 只校验 catalog 自身约束（path 唯一、模板参数与 `params` 声明一致、组件非空、`toSemanticRoutes` 展平正确），不再做跨文件正则对比。

### 4.2 AI 决策通道：`navigate_to_page` harness 工具

#### 4.2.1 模块级导航通道（新文件 ai-base `src/navigation/navigationChannel.ts`）

```ts
export interface NavigationRequest {
  path: string;
  params?: Record<string, unknown>;
  reason?: string;
}
export type NavigationResult =
  | { navigated: true; path: string }
  | { navigated: false; reason: 'auto_navigate_disabled' | 'invalid_target' | 'no_handler'; message?: string };

export type NavigationHandler = (
  req: NavigationRequest,
) => NavigationResult | Promise<NavigationResult>;

/** 应用层注册实际跳转执行器（如 react-router navigate）；单例，后注册覆盖 */
export function registerNavigationHandler(fn: NavigationHandler): void;
export function getNavigationHandler(): NavigationHandler | undefined;

/** autoNavigate 状态：内存 store + userHabit 持久化（key: 'chat.autoNavigate'） */
export function getAutoNavigate(): boolean;
export function setAutoNavigate(value: boolean): void;   // 写 store + 持久化 + 通知订阅者
export function subscribeAutoNavigate(cb: (v: boolean) => void): () => void;
```

初始化语义：**config 默认值 → userHabit 持久化值覆盖**（`getUserHabit('chat.autoNavigate', resolved.autoNavigate)`），即用户手动关过一次后，全局记住，即使改 config 默认也不回弹。

#### 4.2.2 工具定义（ai-base `src/registry/builtinTools.ts`）

- 新增常量 `export const NAVIGATE_TO_PAGE_TOOL = 'navigate_to_page'`，加入 `HARNESS_TOOL_NAMES`（内置 harness 名集合，保持一致）；
- **不加入 `HARNESS_OPENAI_TOOLS`**：该数组在 `useAIBaseChat.ts` 中仅于 `enableStructuredTermination=true` 时整体注入，若放入其中，未开启结构化终止的场景（ai-base 默认）将拿不到该工具。改为独立导出 `NAVIGATE_TO_PAGE_OPENAI_TOOL`（仅此一个工具，不进 `HARNESS_OPENAI_TOOLS` 数组），在 `useAIBaseChat` 的 openaiTools 组合中与 `harnessTools` 并列，**按 `config.semanticRoutes?.length` 非空条件无条件注入**（不依赖 Skill 关联、不受结构化终止开关影响）：
  - `description` 写明决策准则（何时跳/何时不跳/必须用清单 path/参数化传 id）；
  - `parameters`：`path`（必填，清单中的模板）、`params`（可选对象）、`reason`（可选，审计）；
- **`chat/autoContinuePolicy.ts` 的 `STRUCTURED_HARNESS_TOOL_NAMES` 增加 `navigate_to_page`**：否则 `decideStructuredTermination` 会把「只调了 navigate」误判为业务工具成功，可能错误支撑「查询型直接收尾」；navigate 属于 harness，不应参与业务成功判定；
- `registerBuiltinTools()` 注册 handler（白名单不在此层，见下方设计取舍）：
  1. **先查开关**：`!getAutoNavigate()` → 返回 `{ navigated: false, reason: 'auto_navigate_disabled', message: '自动跳转已关闭…' }`——结构化结果回灌上下文，AI 据此向用户说明并提示可在面板设置中开启；
  2. **再查执行器**：`getNavigationHandler()` 为空 → `{ navigated: false, reason: 'no_handler' }`；
  3. **最后执行**：`await handler({ path, params, reason })` 透传结果；白名单与模板解析由前端执行器完成，非法 path 由其返回 `invalid_target`（不视为 Tool 错误，避免触发重试循环）。

> 设计取舍：白名单判定需要语义清单，而清单是前端注入的。因此 handler 只做"通道 + 开关"，把 path 原样交给前端 `navigate` 执行器做白名单与模板解析（见 4.4.2），ai-base 不感知具体路由。工具描述中的"必须使用清单 path"约束由 prompt 段（4.3）保障。开关优先于白名单：关闭状态下任何 path 一律返回 `disabled`（不执行、不暴露路径校验结果），与 3.2 行为矩阵一致。

#### 4.2.3 与现有 `*_navigate` 业务工具的关系

业务 Skill 可能自带 `*_navigate` 工具（命名后缀约定，走 `history`）；`navigate_to_page` 是 harness 级通用工具，二者并存：业务 navigate 保持 Skill 语义不变，`navigate_to_page` 用于通用"进页面/进资源页"。本期不合并、不删除业务工具。

### 4.3 system prompt 注入（ai-base `src/registry/skillLoader.ts`）

`buildCombinedSystemPrompt` 末尾追加一段（放在 Skills 段之后）：

```text
## 可用页面（语义化路由）

需要展示操作结果、进入资源详情/编辑页，或用户明确要求打开某个页面时，
使用内置工具 navigate_to_page 跳转：

- 应当跳转：写操作（创建/更新/删除/发布/执行）成功且结果需要在目标页面
  呈现，或用户明确要求"打开 XX / 去 XX 管理"；
- 不应跳转：纯问答；当前页面已能完整展示结果；用户未要求离开当前页；
  正在连续执行批量操作的中途；
- path 必须严格使用下方清单中的 path 模板；需要带 id 时用 params 传参，
  禁止拼接、编造或修改路径；
- 自动跳转被关闭时，navigate_to_page 会返回 disabled，此时请向用户说明
  并提示可在 AI 助手面板设置中开启。

{domain 分组渲染的清单}
```

渲染格式建议（每域一组，紧凑行式，控制 token 占用）：

```text
- [member_org] 成员管理 /member_org/member —— 成员列表与查询
- [member_org] 新建成员 /member_org/member/create —— 创建成员（表单）
- [member_org] 编辑成员 /member_org/member/:id/edit —— 编辑成员（params: id）
```

注入条件：`config.semanticRoutes?.length` 非空才注入（无清单时不引入协议噪音）。

### 4.4 配置与接线

#### 4.4.1 `AIChatConfig` 扩展（ai-base `src/types.ts` + `src/config/runtime.ts`）

```ts
export interface AIChatConfig {
  // …现有字段
  /** 语义化路由清单：非空时注入 AI 上下文（system prompt）供跳转决策 */
  semanticRoutes?: SemanticRoute[];
  /** 是否允许 AI 自动跳转页面。默认 true；header 设置可改，localStorage 持久化 */
  autoNavigate?: boolean;
  /** 应用层页面跳转执行器（如 react-router navigate）。未配置时 navigate_to_page 返回 no_handler */
  navigate?: (req: NavigationRequest) => NavigationResult | Promise<NavigationResult>;
}
```

`ResolvedAIChatConfig` 对应新增 `semanticRoutes: SemanticRoute[]`、`autoNavigate: boolean`、`navigate`；`resolveConfig` 默认：`semanticRoutes: []`、`autoNavigate: true`、`navigate: undefined`。

#### 4.4.2 前端接线（`frontend/src/config/aiChat.ts`）

```ts
import { EADAF_ROUTE_GROUPS, toSemanticRoutes } from '@/routes/catalog';
import { resolveSemanticRoutePath } from '@/ai/semanticRoutes';
import { history } from '@/utils/navigation';

navigate: async ({ path, params }) => {
  const target = resolveSemanticRoutePath(path, params);
  if (!target) return { navigated: false, reason: 'invalid_target', message: `未知或非法页面: ${path}` };
  history.push(target);
  return { navigated: true, path: target };
},
semanticRoutes: toSemanticRoutes(EADAF_ROUTE_GROUPS), // catalog 展平：路由与 AI 描述同源
autoNavigate: true, // 默认开（已确认）；用户可在面板设置关闭（持久化后不回弹）
```

#### 4.4.3 Provider 集成（ai-base `src/provider/AIChatProvider.tsx`）

- mount effect：`registerNavigationHandler(resolved.navigate)`；卸载时注销（可选：置空）；
- 初始化 `autoNavigate` state：`getUserHabit('chat.autoNavigate', resolved.autoNavigate)`；
- `AIChatLayoutContextValue` 增加 `autoNavigate: boolean` 与 `setAutoNavigate: (v: boolean) => void`（内部调用模块 `setAutoNavigate` + `setState` 驱动 UI 重渲染）；
- `useAIChatLayout` 消费者无需改动（context 值新增字段，AIChatPanel 读即可）。

#### 4.4.4 页面级覆盖（ai-base `src/provider/AIChatPageScope.tsx`）

`AIChatPageScopeConfig` 增加 `semanticRoutes`、`autoNavigate`、`navigate` 三个可选字段并透传合并（`useEffectiveAIChatConfig` 对应补充）。**合并语义区分**：`autoNavigate`/`navigate` 为页面覆盖（`页面值 ?? 根值`）；`semanticRoutes` 为**合并**（根清单 concat 页面清单，按 `path` 去重后整体注入渲染，页面可追加专属页面语义，不做覆盖）。典型用法：某页面 `autoNavigate={false}` 关闭该页内自动跳转；某页面追加自己的 `semanticRoutes`。

### 4.5 Header 设置入口与开关（ai-base `src/ui/AIChatPanel.tsx` + `.css`）

在 `chatHeader` 的 `Space` 中、会话列表按钮之前插入"设置"按钮：

- 图标 `SettingOutlined`（text 按钮，复用 `aibase-chat-header-btn` 类）；
- 点击弹出 `Popover`（`placement="bottomRight"`，与现有会话列表 Popover 一致），标题"AI 助手设置"；
- 内容：一行 `Switch`（`checked = autoNavigate`，onChange 调 `setAutoNavigate`）+ 说明文案：
  - 开启："AI 判断需要进入结果或资源页面时自动跳转。"
  - 关闭："自动跳转已关闭：AI 不会跳转页面，需要时可在此重新开启。"
- 状态来自 `useAIChatLayout()` 的 `autoNavigate / setAutoNavigate`。

样式追加少量 CSS（开关行 flex 布局、文案次要色），不引入新依赖。

### 4.6 旧硬编码跳转桥的处置（`frontend/src/ai/toolMutation.ts`）

**推荐方案：删除**，理由：它是"僵硬"的根源，且其意图已被 `navigate_to_page` + 语义路由完整取代。具体改动：

- 删除 `installToolNavigationBridge()` 及其全部私有常量/函数：`DOMAIN_ROUTES`、`WRITE_ACTIONS`、`READ_ACTION_RE`、`NAVIGATION_TOOL_SUFFIX`、`extractAction`、`resolveToolNavigationPath`；
- 移除 `resolveApiServiceWorkflowToolNavigation` 对旧桥的依赖：其 import 与调用随桥删除，但**工作流导航逻辑本身保留**，改由 4.7 描述的独立订阅承接（见决策点 D2）；
- **保留不动**：`installServerToolMutationBridge`、`routeMutationToSurfaces`、`setupAIMutationRouter`（mutation 分发/页面数据刷新与跳转解耦，是 AIBase 成熟的另一机制）。

> 保守备选：若担心删除后回归面大，可先保留 `DOMAIN_ROUTES` 桥但受 `getAutoNavigate()` 开关控制（关=不跳），作为过渡。方案默认按"删除"推进，最终由评审定（决策点 D1）。

### 4.7 ApiServices 工作流特例（`frontend/src/pages/ApiServices/ai/apiServiceWorkflowNavigation.ts`）

现状：在 create/edit/test 工作流页内，写工具成功后"创建→跳 edit 继续编辑"，其余写工具抑制跳转（留在当前页）。这是**页面内工作流推进**，不是跨页跳转，且依赖工具结果中的 `serviceId`（AI 通过语义路由参数化也能表达，但需从 Tool 结果取 id，复杂度高、收益低）。

本期：**保留原逻辑**，但在删除旧桥后需把它从 `installToolNavigationBridge` 中剥离，改为独立订阅（`subscribeToolInvoke`）或直接保留在 `setupAIMutationRouter` 内注册，使其不再依赖被删除的桥函数。可选 P6 收编进 AI 决策（见 4.9）。

### 4.8 交互边界与上下文保留

- 跳转是 SPA 内路由切换：`AIChatProvider` 位于 `App.tsx` 顶层、`BrowserRouter` 之下，切换页面不销毁 Provider，会话与消息保留（现状已如此）；
- 页面切换会触发 `AIChatPageScope` 变化（skills 重载），属既有机制，无新增处理；
- `navigate_to_page` 返回 `disabled/invalid_target` 时**不视为 Tool 失败**：不触发 auto-continue 重试、不 blame 模型，仅作为结构化结果让 AI 组织回复。

### 4.9 可选后续（本期不做，仅记录）

- P6：把 ApiServices 工作流导航收编为"语义路由 + AI 决策"（需 AI 能从 Tool 结果提取 `serviceId` 并传参）；
- 分组 wrapper 语义自动推导：catalog 的 `scope` wrapper 与 `domain` 目前人工对齐，后续可由 wrapper 声明自动生成（低优先）；
- header 设置面板扩展：模型选择、面板宽度等后续配置项放入同一 Popover。

---

## 五、涉及文件清单

### 5.1 `@eadaf/ai-base`（`package/ai-base/src/`）

| 文件 | 改动 |
|---|---|
| `types.ts` | 新增 `SemanticRoute`/`SemanticRouteParam`/`NavigationRequest`/`NavigationResult`；`AIChatConfig`/`ResolvedAIChatConfig` 加 `semanticRoutes`/`autoNavigate`/`navigate` |
| `config/runtime.ts` | `resolveConfig` 补默认值（`semanticRoutes: []`、`autoNavigate: true`、`navigate: undefined`） |
| `navigation/navigationChannel.ts`（新） | 导航执行器注册/查询 + autoNavigate 状态（内存 + userHabit 持久化 + 订阅） |
| `registry/builtinTools.ts` | `NAVIGATE_TO_PAGE_TOOL` 常量、独立 `NAVIGATE_TO_PAGE_OPENAI_TOOL` schema（**不进** `HARNESS_OPENAI_TOOLS`）、handler（开关拦截、执行器透传）；`HARNESS_TOOL_NAMES` 追加；register/unregister 补充 |
| `chat/useAIBaseChat.ts` | openaiTools 组合中按 `semanticRoutes` 非空条件注入 `NAVIGATE_TO_PAGE_OPENAI_TOOL`（与 `harnessTools` 并列、无条件于结构化终止开关） |
| `chat/autoContinuePolicy.ts` | `STRUCTURED_HARNESS_TOOL_NAMES` 增加 `navigate_to_page`，避免被误判为业务成功工具 |
| `registry/skillLoader.ts` | `buildCombinedSystemPrompt` 注入「可用页面」段：调用 `semanticRoutesToMarkdown`（ai-base 内置）渲染清单 + 导航协议 |
| `navigation/semanticRoutesToMarkdown.ts`（新） | 纯函数：`SemanticRoute[]` → prompt 文本（按 domain 分组、hidden 过滤、空数组返回空串） |
| `provider/AIChatProvider.tsx` | 注册导航 handler、初始化 autoNavigate、context 暴露字段 |
| `provider/context.tsx` | `AIChatLayoutContextValue` 增加 `autoNavigate`/`setAutoNavigate` |
| `provider/AIChatPageScope.tsx` | 透传 `semanticRoutes`/`autoNavigate`/`navigate` |
| `ui/AIChatPanel.tsx` | header 设置按钮 + 自动跳转 Switch + 说明 |
| `ui/AIChatPanel.css` | 设置面板少量样式 |
| `navigation/navigationChannel.verify.ts`（新） | 状态/持久化/订阅/注册查询断言 |
| `navigation/semanticRoutesToMarkdown.verify.ts`（新） | 分组、hidden 过滤、空数组返回空串断言 |
| `registry/navigateTool.verify.ts`（新） | 开关分支、无 handler、结果透传断言 |

### 5.2 frontend

| 文件 | 改动 |
|---|---|
| `src/routes/catalog.tsx`（新） | 路由 catalog 单一来源：9 组 `RouteGroupCatalog`（分组 wrapper + 页面条目：路径模板/懒加载组件/语义信息 + redirect）；`toSemanticRoutes()` 展平格式化；`RouteScopeGroup`/`RouteCatalogEntry`/`RouteCatalogRedirect` 类型 |
| `src/routes/index.tsx` | 业务路由改为 `buildRoutesFromCatalog(EADAF_ROUTE_GROUPS)` 生成（嵌套 wrapper 与 `<Navigate>` 重定向）；保留布局/认证/公开文档/错误页手写；`NavigationBinder` 不变 |
| `src/ai/semanticRoutes.ts`（新） | `resolveSemanticRoutePath`/`isAllowedNavigationTarget` + 安全校验（纯函数，消费 `SemanticRoute[]`，数据来自 catalog 展平；markdown 渲染在 ai-base） |
| `src/ai/semanticRoutes.verify.ts`（新） | catalog 约束（path 唯一/参数一致性/组件非空）、`toSemanticRoutes` 展平、模板解析、白名单、注入防护断言 |
| `src/config/aiChat.ts` | 注入 `semanticRoutes: toSemanticRoutes(EADAF_ROUTE_GROUPS)`/`autoNavigate`/`navigate` |
| `src/ai/toolMutation.ts` | 删除旧导航桥及相关常量；保留 mutation 分发；剥离工作流导航订阅 |
| （无） | `src/utils/navigation.ts` 不改动 |

### 5.3 backend

无改动。

---

## 六、分阶段实施计划

> 每阶段独立可验证、可回退；阶段间无强依赖时可并行（1→2 顺序，3 可与 2 并行，P4a~c 依赖 P2 的类型定义，P4a→P4b 顺序）。

| 阶段 | 内容 | 产出 | 验收 |
|---|---|---|---|
| P1 | ai-base 类型与导航通道（types/runtime/navigationChannel + verify） | 类型、默认值、模块 store | verify 通过 |
| P2 | `navigate_to_page` harness + system prompt 注入（builtinTools/skillLoader + verify） | 工具与协议段 | verify 通过；`pnpm build` |
| P3 | Provider/PageScope/header UI（开关 + 持久化） | 设置入口与开关联动 | 手动切开关，状态持久化 |
| P4a | 新建路由 catalog + 格式化（`catalog.tsx` + `toSemanticRoutes` + `semanticRoutes.ts` 纯函数 + verify）；**不改现有 `routes/index.tsx`** | 语义数据就绪 | verify 通过；前端构建通过 |
| P4b | `routes/index.tsx` 迁移为 catalog 派生（`buildRoutesFromCatalog` + 特殊路由保留手写）+ 全量回归 | 单源落地 | `pnpm build` 通过；全站路由手动冒烟（每域至少 1 页可进） |
| P4c | `aiChat.ts` 接线：`semanticRoutes: toSemanticRoutes(EADAF_ROUTE_GROUPS)` + navigate 执行器 | AI 可跳转 | 手动跳转场景 |
| P5 | 删除旧导航桥（toolMutation 改造）+ 全量构建回归 | 干净化 | `pnpm build` 通过，手动场景回归 |
| P6（可选） | ApiServices 工作流导航收编 | — | — |

P2 与 P3 均可独立验证：P2 的端到端验证依赖 `semanticRoutes` 非空 + `navigate` 执行器（均为 P4c 接线），故 P2 阶段在 ai-base 内部用 verify 覆盖「开关分支/无执行器/结果透传」，端到端留待 P4c 完成；若需提前联调，可在 `createAIChatConfig` 临时注入一条最小清单 + 临时 navigate 函数（P4c 正式落地时替换）。P3 加 UI 控制；P4c 提供真实清单后跳转目标才完整。

P4a 与 P4b 分离是刻意为之：先让 catalog 成为「数据事实」并用 verify 锁定约束，再迁移 `routes/index.tsx`（回归面最大的单步，单独提交、可回退）；P4b 完成后「改路由只改 catalog」才成立。

---

## 七、验证计划

### 7.1 单元/回归验证（沿用项目 `.verify.ts` 模式，`node --import tsx …`）

- `navigationChannel.verify.ts`：autoNavigate 默认值/持久化读写/订阅通知；handler 注册覆盖与查询；
- `navigateTool.verify.ts`：开关开→调用执行器并透传结果；开关关→`disabled` 且不调执行器；无执行器→`no_handler`；执行器返回 `invalid_target` 时原样透传（白名单/非法 path 断言在前端 `semanticRoutes.verify.ts`，职责见 4.2.2 设计取舍）；
- `semanticRoutes.verify.ts`：
  - **catalog 约束**：path 全局唯一、均以 `/` 开头；模板 `:param` 与 `params` 声明一一对应（缺声明/多余声明报错）；每个条目 `component` 非空；`redirect` 条目 `to` 非空；
  - **`toSemanticRoutes` 展平**：hidden 过滤、redirect 忽略、按 domain 分组、无重复 path；
  - `resolveSemanticRoutePath` 模板替换、缺参返回 null、非法参数/注入（`..`、`//`、`http:`、`javascript:`）被拒、参数编码；
  - `isAllowedNavigationTarget` 合法/非法/参数化 URL；（`semanticRoutesToMarkdown` 渲染断言在 ai-base 侧 `semanticRoutesToMarkdown.verify.ts`，见 5.1）

### 7.2 构建验证

```bash
cd package/ai-base && pnpm build     # tsup 产物
cd frontend && pnpm refresh:ai-base                       # 刷新依赖到前端
cd frontend && pnpm build                                 # tsc -b 类型检查 + vite build
```

### 7.3 手动场景（dev：backend 9526 + frontend 9527）

1. **默认开，写操作跳转**：对话"创建一个成员/服务商"，工具 `verified=true` 后 AI 主动 `navigate_to_page` 到目标页并展示；
2. **关闭开关**：header 设置关闭自动跳转 → 同一请求 → AI 说明"自动跳转已关闭，未跳转"，不跳；
3. **重新开启**：开关打开后再次请求可跳；
4. **该跳没跳反例修复**：创建资源后 AI 应跳**编辑/详情页**（带 `:id` 参数化路径）而非列表页；
5. **不该跳不跳**：纯问答（"成员模块有哪些角色"）不跳；当前页已展示结果不跳；
6. **用户明确要求**："打开服务商管理"→ 跳 `/ai_management/providers`；
7. **幻觉防护**：对话诱导 AI 编造 path（如 `/ai_management/xxx`）→ 返回 `invalid_target`，不跳转，AI 告知用户页面不存在；
8. **持久化**：关闭开关 → 刷新页面 → 仍为关闭；改 config 默认 true 不回弹；
9. **页面级覆盖**：某页 `AIChatPageScope autoNavigate={false}` 时该页内不跳，其他页正常；
10. **回归**：物化执行后页面数据自动刷新（mutation 分发）不受影响；会话历史、页面切换保留。

---

## 八、风险与决策点

> D1~D4 已由用户确认；D5/D6 为默认推荐，实施时如有异议可提出。

| 编号 | 决策点 | 结论 | 说明 |
|---|---|---|---|
| D1 | 旧 `DOMAIN_ROUTES` 硬编码桥：删除 or 保留为开关控制 legacy | **已确认：删除** | 僵硬根源；AI 决策已覆盖其意图，P5 执行 |
| D2 | ApiServices 工作流导航（创建后跳 edit）归属 | **已确认：保留原逻辑**（本期） | 页面内工作流推进；从旧桥剥离为独立订阅，P5 执行；可选 P6 收编 |
| D3 | `autoNavigate` 默认值 | **已确认：true** | 与"可以关闭"语义一致（默认可用、可关）；关闭后 AI 仍会表达意图并提示开启 |
| D4 | 语义路由来源 | **已确认：catalog 单一来源派生** | `routes/index.tsx` 与 AI 描述同源（4.1.2/4.1.3）；特殊路由保留手写 |
| D5 | 开关是全局还是按页面 | 全局持久化 + 页面级可覆盖 | 单 Provider 场景；若未来多 Provider 并存需确认全局 store 语义 |
| D6 | `navigate_to_page` 对 AI 可见性 | `semanticRoutes` 非空时无条件注入（harness 级） | 与 `ask_user` 同级，不依赖 Skill 关联；避免"页面没这个工具就跳不了" |

### 风险清单

1. **Prompt token 增长**：路由清单注入 system prompt 会占用上下文。缓解：渲染为紧凑行式、description 控制 1~2 句、`hidden` 过滤无关页；
2. **AI 乱跳**：描述准则 + 白名单双保险；`invalid_target` 不触发重试循环；
3. **catalog 改造回归（`routes/index.tsx` 迁移）**：业务路由从手写改为派生，是本期回归面最大的单步。缓解：P4b 单列阶段、构建 + 全站路由手动冒烟、可单独回退；特殊路由（布局/认证/公开/错误页）保留手写，降低迁移范围；
4. **删除旧桥回归**：D2 工作流导航需先剥离再删桥，分步提交（P5 单列）；
5. **开关竞态**：模块级全局 store，多实例/多页面并发读写以最后写入为准（当前单 Provider 无此问题，标注留档）。

---

## 九、不做的事（Scope Guard）

- 不重构 `routes/index.tsx` 为集中式路由配置；
- 不改后端、不动 DB、不迁移 Skill 数据；
- 不新增跳转历史/回退能力；
- 不把业务 `*_navigate` 工具合并进 `navigate_to_page`；
- 不在本期处理多 Provider / 微前端场景的导航通道隔离（设计上已预留 namespace 空间，如需可后续扩展 `registerNavigationHandler` 支持作用域）。
