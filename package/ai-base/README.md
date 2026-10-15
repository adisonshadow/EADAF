# @eadaf/ai-base

EADAF AI 聊天基础库。已发布到 npm：[`@eadaf/ai-base`](https://www.npmjs.com/package/@eadaf/ai-base)。宿主应用通过 `AIChatProvider` 接入侧边栏 / 漂浮按钮式 AI 助手，并可在页面内配置 Skill、Tool、Prompts、Chat 引用等能力。

> **架构权威文档**（定位、插件内核、多应用扩展）：[新Agent架构方案](https://github.com/adisonshadow/UAC2/tree/main/docs/TODOs/新Agent架构方案)（尤其 [08-多应用扩展](https://github.com/adisonshadow/UAC2/blob/main/docs/TODOs/新Agent架构方案/08-多应用扩展.md)、[05-展示协议](https://github.com/adisonshadow/UAC2/blob/main/docs/TODOs/新Agent架构方案/05-展示协议.md)）。

## 安装

**独立项目（从 npm 安装）：**

```bash
pnpm add @eadaf/ai-base
# 或
npm add @eadaf/ai-base
```

宿主还需自行安装 peer 依赖：`react`、`react-dom`、`antd`、`@ant-design/icons`、`@ant-design/x`、`@ant-design/x-sdk`、`@ant-design/x-markdown`、`@ant-design/x-card`（版本见本包 `peerDependencies`）。

```tsx
import { AIChatProvider } from '@eadaf/ai-base';
import '@eadaf/ai-base/style.css';
```

**本仓库（UAC2 monorepo）不要执行 `pnpm add @eadaf/ai-base`。** `frontend` 与 `app_example` 使用 `"@eadaf/ai-base": "workspace:*"` 链接本地源码。`app_example` 仅作演示与联调沙箱。

## 本仓库改源码后如何同步

运行时通过包 `exports` 加载 **`dist/`**。改动本包源码后需重新 build；UAC2 宿主可用 `pnpm refresh:ai-base`（若已配置）清除缓存并同步。

```bash
pnpm build
```

修改 **导出** 或 **dist 行为** 后若新 API 不生效，重新 build、刷新宿主依赖链接，并重启 frontend dev。

---

## 快速接入

```tsx
import { AIChatProvider } from '@eadaf/ai-base';
import '@eadaf/ai-base/style.css';

<AIChatProvider
  config={{
    apiBase: '/api',
    getToken: () => localStorage.getItem('token'),
    applicationId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // 可选；业务应用必填
    systemPromptPrefix: '你是助手…',
    welcome: { title: 'Hi', description: '直接描述需求即可' },
    prompts: [{ key: '1', description: '你可以帮我做什么？' }],
    hiddenPaths: ['/auth/login'],
    // 业务 Tool 中文短标题（勿写进 ai-base 内核；由宿主 / 业务包注入）
    toolDisplayNames: {
      acme_list_orders: '列出订单',
    },
  }}
  plugins={[/* 可选：宿主 pack / 业务 pack */]}
>
  {children}
</AIChatProvider>
```

路由 wrapper 内再用 `AIChatPageScope` 覆盖页面级 Skill / 欢迎语 / 静态 prompts：

```tsx
import { AIChatPageScope } from '@eadaf/ai-base';

<AIChatPageScope
  scopeSlug="orders"
  fallbackSkillSlugs={['acme-order-ops']}
  headerCaption="订单助手"
  systemPromptPrefix="你是订单作业助手…"
  welcome={{ title: '订单作业', description: '…' }}
>
  <Outlet />
</AIChatPageScope>
```

---

## 第三方 / 业务应用接入（EADAF 支撑的应用）

ai-base 是**内核**；EADAF 是**数据底座宿主**；FMMS 等业务系统是**插件包**。业务应用**不要**把领域 Tool 名硬编码进 `@eadaf/ai-base`。

```text
业务前端 / EADAF 前端
  AIChatProvider(applicationId) + PageScope + plugins
        │
        ▼
@eadaf/ai-base（Cordis：tools / surfaces / harness …）
        │
   ┌────┼────┐
EADAF host  业务 pack（如 @fmms/ai-pack）
```

| 层 | 谁维护 | 放什么 |
|----|--------|--------|
| 内核 | `@eadaf/ai-base` | 对话循环、信封校验、InvocationCard、harness Tool、内核展示名 |
| 宿主 | EADAF frontend | bizdata / apiservice 等 Tool + `toolDisplayNames` |
| 业务包 | 业务仓库 | 领域 Tool / Skill / 自定义 Surface kind / 展示名 |
| 治理 DB | aibase | application 可见 Skill、Skill↔Tool **授权名**、启停 |

### 最小业务包

推荐用宿主提供的 `createBusinessPluginPack`（或等价 `AgentPlugin`）：

```tsx
import { createBusinessPluginPack } from '@/ai/createBusinessPluginPack'; // 宿主模板
// 或自行实现 AgentPlugin：inject: ['tools']，apply 里 ctx.tools.register / registerToolDisplayNames

export const acmeAiPack = createBusinessPluginPack({
  name: 'acme-ai-pack',
  tools: [
    {
      name: 'acme_list_orders',
      description: '列出订单',
      parameters: { type: 'object', properties: { status: { type: 'string' } } },
      handler: async (args) => { /* 已鉴权会话内调业务 API */ },
    },
  ],
  toolDisplayNames: {
    acme_list_orders: '列出订单',
  },
});

<AIChatProvider
  config={{
    applicationId: ACME_APP_ID,
    toolDisplayNames: { /* 也可在 config 一次性注入 */ },
    // …
  }}
  plugins={[eadafHostToolsPlugin, acmeAiPack]}
>
```

也可仅通过配置注入展示名（不经插件）：

```tsx
import { registerToolDisplayNames } from '@eadaf/ai-base';

// Provider 会按 config.toolDisplayNames 自动 register；也可手动：
const dispose = registerToolDisplayNames({ acme_list_orders: '列出订单' });
// unmount 时 dispose()
```

### 必须遵守

1. Tool `name` 全局唯一（建议 `acme_` / `fmms_` 前缀）
2. Skill `slug` 唯一；`is_dedicated` + `skill_applications` 绑定该 `applicationId`
3. 页面用 `fallbackSkillSlugs` 挂业务 Skill；目录按需 `skill` 加载正文
4. UI 触发 AI：**只** `sendMockUserMessage`，禁止直连 chat completions / toolInvoke
5. 参数 schema 以插件 / `registerFunctionCall` 为运行时权威；DB 只做授权（见架构 [03](../../../docs/TODOs/新Agent架构方案/03-Tool与参数契约.md)）
6. 自定义结果卡：`ctx.surfaces.registerKind('acme_order_table', Comp)`，handler 返回 `display.kind`

> 只要 **REST 数据 API**、不要嵌入 Chat：走仓库 [`docs/external-app-integration-guide.md`](../../../docs/external-app-integration-guide.md)。  
> 要嵌入同一套 AI Chat 并扩展自动化：走本节插件包 + application 绑定。

---

## 语音输入

Sender 使用 `@ant-design/x` 内置语音录入（麦克风 → 转写进输入框，交互类似 Cursor）。  
仅当当前选中模型的 `capabilities` 包含 **`audio_input`** 时显示语音按钮；与附件模态 `inputTags: audio`（上传音频文件）相互独立。浏览器需支持 SpeechRecognition，并授予麦克风权限。

## 外观主题（light / dark / auto）

AI 助手侧栏支持独立主题，**只影响 AI 聊天 UI**（侧栏、浮钮、其弹出层），不改变宿主应用的 `ConfigProvider`。

| 模式 | 行为 |
|------|------|
| `light` | 固定浅色（**默认**） |
| `dark` | 固定深色 |
| `auto` | 跟随系统 `prefers-color-scheme` |

优先级：`userHabit`（用户在设置面板切过一次）覆盖 `config.theme`；切过一次不回弹。

```tsx
<AIChatProvider
  config={{
    // …
    theme: 'auto', // 可选，默认 'light'
  }}
>
```

运行时切换（模块级 API，与 `setAutoNavigate` 同模式）：

```tsx
import {
  setAIBaseTheme,
  getAIBaseTheme,
  getResolvedAIBaseTheme,
  subscribeAIBaseTheme,
} from '@eadaf/ai-base';

setAIBaseTheme('dark');
getAIBaseTheme();           // 'light' | 'dark' | 'auto'
getResolvedAIBaseTheme();   // 'light' | 'dark'（auto 已展开）
subscribeAIBaseTheme((mode) => { /* … */ });
```

面板右上角 **设置** 中也可切换「浅色 / 深色 / 自动」。另含：**思考内容显示方式**（折叠 / 只显示3行 / 显示全部，默认折叠）、**并行工具调用数**（默认 10）、**面临抉择时倾向**（让用户抉择 / 让 AI 抉择）、自动跳转。Markdown 渲染会按解析后的主题切换 `x-markdown-light` / `x-markdown-dark`。

---

## Skill 与 Tool

### `applicationId` 与 Skill 加载

| 是否配置 `applicationId` | 加载的 Skill |
|--------------------------|--------------|
| **已配置** | 远端：**全局 Skill** + **绑定该应用的专用 Skill**；再合并本地 **`fallbackSkillSlugs`** |
| **未配置** | **仅**本地 **`fallbackSkillSlugs`** |

- 远端 Skill 通过 `/v1/ai/capabilities?applicationId=...` 获取。
- **`fallbackSkillSlugs`** 由 `AIChatPageScope` 或根 `AIChatProvider` 配置，例如 `bizdata-model-design`。
- 同 slug 合并时，**本地配置覆盖远端**。
- 页面级 **`applicationId`** 会覆盖根配置；未传则继承根值。

### 可用 Tool 来源

| 来源 | 说明 |
|------|------|
| Skill 关联 Tool | 来自已加载 Skill，含 client / server / `server_builtin` 类型 |
| 本地 client Tool | `registerFunctionCall` 注册；可为 Skill 关联的 client Tool 提供 handler，也可注册纯本地 Tool |
| Harness Tool | `ask_user` 始终注入；`update_plan` / `task_complete` 在 `enableStructuredTermination` 时注入；`navigate_to_page` 在 `semanticRoutes` 非空时注入（见下方「Agent 内置 Tool」） |

**合并规则**：`openaiTools` = Skill 关联 Tool + Harness Tool（含条件注入的 `navigate_to_page`）+ 本地 `registerFunctionCall`；同名时 **Skill 侧 schema 优先**，本地补充 Skill 未覆盖的 Tool。

```tsx
import { registerFunctionCall, unregisterFunctionCall } from '@eadaf/ai-base';

// 应用级：App 入口集中注册（如宿主的 AIChatClientToolsRegistrar）
registerFunctionCall({
  name: 'bizdata_list_entities',
  description: '列出业务数据实体',
  parameters: { type: 'object', properties: {} },
  handler: async (args) => { /* 调用 API */ },
});

// 页面级：进入注册、离开注销
useEffect(() => {
  registerFunctionCall({ name: 'page_only_tool', /* … */ });
  return () => unregisterFunctionCall('page_only_tool');
}, []);
```

注册/注销后通过 `subscribeFunctionCalls` 自动刷新当前会话可用 Tool 列表。

### 同一轮 Tool 并行执行

当模型在一轮回复中返回多个 `tool_calls` 时，SDK 会**并发执行**（上限由设置 **并行工具调用** 控制，默认 **10**，范围 1–32；`config.toolConcurrency` / `userHabit`）而非串行，降低多工具场景延迟。每个工具以统一 **InvocationCard**（标题栏 + 可折叠内容区）按输出顺序渲染。工具间存在数据依赖时，模型会拆成多轮（下一轮依赖上一轮结果），多轮之间仍为串行。

### Tool 展示：InvocationCard 与 `display`

- 调用行统一为 **InvocationCard**：icon + 标题 + 副标题；执行中扫光；结束后成败反馈；悬停可展开/折叠内容。
- 结果正文按 `ToolResponse.display.kind` 渲染（`table` / `entity` / `json` / …）；业务可 `registerKind` 自定义。
- **业务 Tool 中文名**用 `toolDisplayNames` / `registerToolDisplayNames` 注入；内核只带 harness / `aibase_*` 默认名。
- 折叠策略由 `ctx.surfaces` presentation 清单驱动（技术类默认收起），详见架构 [05](../../../docs/TODOs/新Agent架构方案/05-展示协议.md)。

### Tool 分派规则（executionType）

| `executionType` | 本地有同名 handler | 行为 |
|-----------------|-------------------|------|
| `client` | ✅ | 本地执行（`functionRegistry`） |
| `client` | ❌ | 抛错（Client Tool 未注册 handler） |
| `server_http` / `server_builtin` | 任意 | **走后端**（按声明执行） |
| `server_*` 且 `allowClientOverride: true` | ✅ | 本地执行（显式覆盖） |
| 无 meta（仅 `exposeAllClientTools`） | ✅ | 本地执行 |

> ⚠️ **行为变更**：历史上「只要本地有同名 handler 就拦截 server 工具」的隐式行为已移除。
> 如需让本地 handler 接管 server 类型工具，必须在 Tool 元数据上显式声明 `allowClientOverride: true`。

### `http_request`（类 curl，server_builtin）

后端内置 Tool **`http_request`**（`executionType: server_builtin`）供 AI 在**没有专用 Tool** 时探查 HTTP API，语义类似 curl，但由后端用 Node `fetch` 执行（**不** `exec curl`，避免命令注入）。

| 场景 | 行为 |
|------|------|
| 受信主机（本机 EADAF / `AI_HTTP_TRUSTED_HOSTS`） | **强制注入**当前用户 JWT（依赖宿主 `getToken` 透传） |
| 相对路径（如 `/api/v1/...`） | 解析为本机 API，按受信主机处理 |
| 外部 URL | **禁止**附带用户 JWT；可选手动 `headers`（勿填登录态） |
| 响应体 | 过大时截断并标注 |

参数摘要：`method`（默认 GET）、`url`（必填）、`headers?`、`body?`、`timeoutMs?`。

接入方式：在管理后台 / 种子数据中把 `http_request` 关联到需要该能力的 Skill；前端无需 `registerFunctionCall`——按上表 `server_builtin` 规则走后端 `toolInvoke`。联调也可直接调 `POST /api/v1/ai/http-request`（与 Tool 同一实现）。

### Tool 结果体积管控

Tool 结果在回灌对话历史前会按**字符预算**裁剪，避免大结果撑爆上下文。预算优先级：

**本地 def `resultBudget` > 远端 Tool `resultBudget` > `AIChatConfig.maxToolResultChars`（默认 8000）**

```tsx
// 全局默认
<AIChatProvider config={{ maxToolResultChars: 6000 }}>

// 单个 Tool 级覆盖（本地 handler）
registerFunctionCall({
  name: 'search_orders',
  resultBudget: { maxChars: 2000 }, // 这个工具结果很大，进一步收紧
  // …
});
```

超预算时保留头部并追加 `[truncated: original N chars, budget M]` 标注，模型可据此换更聚焦的查询。

### 命名空间与生命周期

`registerFunctionCall` 支持按 `namespace` 隔离（默认 `'default'`，向后兼容）。
微前端 / 多面板场景可按应用或路由 scope 注册，避免同名 Tool 互相覆盖：

```tsx
registerFunctionCall(def, { namespace: 'sales-app' });
getFunctionCallDef('search_orders', 'sales-app'); // 先查 sales-app，回退 default
unregisterFunctionCall('search_orders', 'sales-app');
clearFunctionCalls('sales-app'); // 清空某命名空间
```

组件级注册推荐用 `useFunctionCall` Hook，**卸载即自动注销**：

```tsx
import { useFunctionCall } from '@eadaf/ai-base';

function PageWithTools({ entityId }) {
  useFunctionCall(
    {
      name: 'page_only_tool',
      description: '…',
      parameters: { type: 'object', properties: {} },
      handler: async (args) => { /* … */ },
    },
    { enabled: Boolean(entityId) },
  );
  // …
}
```

### Skill 完成策略（声明式 auto-continue）

当模型「只输出步骤说明、却没真正调用 Tool」时，SDK 会按各 Skill 声明的**完成策略**
决定是否自动注入续调指令。策略可由后端 Skill 元数据（`completion_strategy` 字段）下发，
也可由前端注册表覆盖：

```tsx
import { registerSkillCompletionPolicy } from '@eadaf/ai-base';

registerSkillCompletionPolicy('bizdata-model-design', {
  requiredTools: ['bizdata_validate_model'], // 完成前必须调用过
  completionKeywords: ['建模完成', '校验通过'], // 文本命中即视为完成
  blockKeywords: ['接下来您可以', '建议您'],    // 文本命中即禁止续调
  continuousExecution: false,                  // 连续执行型（如 test-fix 循环）
});
```

| 字段 | 作用 |
|------|------|
| `requiredTools` | 本轮结束若仍有未调用的关键 Tool → 续调 |
| `completionKeywords` | 文本命中 → 视为任务完成，停止续调 |
| `blockKeywords` | 文本命中（如收尾建议句）→ 停止续调 |
| `continuousExecution` | 连续执行型 Skill，不受「一次一事」限制 |

SDK 自身不包含任何业务工具名集合或中文正则，新业务接入只需声明策略，无需改 SDK 源码。

---

## Agent 内置 Tool（Harness）

对话循环会向 LLM **始终或按配置**注入若干流程控制 Tool（不属于业务 Skill 关联）：

| Tool | 何时注入 | 作用 |
|------|----------|------|
| `ask_user` | **始终** | mid-task HITL：向用户展示结构化选择题并挂起循环 |
| `update_plan` | `enableStructuredTermination: true` | 维护任务清单（Plan） |
| `task_complete` | `enableStructuredTermination: true` | 显式验收并终止循环 |
| `navigate_to_page` | `semanticRoutes` **非空** | 按语义路由清单跳转业务页（不依赖结构化终止开关） |

```tsx
<AIChatProvider
  config={{
    // …
    enableStructuredTermination: true, // 注入 update_plan / task_complete，并启用「默认续命、task_complete 才停」
    semanticRoutes,                    // 非空时注入 navigate_to_page +「可用页面」协议
    autoNavigate: true,                // 默认 true；面板设置可关，userHabit 持久化
    navigate: async ({ path, params }) => { /* 白名单 + history.push */ },
  }}
>
```

> `navigate_to_page` **不进入** `HARNESS_OPENAI_TOOLS` 常量数组；仅在清单非空时由会话层单独注入，避免空清单时多余暴露。失败（`disabled` / `invalid_target` / `no_handler`）返回 `kind: success` 信封并携带原因，避免被当成「关键 Tool 校验失败」而无限续调。写操作成功后，SDK 会在回灌 LLM 的信封上附加 `agentHint`，并在协议里把「跨步骤工作流每个里程碑跳一次」写成硬约束（同类型批量创建中途仍可暂不跳）。

### `ask_user`：向用户询问并确认选择

用于方案取舍、危险写操作前确认、多路径决策等**任务中途**决策门。模型调用后：

1. Tool 返回信封 `kind: 'user_choice_request'`（**不是**业务写成功）
2. 聊天循环 **hard-stop**（`waiting_user_choice`），禁止 auto-continue / nudge
3. 助手消息中渲染 **Choice Card**（`UserChoiceCard`）
4. 用户提交后，SDK 通过 `sendMockUserMessage` 注入格式化消息并续跑 Agent

**参数摘要**：

| 字段 | 说明 |
|------|------|
| `question` | 展示给用户的问题 |
| `mode` | `single`（单选）或 `multi`（多选） |
| `options` | `{ id, label, description? }[]`，通常 2–5 项（推荐 3） |
| `allowCustom` | 是否显示「其他」输入；`single` 默认 `true`，`multi` 默认 `false` |
| `minSelect` / `maxSelect` | 仅 `multi`：最少 / 最多选择数 |

提交后写入对话历史的文案形如：

```text
【用户选择】
题：……
模式：单选
已选：opt_b（方案 B）
自定义：（无）
```

也可在宿主侧复用格式化工具：

```tsx
import { formatUserChoiceMessage, ASK_USER_TOOL } from '@eadaf/ai-base';
```

> **与「下一步建议」的边界**
>
> | 机制 | 时机 | UI |
> |------|------|-----|
> | `ask_user` | 任务**中途**决策门 | Choice Card（单选/多选 + 可选自定义） |
> | `a2ui-commands` / `task_complete.next_steps` | 阶段**完成后**的可选快捷动作 | A2UI 下一步按钮 |
>
> 面板设置 **面临抉择时倾向**：`user`（默认）时协议要求方案取舍走 `ask_user`；`ai` 时常规取舍可由模型自决，危险/不可逆仍建议询问。禁止仅用「请确认后回复」等口头话术代替 `ask_user`（口头等待确认正则仍保留作兜底 hard-stop）。

全局行为约定写在 Framework Skill `aibase-chat-framework`；开启结构化终止时，系统提示还会注入含 `ask_user` 的执行协议。

### `navigate_to_page`：语义化路由跳转

由宿主提供**页面语义清单**与**跳转执行器**；ai-base 不依赖 `react-router`。

```tsx
import type { AIChatConfig, SemanticRoute } from '@eadaf/ai-base';
import {
  setAutoNavigate,
  getAutoNavigate,
  navigateToPage,
  semanticRoutesToMarkdown,
} from '@eadaf/ai-base';

const semanticRoutes: SemanticRoute[] = [
  {
    path: '/member_org/member/:id/edit',
    title: '编辑成员',
    description: '打开指定成员的编辑页',
    domain: 'member_org',
    params: { id: { type: 'string', description: '成员 id' } },
  },
];

const config: AIChatConfig = {
  semanticRoutes,
  autoNavigate: true,
  navigate: async ({ path, params }) => {
    const target = resolvePath(path, params, semanticRoutes); // 宿主白名单解析
    if (!target) {
      return { navigated: false, reason: 'invalid_target', message: `未知页面: ${path}` };
    }
    history.push(target);
    return { navigated: true, path: target };
  },
};
```

| API / 配置 | 说明 |
|------------|------|
| `semanticRoutes` | 注入「可用页面」Markdown 协议 + 条件注入 `navigate_to_page` |
| `autoNavigate` | 默认 `true`；仅约束 harness `navigate_to_page`，业务 `*_navigate` 不受影响 |
| `navigate` | 白名单校验 + `history.push`；`AIChatProvider` mount 时经 `registerNavigationHandler` 注入 |
| `setAutoNavigate` / `getAutoNavigate` | 运行时开关；面板「自动跳转」与之同步，`userHabit` 持久化 |
| `semanticRoutesToMarkdown` | 将清单渲染为 prompt 协议段（按 `domain` 分组） |

---

## AISurface 与 UI 联动（Mutation）

页面注册 **Surface** 供 AI 读取上下文；Tool 写操作返回 **mutation** 后自动刷新 UI。

```tsx
import { useAISurface } from '@eadaf/ai-base';

useAISurface({
  id: 'bizdata.model-designer',
  domain: 'bizdata',
  label: '业务数据模型设计',
  read: () => ({ selectedEntity, entityCount }),
  refresh: loadSchema,
  applyMutation: (mutation) => { /* 增量 patch 或 fallback refresh */ },
});
```

| API | 说明 |
|-----|------|
| `useAISurface(def)` | 注册/注销页面 Surface |
| `useAIMutationHandler(domain, fn)` | 仅订阅 mutation |
| `subscribeAIMutation` / `emitAIMutation` | 事件总线 |
| `subscribeToolInvoke` | Tool 完成回调（含 result.mutation） |
| `aibase_read_surfaces` | 内置 Tool，读取所有已注册 Surface |

Tool 写操作返回格式：

```typescript
return {
  data: entity,
  mutation: { domain: 'bizdata', type: 'entity.updated', resourceId: entity.id, payload: entity },
};
```

---

## Prompts（建议问题）

欢迎区「你可以试试」的建议问题，支持三层配置：

**优先级**：`useAIChatPrompts` / `setPrompts` **>** `AIChatPageScope.prompts` **>** 根 `AIChatProvider.config.prompts`

### 静态配置

在 `AIChatProvider` 或 `AIChatPageScope` 上传入 `prompts: AIChatPromptItem[]`：

```tsx
prompts={[{ key: '1', description: '列出当前所有实体' }]}
```

### 动态配置（推荐）

页面内按选中项、Tab 等状态切换：

```tsx
import { useMemo } from 'react';
import { useAIChatPrompts } from '@eadaf/ai-base';

function ModelDesigner({ selectedEntity }) {
  const chatPrompts = useMemo(() => {
    if (!selectedEntity) {
      return [
        { key: '1', description: '列出当前所有业务实体' },
        { key: '2', description: '创建一个 sales:order:Order 订单实体' },
      ];
    }
    const label = selectedEntity.label || selectedEntity.code;
    return [
      { key: '1', description: `为「${label}」补充常用字段` },
      { key: '2', description: `为「${label}」自动创建和补齐索引` },
    ];
  }, [selectedEntity?.id, selectedEntity?.label, selectedEntity?.code]);

  useAIChatPrompts(chatPrompts);
}
```

命令式更新（事件回调中）：

```tsx
import { useSetAIChatPrompts } from '@eadaf/ai-base';

const { setPrompts, resetPrompts } = useSetAIChatPrompts();
setPrompts([{ key: '1', description: '为当前实体自动生成关系' }]);
resetPrompts(); // 恢复为 PageScope / 根配置
```

| API | 说明 |
|-----|------|
| `useAIChatPrompts(prompts)` | 声明式；卸载后自动 `resetPrompts` |
| `useSetAIChatPrompts()` | 返回 `{ setPrompts, resetPrompts }` |
| `useAIChatDynamicPrompts()` | 读取当前运行时覆盖值 |

---

## Chat 引用

页面元素可将上下文加入 AI 对话引用区，随下一条消息一并发送。

```tsx
import { useChatReference } from '@eadaf/ai-base';

const { addReference, removeReference, clearReferences, references } = useChatReference();

addReference({
  type: 'entity',
  label: '订单（实体）',
  content: { code: 'sales:order:Order', fields: [/* … */] },
  unique: true, // 同 type 仅保留最新一条
});
```

宿主应用中可配合 `ChatReferenceTarget` 组件（`className: chat-reference-target`）使用。

---

## 程序化发消息

打开 AI 面板并模拟用户发送（与手动点击发送相同流程）：

```tsx
import { sendMockUserMessage } from '@eadaf/ai-base';

sendMockUserMessage('请帮我为当前实体自动创建索引');
```

底层 API：

| API | 说明 |
|-----|------|
| `sendMockUserMessage(text)` | 打开面板 + 发送消息 |
| `sendAIChatMessage(text)` | 仅发送，不强制打开面板 |
| `registerAIChatControls({ openPanel })` | 由 `AIChatProvider` 内部注册 |

---

## 展示模式

| 模式 | 说明 |
|------|------|
| `sidebar` | 默认。右侧固定侧边栏，展开时挤压主内容 |
| `float` | 仅漂浮按钮，面板以浮层打开 |
| `hidden` | 完全不挂载聊天 UI |

```tsx
// 路由层
import { AIChatDisplay } from '@eadaf/ai-base';
<AIChatDisplay mode="hidden"><LoginPage /></AIChatDisplay>

// 页面内 Hook（卸载后恢复 sidebar）
import { useAIChatDisplayMode } from '@eadaf/ai-base';
useAIChatDisplayMode('float');
```

---

## Tool 调用日志（开发）

开发环境可将 client / server Tool 调用输出到浏览器控制台与 dev 终端：

```tsx
import { setToolInvokeLogger, formatToolInvokeError } from '@eadaf/ai-base';

setToolInvokeLogger((entry) => {
  console.log(entry.success ? '✅' : '❌', entry.name, entry.error ?? entry.result);
});
```

宿主可在应用入口通过 `setToolInvokeLogger` / `setupAiToolDevLogger()` 接入。失败时 `entry.error` 已包含 API 返回的 `[HTTP status] message | details`。

---

## 配置项摘要

| 字段 | 必填 | 说明 |
|------|------|------|
| `apiBase` | 否 | API 根路径，默认 `/api` |
| `getToken` | 否 | 鉴权 token 获取函数 |
| `applicationId` | 否 | 应用系统 ID；配置后加载全局 + 专用 Skill |
| `fallbackSkillSlugs` | 否 | 本地 Skill slug 列表 |
| `scopeSlug` | 否 | 页面能力域标识 |
| `systemPromptPrefix` | 否 | 合并进系统提示的前缀 |
| `welcome` | 否 | `{ title, description }` 欢迎区文案 |
| `prompts` | 否 | 静态建议问题列表 |
| `headerCaption` | 否 | 面板标题，默认「AI 助手」 |
| `panelWidth` | 否 | 侧栏宽度，默认 `420` |
| `headerOffset` | 否 | 面板 top 偏移，默认 `64` |
| `defaultOpen` | 否 | 初始是否展开，默认 `true` |
| `hiddenPaths` | 否 | 匹配路径下隐藏 AI UI |
| `exposeAllClientTools` | 否 | 调试：向 LLM 暴露全部本地 client Tool（忽略 Skill 关联限制） |
| `maxToolResultChars` | 否 | 单次 Tool 结果回灌上下文的字符预算上限，默认 `8000` |
| `roundDelayMs` | 否 | 续接循环每轮 LLM 请求最小间隔（毫秒），默认 `600`；可设 `0` 关闭 |
| `enableStructuredTermination` | 否 | 开启后注入 `update_plan` / `task_complete`，并按结构化终止驱动循环（`ask_user` 始终可用，与本开关无关） |
| `theme` | 否 | 外观：`light` \| `dark` \| `auto`，默认 `light`；仅影响 AI 侧栏 |
| `semanticRoutes` | 否 | 语义路由清单；非空时注入「可用页面」协议与 `navigate_to_page` |
| `semanticRouteDomains` | 否 | 当前页优先的语义路由 domain（未激活域仅摘要） |
| `autoNavigate` | 否 | 「自动跳转」默认值，默认 `true`；用户设置经 `userHabit` 覆盖 |
| `toolConcurrency` | 否 | 同一步并行 Tool 上限，默认 `10`（1–32）；面板可改，`userHabit` 覆盖 |
| `decisionPreference` | 否 | `user` \| `ai`，默认 `user`；影响 ask_user 协议措辞；面板可改 |
| `reasoningDisplayMode` | 否 | `collapsed` \| `preview3` \| `full`，默认 `collapsed`；思考内容折叠 / 只显示最后 3 行 / 显示全部；面板可改，`userHabit` 覆盖 |
| `toolDisplayNames` | 否 | 宿主/业务 Tool 中文短标题（`functionName → 文案`）；**业务名勿写入内核** |
| `navigate` | 否 | 跳转执行器（白名单 + `history.push`）；与 `semanticRoutes` 配套 |
| `plugins`（Provider prop） | 否 | Cordis 插件包列表（宿主 / 业务 `AgentPlugin`） |

---

## 主要导出

| 分类 | 导出 |
|------|------|
| Provider | `AIChatProvider`, `AIChatPageScope`, `AIChatDisplay`, `ChatReferenceProvider` |
| Hooks | `useAIChatLayout`, `useAIChatDisplayMode`, `useEffectiveAIChatConfig`, `useChatReference`, `useAIChatPrompts`, `useSetAIChatPrompts`, `useAISurface`, `useAIMutationHandler`, `useFunctionCall` |
| Tool 注册 | `registerFunctionCall`, `unregisterFunctionCall`, `getFunctionCallDef`, `getAllFunctionCalls`, `invokeFunctionCall`, `clearFunctionCalls`, `subscribeFunctionCalls` |
| 展示名 | `registerToolDisplayNames`, `lookupToolDisplayName`, `clearHostToolDisplayNames`, `CORE_TOOL_DISPLAY_NAMES` |
| 契约总线 | `registerToolContractSource`, `resolveVisibleContracts`, `getToolContract`, `ensureFunctionRegistryContractSource`, … |
| Cordis 运行时 | `createAgentContext`, `ToolsService`, `SurfacesService`, `surfacesRegistry`, `registerInvocationPresentation`, `presentToolCall`, `presentToolResult` |
| Skill 策略 | `registerSkillCompletionPolicy`, `unregisterSkillCompletionPolicy`, `clearSkillCompletionPolicies`, `getSkillCompletionStrategy` |
| Harness Tool | `ASK_USER_TOOL`, `ASK_USER_OPENAI_TOOL`, `UPDATE_PLAN_TOOL`, `TASK_COMPLETE_TOOL`, `NAVIGATE_TO_PAGE_TOOL`, `NAVIGATE_TO_PAGE_OPENAI_TOOL`, `SKILL_TOOL`, `RUN_CODE_TOOL`, `RUN_SUBAGENT_TOOL`, `HARNESS_TOOL_NAMES`, `HARNESS_OPENAI_TOOLS` |
| 用户选择 | `formatUserChoiceMessage`, `isUserChoiceRequestData`；类型 `AskUserArgs`, `UserChoiceRequest`, `UserChoiceSubmission`, … |
| 主题 / 偏好 | `setAIBaseTheme`, …；`getToolConcurrency`, `setToolConcurrency`, `getDecisionPreference`, `setDecisionPreference`, `getReasoningDisplayMode`, `setReasoningDisplayMode`, … |
| 语义路由 | `registerNavigationHandler`, `navigateToPage`, `setAutoNavigate`, `getAutoNavigate`, `subscribeAutoNavigate`, `semanticRoutesToMarkdown`, `AUTO_NAVIGATE_HABIT_KEY`；类型 `SemanticRoute`, `NavigationRequest`, `NavigationResult` |
| 结果预算 | `serializeToolResultForContext`, `resolveToolResultBudget` |
| 模型能力 | `supportsModelAttachments`, `supportsModelVoiceInput`, `MODEL_CAPABILITY_AUDIO_INPUT` |
| 消息 / 引用 | `sendMockUserMessage`, `sendAIChatMessage`, `formatMessageWithReferences` |
| 日志 | `setToolInvokeLogger`, `logToolInvoke`, `formatToolInvokeError` |
| SDK | `AIBaseClient` |
| 类型 | `AIChatConfig`, `AIChatPromptItem`, `FunctionCallDef`, `AIBaseSkill`, `AIBaseTool`, `SkillCompletionStrategy`, `ToolResponse`, `DecisionPreference`, `ReasoningDisplayMode`, `AgentPlugin`, … |

---

## 构建与发布

```bash
pnpm build    # dist/index.js、dist/index.d.ts、dist/style.css
pnpm dev      # tsup --watch（宿主读 dist 联调时可用）
```

发布到 [npmjs.com](https://www.npmjs.com/package/@eadaf/ai-base)（需已登录，且使用 Linux / nvm 的 npm，WSL 下不要用 Windows 的 npm/pnpm）：

```bash
cd package/ai-base
npm publish --access public
```

版本号以本包 `package.json` 的 `version` 为准；发新版本先改 version 再 publish。

## 常见报错

**找不到某个 export**

确认 `dist` 已 build 且包含该导出；宿主侧执行 `pnpm refresh:ai-base`（若已配置）并重启 frontend dev。

**`Failed to resolve import "@ant-design/x"`**

peer 依赖（`antd`、`@ant-design/x` 等）须由宿主安装并可被本包解析。

**`react-is` does not provide an export named 'ForwardRef'`**

清宿主 `node_modules/.vite` 后重启 dev（Vite 侧可配置 `optimizeDeps.include`）。

**`setToolInvokeLogger 不可用`**

`dist` 过旧，执行 `pnpm build` 并刷新宿主依赖链接后重启 frontend dev。

---

## 目录结构

```text
src/
  provider/     AIChatProvider、AIChatPageScope、AIChatPromptsContext、ChatReferenceContext
  ui/           AIChatPanel、AssistantSegments、UserChoiceCard 及样式
  a2ui/         下一步建议 A2UI（NextStep）catalog / deck
  chat/         流式对话、useAIBaseChat、autoContinuePolicy、userChoice
  registry/     client Function Call、builtin harness Tools、Skill 加载
  theme/        light / dark / auto 主题通道（themeChannel）
  navigation/   语义路由跳转通道（navigationChannel）、semanticRoutesToMarkdown
  hooks/        useSendAIChatMessage（deprecated，请用 sendMockUserMessage）
  utils/        aiChatBridge、formatChatReferences、toolInvokeLogger
  sdk/          AIBaseClient HTTP 封装
  config/       resolveConfig、默认 prompts / welcome
dist/           构建产物（宿主运行时加载）
```
