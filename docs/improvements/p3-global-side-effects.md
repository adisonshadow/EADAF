# P3 — 收敛全局副作用与模块级单例

> **已被吸收**：见 [`新Agent架构方案/01`](../TODOs/新Agent架构方案/01-插件内核.md)、[09](../TODOs/新Agent架构方案/09-路线图与问题分级.md)（MS1/MS4）；本文保留锚点。

## 背景

SDK 内有两处全局副作用 / 模块级单例，在多实例、HMR、或与第三方库（react-router v6 data
router、埋点 SDK）叠加时会出问题。属于「能跑但脆弱」，优先级最低但值得在稳定期收敛。

## 问题一：pathnameDisplayMode 全局 monkey-patch `history`

### 当前问题（锚点）

`package/ai-base/src/provider/pathnameDisplayMode.ts:21-38`：
```ts
const { pushState, replaceState } = history;
history.pushState = function (...args) { pushState.apply(this, args); handleChange(); };
history.replaceState = function (...args) { replaceState.apply(this, args); handleChange(); };
return () => {
  window.removeEventListener('popstate', handleChange);
  history.pushState = pushState;     // ← 还原原始引用
  history.replaceState = replaceState;
};
```

风险：
- **多订阅者互相覆盖**：A、B 两个组件都 `subscribePathname`，各自保存「原始 pushState」；
  cleanup 时后注册的还原成「被前者 patch 过的版本」，patch 链断裂。
- **与第三方冲突**：react-router v6 data router、Sentry/buried-point SDK 也会 patch
  `history`，叠加时行为不可预测。
- cleanup 还原的是闭包内快照，若期间被别人 patch，还原会抹掉别人的 patch。

### 目标方案

不再 patch `history`，改用**非侵入式路由监听**：

1. **优先方案**：暴露一个 `RouterBinder`，由宿主应用在路由层（react-router）显式调用
   `notifyPathnameChange()`，SDK 不监听全局。
2. **兜底方案**：用 `popstate` + 定时器 / `MutationObserver`(title 变化) 粗粒度感知，
   而非改写 `history`。

### 改动清单（按文件）

- **`package/ai-base/src/provider/pathnameDisplayMode.ts`**：
  - 删除 `history.pushState/replaceState` 的 patch。
  - `subscribePathname` 改为仅监听 `popstate` + 暴露 `__aibaseNotifyPathChange()` 全局钩子
    （宿主路由 change 时调）。
  - 新增 `notifyPathnameChange()` 导出，供宿主主动通知。
- **`package/ai-base/src/provider/AIChatProvider.tsx`**：
  effect 中仍 `subscribePathname`，但兼容宿主未集成的情况（popstate 兜底）。
- **宿主应用（`app_example/src`、`frontend/src`）**：
  在 react-router 根（`<BrowserRouter>` 或 router 实例）的 `subscribe` 回调里调
  `notifyPathnameChange()`。示例：
  ```tsx
  import { notifyPathnameChange } from '@eadaf/ai-base';
  // react-router v7 data router
  const router = createBrowserRouter(routes);
  router.subscribe(() => notifyPathnameChange());
  ```
- **`index.ts`** 导出 `notifyPathnameChange`。

## 问题二：aiChatBridge 模块级单例

### 当前问题（锚点）

`package/ai-base/src/utils/aiChatBridge.ts:5-24`：
```ts
let pendingMessage: string | null = null;
let openPanel: (() => void) | null = null;
// …
let sessionControls: AIChatSessionControls | null = null;
```

模块级 `let` 即全局单例。风险：
- **多面板实例**：两个 `AIChatProvider`（如微前端子应用各自挂一个）注册时后者覆盖前者，
  `openPanel` / `sessionControls` 永远只指向最后一个。
- **HMR 残留**：模块重载后单例状态错乱（pendingMessage 卡住）。
- **`sendMockUserMessage` 跨实例**：本想发到 A 面板，却打开了 B 面板。

### 目标方案

把单例改为**按 id 的多实例注册表**，并提供默认实例回退（向后兼容）：

### 改动清单（按文件）

- **`package/ai-base/src/utils/aiChatBridge.ts`**：
  ```ts
  interface ChatBridgeInstance {
    openPanel: (() => void) | null;
    sessionControls: AIChatSessionControls | null;
    pendingMessage: string | null;
  }
  const instances = new Map<string, ChatBridgeInstance>();
  const DEFAULT_INSTANCE_ID = 'default';

  function getInstance(id = DEFAULT_INSTANCE_ID): ChatBridgeInstance {
    let inst = instances.get(id);
    if (!inst) { inst = { openPanel: null, sessionControls: null, pendingMessage: null }; instances.set(id, inst); }
    return inst;
  }

  // 所有 register/send/load API 增加可选 instanceId 参数（默认 'default'）
  export function registerAIChatControls(controls, instanceId?) { /* getInstance(instanceId).openPanel = ... */ }
  export function sendMockUserMessage(text, instanceId?) { /* … */ }
  export function loadAIChatConversation(key, instanceId?) { /* … */ }
  ```
  window 事件保持（但 detail 带 instanceId，或 broadcast 到所有实例由各自判断）。
- **`package/ai-base/src/provider/AIChatProvider.tsx`**：
  接受可选 `instanceId` prop（默认 'default'），注册 controls 时带上。
- **`package/ai-base/src/types.ts`**：`AIChatConfig` 加 `instanceId?: string`。
- **`index.ts`**：新 API 签名导出（向后兼容，instanceId 可选）。

## 验证方式

- pathname：装两个 `AIChatDisplay mode="hidden"` 的路由，SPA 导航来回切换，
  确认不依赖 history patch 也能正确隐藏/显示；与 react-router v6 共存无报错。
- bridge：挂两个 `AIChatProvider instanceId="a"/"b"`，`sendMockUserMessage('hi', 'b')`
  只打开 B 面板；不传 instanceId 仍走 default（兼容旧调用）。
- HMR：改文件热更后，`pendingMessage` 不卡死（每个 instance 独立）。

## 风险 / 回退

- pathname 改非侵入后，**宿主必须主动集成** `notifyPathnameChange`，否则路由变化不触发
  hidden/sidebar 切换。需同步更新 example 与 frontend 的路由层，并在 README 加迁移说明。
  → 提供 popstate 兜底降低「未集成」的破坏性（至少浏览器前进后退仍生效）。
- bridge instanceId 全可选，旧调用零改动；多实例是 opt-in。
- 这两项属 P3，可在其余项稳定后单独推进，不阻塞 P0-P2。

## 与已完成项的关系

- bridge 多实例化与 **P1-2 functionRegistry namespace** 思路一致（默认 + 可选隔离），
  可复用同样的「default 回退」模式保持兼容。
- pathname 收敛后，`AIChatProvider` 的 displayMode 逻辑不变，仅监听来源改变。
