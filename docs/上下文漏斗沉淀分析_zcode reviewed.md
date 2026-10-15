# 上下文漏斗沉淀分析 — ZCode Review

> Review 对象：[docs/上下文漏斗沉淀分析_ee26a00a.plan.md](上下文漏斗沉淀分析_ee26a00a.plan.md)
> 核查基准：[package/ai-base](../package/ai-base) 源码 + EADAF backend 透传链路 + 引用的《AI数据底座Agent重设计方案.md》
> Review 日期：2026-08-29 · 方式：方案中全部事实断言逐条对照源码核查（file:line 为证）

---

## 0. 总评

**方案通过，可作为实施蓝本。** 核心判断全部成立：

- 「三条正交漏斗（沉淀 / 注入 / 装填）」的拆分框架成立，比单一分层数字硬扛全部语义清晰得多；
- L0–L4 五层定义合理，L3/L4 判据（L3 随任务存活、L4 跨任务按需取）正确；
- 对现状的判断基本准确——注入漏斗已有雏形、沉淀几乎为零、装填是删旧留新，均与代码事实吻合；
- 演进顺序（装填纠偏收益最大、优先做）方向正确；
- 「刻意不做」两条（不把记忆编排搬进 backend 网关、不用 LLM 逐条做散文摘要）均赞同。

但核查同时发现：**2 处诊断归因需要修正、9 项方案遗漏的关键事实（约半数会直接影响落地设计）、演进步骤 1 需从一件事扩为三件事**。其中最重要的一条：任务清单失忆的真因不是 `slice(-12)`，只改 `compactHistoryForApi` 救不了它——「plan 提升为会话级」必须与装填纠偏同优先级。

---

## 1. 事实核查表（逐条）

图例：✅ 属实 · ⚠️ 属实但需补充精度 · ❌ 不属实

### 1.1 「已有、且方向对的」六项

| # | 方案断言 | 结论 | 证据 |
|---|---|---|---|
| 1 | Skill 目录摘要常驻、正文按 `fallbackSkillSlugs` + 框架 Skill 预取、其余走 `skill` Tool | ✅ | `skillLoader.ts:170-174`（prefetch = fallbackSlugs + `aibase-chat-framework`）；`skillLoader.ts:262-275`（目录摘要，描述截 120 字符）；`skillLoader.ts:277-353`（`buildCombinedSystemPrompt` 组装顺序）；`builtinTools.ts:417-491`（`skill` tool handler）。`fallbackSkillSlugs` 语义确认：当前页面显式配置、正文被预取的 slug（`types.ts:30-31`，页面级覆盖 `provider/AIChatPageScope.tsx:48`） |
| 2 | `display` 不进模型；`toToolResponseContextView` 才进上下文 | ✅ | `normalizeToolResult.ts:308-318`（返回 `{ok, verified, kind, error, meta, data, agentHint}`，明确不含 display）；`toolResultBudget.ts:91`（进 `role:'tool'` 前统一走此视图）；全部 4 处 tool 消息构造点（`useAIBaseChat.ts:1280/1301/1380/1402`）均经 `serializeToolResultForContext` |
| 3 | 结果预算默认 8000 字符；列表形按条裁、保留 total/hint | ✅ | `config/runtime.ts:45`（默认 8000）；`toolResultBudget.ts:35-78`（`items` 数组二分查找最大可容纳条数，保留 `total`/`statusSummary` 等行级字段，补 `returnedCount`/`truncated`/中文 `hint`）。优先级：本地定义 > tool meta > 全局默认（`toolResultBudget.ts:160-161`） |
| 4 | 同轮批量聚合：多条同名 Tool 压成计数摘要 | ⚠️ | 机制属实（`aggregateToolResults.ts:84-159`，前 N−1 条压成一行 `[批量聚合 #k/N]`，末条带 `{total, passed, failures≤5}` 汇总），**但默认关闭**：仅当已加载 Skill 显式配置 `resultAggregation.tools` 才生效（`aggregateToolResults.ts:94-95`），`minBatchSize` 默认 3、下限 2（`:45`）。方案表述读起来像默认行为，落地评估时需按 opt-in 计算 |
| 5 | L2 雏形：`useAISurface` + `aibase_read_surfaces` 按需读、不自动注入 | ✅ | `provider/useAISurface.ts:7-31`（注册/注销）；`builtinTools.ts:969-996`（tool handler 调 `readAllAISurfaces()`）；`buildCombinedSystemPrompt` 从不读 surface，结构化终止协议里也只字未提此 tool——模型只能靠 tool 描述自己发现 |
| 6 | L3 雏形：`update_plan` / `agentPlanState` 只活当前 turn，下一句用户话就没了 | ✅ | `agentPlanState.ts:33`（模块级 `let current`，文件头注释自述是 hack）；**每个新 turn 开头即被清空**：`useAIBaseChat.ts:769-775` `beginTurn({ plan: [], ... })`；`finally` 中 `endTurn()` 置 null（`useAIBaseChat.ts:1588`）。plan 到达 LLM 仅两条路且都限当前 turn：①`update_plan` 的 tool 消息 ②自动续跑 nudge（`useAIBaseChat.ts:994-997`）；system prompt 从不含 plan，tool 消息从不持久化 |

