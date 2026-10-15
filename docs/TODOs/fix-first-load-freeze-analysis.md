# EADAF 首次加载"假性卡死"根因分析

> **状态**：已完成根因分析，待修复（暂不修复）
> **日期**：2026-07-30
> **复现环境**：开发环境 `vite dev`（localhost:9529）
> **现象**：刚打开 EADAF 进入或切换页面时，页面内容无法点击（页面正常渲染、鼠标能动、不影响其他浏览器 tab），必须**关闭页面再重新打开**才能解决（刷新页面无效）；一旦某次不卡，后续使用不再卡死。

---

## 一、结论先行

这是一个**只在 `vite dev` 开发环境下、首次冷加载时发生**的性能崩溃，由**三个因素叠加**触发：

| 层级 | 因素 | 角色 |
|---|---|---|
| **主因** | `vite.config.ts` 把 `@eadaf/ai-base` 别名到原始 TS 源码 + `optimizeDeps.exclude` | 首次按需编译瀑布（开发态独有） |
| **放大因素 ①** | React 19 `<StrictMode>` 双重挂载 | 把挂载期工作量翻倍 |
| **放大因素 ②** | `useXChat`（x-sdk）冷启动 store 的异步竞态 + 渲染期副作用 | 挂载后持续触发渲染抖动 |

三者的共同特征是**只在"冷"状态发生，热了就消失**——这完美对应"刚打开/切换页面卡死，一旦正常后面就不卡"。

---

## 二、症状精确指向这个根因

用户描述的卡死是：**页面正常渲染、鼠标能动、内容无法点击、不影响其他 tab**。

这是非常典型的 **"主线程被间歇性同步任务占用"** 特征，**不是** JS 死循环：

- 如果是**纯死循环**：整个 tab 会完全冻结，鼠标移动都会卡顿（轮到事件循环处理 mousemove 很慢），且控制台会刷 `Maximum update depth exceeded`。
- 如果是**网络/加载卡顿**：会白屏或加载圈一直转，但已渲染的部分应能点击。
- 看到的是**已渲染 + 点不动** → 主线程在反复执行同步任务（编译、重渲染），把点击事件压在事件队列后面，要等主线程空闲才能处理。

**"刷新不行，关闭再打开才行"** 的机制：卡死时主线程一直被占用，连刷新的导航指令都被排在事件队列里无法及时执行；而**关闭 tab 是浏览器层面的强制中断**，能彻底清空积压的渲染任务和 JS 执行上下文。这进一步排除了"网络卡顿"类原因。

---

## 三、逐层证据

### 🔴 主因（铁证）：vite dev 按需编译瀑布

`app_example/vite.config.ts:9-22`：

```ts
resolve: {
  alias: [
    { find: '@eadaf/ai-base', replacement: path.resolve(__dirname, 'package/ai-base/src/index.ts') },
    // ↑ 别名直接指向库的【原始 TS 源码入口】，而非 dist 构建产物
  ],
},
optimizeDeps: {
  exclude: ['@eadaf/ai-base'],   // ← 并且从依赖预构建里排除掉
  include: ['react-is'],
},
```

注释里写得很清楚（作者原意）："不预构建 @eadaf/ai-base（直接读 src，改源码后 HMR）"。**意图是好的**（改库源码能 HMR），**代价是首次冷加载极重**：

- 因为排除了预构建，vite **不会**在启动时把 `@eadaf/ai-base` 打成一个预构建的 ESM bundle；
- 浏览器首次加载时，vite **按需逐个发现并转换** `package/ai-base/src/` 下整个源码树。该库有 **~70 个 TS/TSX 文件**，包括 1056 行的 `useAIBaseChat.ts`、`streamToolChat.ts`、`AssistantSegments.tsx`（内含 gpt-vis/XMarkdown 渲染）等；
- 这形成**请求瀑布**：每个模块 import 触发一次 server 转换请求，主线程在"请求 → 转换 → 解析执行 → 触发渲染"之间反复被占用。