### 1.2 「缺的、或做反了的」六行

| # | 方案断言 | 结论 | 证据 |
|---|---|---|---|
| 7 | L0：持久化时 `sanitizeMessagesForPersist` 丢掉 tool 消息，无法回放/再蒸馏 | ✅（有细节差异，见 §3.2） | `chatHistoryDb.ts:152`（role 过滤只留 `user`/`assistant`，`tool`/`system` 全丢）。且 tool 轨迹连 turn 结束都活不过：`loopMessages` 是 `submitQuery` 内局部变量，tool 消息从不写入 store——下一轮 history 天然只有 user/assistant（`useAIBaseChat.ts:518-524`） |
| 8 | L1：无（只有裁短的 JSON，不是事实） | ✅ | 全库搜索无任何实体 id / 写操作结果 / 用户决策的结构化跨 turn 载体。最接近的 `recordToolOutcome` 也是 per-turn 单例（`agentPlanState.ts:70-72`） |
| 9 | L2：Surface 要模型主动 read；引用是 `JSON.stringify` 整包塞进 user 文本 | ✅ | `formatChatReferences.ts:3-20`（非字符串内容直接 `JSON.stringify`，无大小上限、无字段筛选）；入口 `AIChatPanel.tsx:337` → `submitQuery(apiText)` |
| 10 | L3：plan 模块级单例、turn 结束即清；compaction 会把早期约定一起 slice 掉；多会话污染风险（P1-3） | ⚠️ | 前半句 ✅（见 #6）。**后半句归因不准**：plan 从不进 history、从不在 system prompt，`slice(-12)` 根本砍不到它——slice 实际丢的是早期用户任务规格、`[引用上下文]` 块、assistant 摘要。任务清单失忆的真因是 turn 边界重置（详见 §3.1）。多会话污染 ✅ 结构上真实，但仅限并发 turn：顺序 turn 因每次 `beginTurn` 重置而隔离；具体触发路径见 §2.8 |
| 11 | L4：无。localStorage 只存 UI 偏好、不进 LLM | ⚠️ | 存储面属实：唯一真正写入者是 `userHabit`（`chat.selectedModelSlug`、并发/主题/推理显示等，`storage/userHabit.ts`）。**但有例外**：`decisionPreference` 与 `autoNavigate` 这两个跨会话开关会改变 system prompt 措辞（`agentPrefsChannel.ts:146-165` → `skillLoader.ts` 注入 ask-user 协议 / 导航协议）——「跨会话偏好 → LLM prompt」的通路其实已存在一条窄缝，L4 落地可复用（见 §4.4） |
| 12 | 装填：120k 字符、85% 触发、硬留最近 12 条 | ✅ | `contextBudget.ts:3-10` 三个常量精确吻合；`compactHistoryForApi`（`:39-62`）`slice(-KEEP_RECENT_MESSAGES)` 后插入英文 system notice：`[Context compacted] N earlier message(s) were removed...`。**补充一个方案没写的严重事实**：compaction 是破坏性的，详见 §2.1 |

### 1.3 其他断言

| # | 方案断言 | 结论 | 证据 |
|---|---|---|---|
| 13 | `getContextUsagePercent` 把 systemPrompt 算进用量，compact 触发却只看 history 字符 | ✅ | `contextBudget.ts:23-30`（分子含 `systemPrompt?.length`）vs `:40`（触发只用 `estimateMessagesChars(history)`）。调用侧确认：usage percent 仅供 UI 进度环（`useAIBaseChat.ts:434-437` → `AIChatPanel.tsx:771-778`），对请求无影响；system 膨胀只会让环变橙，永远不会提前压缩历史 |
| 14 | 后端 `/chat/completions` 是透传网关，不拼 messages、不做记忆 | ✅ | 路由 `backend/src/routes/aiRoutes.js:137`；控制器 `backend/src/controllers/aiServiceController.js:128-327`（resolveModel → 校验仅查 messages 非空 + 模态支持 → 限流 → 转发）；`backend/src/services/ai/llmGateway.js:15-39` `buildUpstreamBody` 对 `messages` 原样透传；流式响应用 `PassThrough` 逐字节转发；请求日志仅 `trace_id/slug/status_code/duration_ms/turn_id`，无消息内容、无会话存储 |
| 15 | 引用的《AI数据底座Agent重设计方案》已写原则3 / P2-1 / 原则4 / P1-3 | ✅ | 文档存在（547 行），四处引用全部核实：原则3 上下文经济（:79-86，含「slice(-12) 丢失任务清单」原文）、原则4 状态外部化（:88-91）、P1-3 多会话并发污染（:261）、P2-1（:270） |
| 16 | 全库无任何记忆/蒸馏机制（会话摘要、事实抽取等） | ✅ | `summariz/distill/digest/memory/recall/蒸馏` 等关键词穷举搜索，唯一命中是一处 tool 描述文案。每轮上下文从零重建：system prompt（每次挂载重建）+ IndexedDB 扁平化 user/assistant 文本 |

---

## 2. 方案遗漏、但会影响落地设计的事实（9 项，按影响排序）

### 2.1 compaction 是破坏性的——不只裁 API 视图，还永久删库 ⚠️ 最高优先级

`useAIBaseChat.ts:526-539`：compaction 发生时，**store 本身也被截断到最近 12 条**（`setMessages(... slice(-KEEP_RECENT_MESSAGES))`），IndexedDB 同步被删。被裁消息不是「对模型隐藏」而是「物理消失」。

这直接与方案的 L0 目标（「审计/回放/再蒸馏用」）冲突：**只要装填纠偏不同步改成「只裁视图、不删库」，后面第 4 步 L0 可回放就无米下锅**——历史早被步骤 1 删光了。同时它也让「被裁部分生成结构化摘要再进 L4」无源可摘。所以非破坏性 compaction 必须进入步骤 1，而非留到 L0 阶段。

### 2.2 字符估算把 base64 图片按全长度计入

`estimateMessageChars` 用 `content.length` / `JSON.stringify(content).length`（`contextBudget.ts:12-17`），而 history 取 `apiContent ?? content`（`useAIBaseChat.ts:522`）——**历史 user 消息里的 base64 图片/音频按原始 base64 全长计数**。一张 ~1MB 的图（≈100 万字符）瞬间超 120k 预算，直接触发 compaction 到 12 条。

任何装填优先级重构都建立在这个估算器之上，**估算器不修，装填漏斗的地基是歪的**。修复方向：多模态 part 按固定 token 估值（如每图 1–2k tokens 折算字符），而非原文长度。

### 2.3 turn 内无压缩，方案的装填优先级只覆盖了历史轴