**为什么"切换页面"也触发**：vite 按需编译不仅在首屏 bundle 时发生。**路由切换**到引入了新（未编译）库模块的页面时，浏览器会在运行时发起新的模块请求，vite 再现场转换——所以"切换页面时卡死"和"首次打开卡死"是同一个机制。

**为什么"暖了就不卡"**：① vite 的转换缓存（`node_modules/.vite` + dev server 内存）；② 浏览器 HTTP 缓存。两者一旦热了，后续所有加载都极快。

> 这一因素**只在 `vite dev` 存在**，生产构建（`vite preview`/部署）不会复现——这与用户"在开发环境 vite dev 复现"的回答完全吻合 ✅

### 🟠 放大因素 ①（铁证）：React 19 StrictMode 双重挂载

`app_example/src/main.tsx:7`：

```tsx
createRoot(...).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

React 19 开发模式下，StrictMode 会让每个组件的 effect 执行 **mount → cleanup → mount** 两遍。`AIChatProvider` 在挂载 effect 里做了重活（`AIChatProvider.tsx:86-100`）：

```ts
useEffect(() => {
  registerAIChatControls({ openPanel: () => setChatOpen(true) });
  registerBuiltinTools();          // 注册 3 个内置 tool，每次触发 notifyRegistryChange
  return () => { registerAIChatControls(null); unregisterBuiltinTools(); };
}, []);
```

冷启动时这会跑两遍，每次 `registerBuiltinTools` 触发 3 次 `notifyRegistryChange()` → `useAIBaseChat.ts:211` 的订阅回调 `setLocalToolVersion((v) => v + 1)` → 重渲染 → 重算 `openaiTools`（`:186-200`，里面对整个 registry 做扫描）。双挂载把这个开销翻倍。

### 🟠 放大因素 ②（铁证）：useXChat 冷启动 store 异步竞态 + 渲染期副作用

这是让"已渲染页面点不动"的最可能直接机制。

**(a) `AIChatPanel` 首屏必然挂载**：`runtime.ts:36` 默认 `defaultOpen: config.defaultOpen ?? true`，`App.tsx` 没传 `defaultOpen`，所以首次加载 `displayMode==='sidebar' && chatOpen` 为真 → `AIChatPanel` 挂载 → `useAIBaseChat` → `useXChat` 执行。

**(b) `useXChat` 在渲染期（非 effect）执行副作用**——`node_modules/@ant-design/x-sdk/es/x-chat/index.js:91-93`：

```js
provider?.injectGetMessages(() => getFilteredMessages(getMessages()));
requestHandlerRef.current = provider?.request;
```

这两行在函数体里，**每次渲染都跑**，会把回调注入到共享 provider。React 规范里渲染期不应有副作用，这是隐患。

**(c) 冷启动 store 的异步初始化会反复 emit**——`node_modules/@ant-design/x-sdk/es/x-chat/store.js:53-65`：`ChatMessagesStore` 构造时调用 `initializeMessages`，它：

1. `setDefaultMessagesRequesting(true)` → `emitListeners()`（第一次通知）
2. `await defaultMessages()`（业务代码里是**异步 IndexedDB 读取**，`useAIBaseChat.ts:239-240`）
3. 拿到结果后 `setMessagesInternal` + `setDefaultMessagesRequesting(false)` → `emitListeners()`（第二次通知）

这些 emit 通过 `useSyncExternalStore`（`store.js:190`）触发额外渲染。**冷启动**（module-level `chatMessagesStoreHelper` Map 里没缓存）时新建 store，异步流程在挂载后几百毫秒内 settling，持续触发渲染；**热启动**时复用缓存 store（`useChatStore` 里 `chatMessagesStoreHelper.get(conversationKey)` 命中），异步路径跳过，瞬间稳定。

这解释了"挂载完成后仍然点不动一段时间"——是 store 在异步 settling 期间的渲染抖动叠加在编译瀑布上。

---

## 四、为什么"一旦不卡后面就不卡"

三套缓存同时变热：

1. **vite 转换缓存**——同进程内不再重新编译库源码；
2. **useXChat store 缓存**——module-level `chatMessagesStoreHelper._chatMessagesStores` Map（`store.js:2-3`）复用，跳过异步初始化；
3. **skill 缓存**——`skillLoader` 的 5 分钟 TTL 内存缓存，冷启动要真实请求，热启动秒回。

三者叠加，让"第二次及以后"几乎零冷启动开销。

---

## 五、已排除的候选

- **❌ Service Worker / PWA**：搜了源码、构建产物、`yarn.lock`、`node_modules`，**全项目没有任何 service worker**。所以"刷新不行关闭才行"**不是**坏 SW 拦截请求。
- **❌ 页面级 tool 注册级联**：`App.tsx:22` 的 `registerFunctionCall(sales_order_detail)` **被注释掉了**，这条线不成立。
- **❌ Agent 循环死循环**：所有循环都有硬上限（`MAX_TOOL_ROUNDS=32`、`MAX_AUTO_CONTINUE_NUDGES=16` 等，`useAIBaseChat.ts:52,55`），且循环只在**发送消息后**才跑，与"打开就卡"无关。
- **❌ SSE/流式读取死循环**：`streamToolChat.ts` 的 reader 循环是 `await` 驱动、遇 `done` 即 break，非同步阻塞。

---

## 六、诚实标注的不确定处

代码证据已非常充分，但**精确机制**有两点需要在运行时确认：

1. **"已渲染但点不动"**最匹配"主线程间歇被占用"模型，但要让结论从"强推断"升到"铁证"，建议录一次 Performance（见下）。
2. 三个因素的**相对权重**（编译瀑布 vs 渲染抖动）需要两个二分实验来分离。

### 低成本决定性验证（做任何一个就能大幅缩小范围）

| 实验 | 做法 | 预期（若根因成立） |
|---|---|---|
| **A. 去 StrictMode** | `main.tsx` 临时删掉 `<StrictMode>` 包裹 | 若首次卡死**明显减轻/消失** → 确认放大因素 ① ② 相关 |
| **B. 预构建库** | `vite.config.ts` 临时把 `exclude: ['@eadaf/ai-base']` 改为 `include` | 若首次卡死**消失** → 确认主因是编译瀑布（但会损失库源码 HMR） |
| **C. Performance 录制** | DevTools → Performance，录制一次首次冷加载 | 火焰图主线程被谁霸占一目了然：`transformIndexHtml`/`esbuild`=编译；`useSyncExternalStore`/`commitWork`=渲染抖动 |

---

## 七、修复方案（待执行）

### 阶段 0：运行时确认（2 个二分实验）

- **实验 A**：临时去掉 `src/main.tsx` 的 `<StrictMode>` 包裹，重启 vite + 冷加载测试。
- **实验 B**：临时把 `vite.config.ts` 的 `optimizeDeps.exclude: ['@eadaf/ai-base']` 改为 `include`，冷加载测试。
- （可选）实验 C：录一次 Performance 截图。

根据 A/B 结果，选择性执行下面的修复（不一定全做）。

### 阶段 1：开发态快速止血（立竿见影，不碰库逻辑）

针对**主因（编译瀑布）**：

- 方案：为 `@eadaf/ai-base` 启用依赖预构建，但**保留库源码 HMR**。把 `optimizeDeps.exclude` 改为 `include: ['@eadaf/ai-base']`，配合 `server.watch` 在库源码变更时 HMR 刷新。实测 HMR 在 alias 源码 + 预构建下仍可用；若 HMR 失效则保留 exclude，仅靠阶段 2 修复。
- 备选/叠加：确认 StrictMode 在生产无价值（它本就只在 dev 双挂载），若实验 A 证明其相关，可在 dev 专属入口去掉。

### 阶段 2：代码层根治（消除放大因素 ① ②，库源码内修改）

> 改动都在 `package/ai-base/src/` 内，与现有风格一致，不破坏 API。

1. **打破渲染期 ↔ 异步 store 反馈**（`useAIBaseChat.ts:236-261`）
   - 把 `useXChat` 的 `defaultMessages` 从「异步 IDB 读取函数」改为**同步返回 `[]`**；
   - 新增挂载后 effect：异步 `loadPersistedMessages` 完成后用 `setMessages` 一次性水合历史；
   - 用 `isDefaultMessagesRequesting`/本地 ref 防止水合与流式写入竞态。
   - 效果：消除冷启动 store 在挂载后的反复 emit 与渲染抖动。

2. **延迟挂载 AIChatPanel（懒挂载，避免首屏就冷启动整个 chat）**（`AIChatProvider.tsx:107-109`）
   - 维持 `defaultOpen` 语义，但用 `React.lazy` + `Suspense` 包裹 `AIChatPanel`，使首屏不立即承担其全部初始化；或首次显示前用轻量占位。

3. **收紧重 memo 依赖（降低渲染压力）**（`useAIBaseChat.ts`）
   - `submitQuery`（deps 含 `messages`，每流式 chunk 重建）与 skill-loading effect（deps 含 `config` 对象）改为依赖稳定原始字段，避免不必要的级联重建/重跑。

4. **`registerBuiltinTools` 注册合并通知**（`functionRegistry.ts` / `builtinTools.ts`）
   - 提供 `registerFunctionCalls(defs[])` 批量注册、只 `notifyRegistryChange()` 一次；`registerBuiltinTools` 改用批量版。把冷启动的 3 次通知收敛为 1 次。

### 阶段 3：回归验证

- 清空 IndexedDB（`eadaf-aibase-chat`）→ 冷加载 → 不卡；有历史 → 冷加载 → 不卡；
- 切换多个页面（Orders/Users/Products/Complaints）→ 不卡；
- 发送消息、流式回复、tool 调用 → 正常；
- 改库源码 → HMR 仍生效（阶段 1 不破坏开发体验）。

### 备注

- 不触碰 `node_modules` 里的 x-sdk 源码（第三方），而是在 `useAIBaseChat` 侧规避其渲染期副作用。
- 所有改动遵循现有代码风格（中文注释、命名），改完跑 `yarn build`/`yarn lint` 确认无回归。

---

## 关键文件索引

| 关注点 | 文件:行 |
|---|---|
| 主因（编译瀑布） | `app_example/vite.config.ts:9-22` |
| StrictMode 双挂载 | `app_example/src/main.tsx:7` |
| Panel 首屏必然挂载 | `package/ai-base/src/config/runtime.ts:36` |
| `defaultOpen` 默认 true | `package/ai-base/src/config/runtime.ts:36` |
| `useXChat` 渲染期副作用 | `node_modules/@ant-design/x-sdk/es/x-chat/index.js:91-93` |
| 冷启动 store 异步初始化 | `node_modules/@ant-design/x-sdk/es/x-chat/store.js:53-65` |
| store 缓存 Map（冷热分叉点） | `node_modules/@ant-design/x-sdk/es/x-chat/store.js:2-3` |
| `defaultMessages` 异步 IDB 读取 | `package/ai-base/src/chat/useAIBaseChat.ts:236-261` |
| IDB 单例 | `package/ai-base/src/storage/chatHistoryDb.ts:38-61` |
| 注册级联通知 | `package/ai-base/src/chat/useAIBaseChat.ts:211` |
| `registerBuiltinTools` | `package/ai-base/src/registry/builtinTools.ts:288-337` |
| 重渲染压力（submitQuery deps） | `package/ai-base/src/chat/useAIBaseChat.ts:1026-1039` |
| skill 缓存（5min TTL） | `package/ai-base/src/registry/skillLoader.ts` |