`compactHistoryForApi` 只在 `submitQuery` 开头跑一次（`useAIBaseChat.ts:526`）；tool loop（`MAX_TOOL_ROUNDS = 32`）期间 `loopMessages` 只增不减（`useAIBaseChat.ts:98`；结构化硬停 48 轮 `autoContinuePolicy.ts:409`）。一个长 turn 里 assistant + 大体积 tool 结果可以无上限堆积，直到下一 turn 才被一刀切。

方案的 P0–P3 装填优先级是按「跨 turn 历史」设计的，应补一条 turn 内规则（如：早前轮次的 tool 结果按 L1 事实替换原文，或同轮超出 N 轮后对最早轮次降级为摘要）。

### 2.4 ask_user 恢复即清空 plan——L3 失忆最严重的场景

方案说「下一句用户话 plan 就没了」，实际有更糟的路径：**任务中途的 HITL 决策门**。`ask_user` 硬停 → 用户在 `UserChoiceCard` 点选（`UserChoiceCard.tsx:70-72`）→ `sendMockUserMessage` → window 事件 → `handleSubmit` → `submitQuery` → **`beginTurn({ plan: [] })`**。一个逻辑上未完结的任务，恢复时 plan 归零，模型只看到一条【用户选择】文本。`retryAssistantMessage`（`useAIBaseChat.ts:1611-1630`）重放时同样从空 plan 开始。

**含义**：会话级 plan store 的第一个验收用例就该是「ask_user 恢复后 plan 连续」，而不是普通的下一轮对话。

### 2.5 聚合在预算截断之后解析序列化文本——L1 必须挂信封层的直接证据

`aggregateToolResults` 解析的是**已经过 `serializeToolResultForContext` 预算裁剪的字符串**。若裁剪走了兜底的 head-slice（JSON 已不完整、不可解析），`parseEnvelope` 返回 null，`isOk(null) === false`（`aggregateToolResults.ts:50-74`）——**一个成功（只是被截短）的结果会被计成 `failed`**。

这对方案是重要佐证：L1 抽取**必须在信封还是结构化对象时进行**（`executeOneToolCall` 内、序列化之前；`recordToolOutcome` 是现成挂点），绝不能解析序列化后的文本。方案「从已有信封规则抽取，不要 LLM 散文摘要」的方向恰好避开了这个坑，但应把「挂点在序列化之前」写成硬约束。

### 2.6 持久化 schema 已预留 `toolSteps` 字段——L0 的现成落点

`chatHistoryDb.ts:159-175` 的持久化对象里已经有 `toolSteps` 字段（还有 `reasoningContent`），**只是全库从没有任何代码写入过它**（live UI 用的是不入库的 `segments`）。L0「Tool 轨迹落库」不需要动 schema，把现有 `ChatToolStep` 写进这个死字段即可起步。方案第 4 步的工作量比预想小。

### 2.7 多模态附件刷新后从 LLM 历史静默消失

`apiContent`（真正的多模态 parts）从不持久化，入库时数组内容被替换为占位文本 `[附件: xxx]`（`chatHistoryDb.ts:159-164`）。刷新后对话在 UI 里看起来完好，但 LLM 再也看不到那张图/那份文档。L0 设计需明确覆盖 `apiContent`（至少存引用/摘要），否则「回放」名不副实。

### 2.8 P1-3 多会话污染的具体触发路径——顺手可修

污染仅发生在并发 turn（顺序 turn 被每次 `beginTurn` 重置隔离）。具体现实路径：外部 window 事件通道 `subscribeAIChatMessage → handleSubmit` **没有 `isRequesting` 守卫**（`AIChatPanel.tsx:454-458`；Sender 按钮只是 UI 禁用）。流式输出期间由 `UserChoiceCard`/下一步按钮经 `sendMockUserMessage` 触发第二次提交，turn A 的 `update_plan` 就写进了 turn B 的上下文。另外同 realm 多个 `AIChatProvider` 实例共享该单例。

**含义**：在会话级 plan store 落地之前，加一个「流式期间拒绝外部提交」守卫 + 给 turn context 挂 `conversationKey`，就能先摘掉 P1-3 这颗雷。

### 2.9 `aiSurfaceRegistry` 无作用域、id 冲突静默覆盖

注册表是模块级 Map，按 surface `id` 键控、后注册者胜（`aiSurfaceRegistry.ts:3-11`）。多页面挂载同名 surface 会互相覆盖。L2 scene card 落地时要给 id 加作用域或做冲突检测，否则 scene card 会出现「时有时无」的脏数据。

---

## 3. 诊断需要修正的两处

### 3.1 「compaction 会把任务清单 slice 掉」——归因偏差，影响修复设计

方案 §3 表格 L3 行与 P2-1 原文都把「任务清单丢失」挂在 `slice(-12)` 上。代码事实是：

- plan 只以两种形态存在：当前 turn 的 `update_plan` tool 消息 + nudge user 消息，**从不进入跨 turn history，从不在 system prompt**；
- compaction 在 turn 开始时只作用于 user/assistant history，**根本砍不到 plan**；
- `slice(-12)` 实际丢的是：早期用户任务规格、`[引用上下文]` 整包块、assistant 阶段性结论。

任务清单失忆的真因是**turn 边界重置**（§1.1 #6）叠加 **ask_user 恢复清空**（§2.4）。

**对落地的影响**：方案步骤 1 说「`compactHistoryForApi` 改为保留 L3 投影」——但 history 里根本没有 L3 投影可保。正确的做法是把「plan 提升为会话级 store，每轮把 plan 投影注入 system 或 user 前缀」从步骤 1 的后半句**升格为与 compaction 改造同等优先级的独立事项**。两者一起做才同时治好「任务失忆」和「早期上下文丢失」两个病。

### 3.2 「IndexedDB 仅 user/assistant 正文」——两处补充

- 不止正文：还保留 `reasoningContent`，schema 里另有从未写入的 `toolSteps`（见 §2.6）——对 L0 是好消息；
- 附件被降级为占位文本（见 §2.7），即持久化历史的「回放」对多模态天然不完整。

另有一处小修正：方案说 localStorage「不进 LLM」——`decisionPreference`/`autoNavigate` 两个开关实际会改写 system prompt 协议段（§1.2 #11）。这不推翻「无 L4」的结论（那是静态设置而非习得记忆），但说明「偏好 → prompt」的管道已通，L4 的偏好类条目有现成接线方式。

---

## 4. 对设计建议本身的评价

### 4.1 三漏斗正交框架 —— 赞同

「注入做对了、沉淀缺失、装填粗暴」的总判断与代码完全吻合。三条轴分开后，现有的 Skill 分层、Tool 信封分流、结果预算都正确归入注入漏斗且不必重做——方案「Skill 目录/正文策略可以保留」的判断正确，且核查补强了它：`skill` tool 还有第三重角色（动态把 granted tools 并入本轮工具池 `expandTurnToolPool`，`useAIBaseChat.ts:216-290`），`agentHint` 是 display/data 之外的模型专用第三通道——这套注入机制比方案描述的还要完整一些。

### 4.2 L0–L4 分层与装填优先级 —— 赞同，补一个前置项

L3「任务结束蒸馏进 L4 后清空」、L4「检索注入不常驻」的判据清晰可用。装填 P0（协议 + L3 + 当前 user）→ P1（L2 scene card）→ P2（L1 相交事实）→ P3（L4 检索）的装箱顺序合理。**补充**：装箱以预算估算器为地基，§2.2 的 base64 问题必须作为前置修复，否则一张图就能把整箱逻辑打穿。

### 4.3 L1 信封抽取 —— 方向正确，且有现成挂点与信号

- 挂点：`executeOneToolCall` 内、序列化之前；`recordToolOutcome`（`agentPlanState.ts:70-72`）已按 turn 收集 tool 结果，把它升级为会话级事实表是最小改动路径；
- 信号：`ToolResponse` 信封的 `kind` 枚举已天然覆盖方案列的典型 type——`user_choice_request` → `user_decision`、`verified: true`（写操作二次校验）→ `mutation_result`；`entity_ref`/`page_focus` 分别对应信封 `data` 里的实体行与 Surface 快照。方案设计的 `{factId, type, subject, predicate, value, source, ts}` 结构可直接从这些字段映射；
- 硬约束：吸取 §2.5 的教训，抽取只读结构化信封，禁止解析序列化文本；且须在信封被预算裁剪**之前**抽取（裁剪是「发给模型的视图」，不是「事实本身」）。

### 4.4 L2 scene card 与 L4 本地化 —— 赞同

- L2：把 Surface 快照做成有预算的 scene card 自动注入、`read_surfaces` 降级为深查入口——正确；引用改 `{type,label,id}` + L1 指针、禁止整包 JSON——直接消除 §1.2 #9 的噪音源。落地时处理 §2.9 的注册表冲突。
- L4 先本地：正确。`userHabit` 是现成载体，`decisionPreference → buildAskUserProtocol` 已验证「跨会话偏好 → system prompt」通路可行（§1.2 #11）。不建议先上向量库的判断也对——按 `subject.id` 相交过滤（方案 §4 第 4 条）在 EADAF 域内就是现成的检索键，无须 embeddings。

---

## 5. 演进顺序的调整建议

方案顺序（装填纠偏 → L2 → L1 → L0 → L4）整体保留，仅对步骤 1 扩容、并为每步补验收用例：

| 步骤 | 调整 | 验收用例 |
|---|---|---|
| **1. 装填纠偏**（扩为三件事） | ① compaction 非破坏化：只裁 API 视图、不再删 IndexedDB；被裁部分生成结构化「已压缩摘要」（替代英文 notice）② 估算器修复：多模态按 token 折算，不按 base64 全长 ③ **plan 提升为会话级 store**（升格为独立事项），每轮投影常驻注入 | ① 压缩后刷新页面，被裁消息仍在库中可回看 ② 发一张截图 + 长对话，不再触发「一图清场」③ **ask_user 恢复后 plan 连续**（§2.4）；两个会话并发提交互不污染（顺手加 isRequesting 守卫，先摘 P1-3） |
| 2. L2 自动注入 | 同方案；补：surface id 加作用域（§2.9）；引用改 `{type,label,id}` 禁整包 JSON | 模型不调 `read_surfaces` 也能答对「当前页/当前选中实体」；带 20 行表格引用的提问，user 消息长度显著下降 |
| 3. L1 规则抽取 | 同方案；硬约束：挂信封层、序列化之前（§2.5）；跨 turn 条数上限 | 上一轮创建实体成功后，下一轮问「刚才建的那个」能命中 id；截断过的列表结果不会误报 failed |
| 4. L0 可回放 | 同方案；直接启用已预留的 `toolSteps` 死字段（§2.6）；明确 `apiContent` 的持久化/摘要策略（§2.7） | 刷新后回放可见 tool 链路；含图对话刷新后模型不「失明」 |
| 5. L4 | 同方案（先本地） | 新会话开场注入上一会话摘要；确认不常驻全文 |

---

## 6. 结论

方案的三漏斗框架、五层定义、装填优先级与「不做清单」全部经得起代码核查，**按 §5 的调整执行即可进入实施**。三句话概括本次 review 的增量：

1. **修地基**：估算器把 base64 当全文计数 + compaction 物理删库，这两个隐藏事实不修，装填漏斗与 L0 都建在流沙上；
2. **改归因**：任务清单失忆的真因是 turn 边界重置与 ask_user 恢复清空，不是 `slice(-12)`——所以「会话级 plan store」必须与 compaction 改造同批落地，而不是它的附注；
3. **省工作量**：`toolSteps` 死字段、`userHabit` 偏好管道、`recordToolOutcome` 挂点、信封 `kind`/`verified` 信号——L0/L1/L4 的第一批落点代码里已经留好了位置，方案第 4、5 步比预估更近。
