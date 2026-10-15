# AI 数据底座 Agent 重设计方案 —— 基于 Harness 方法论

> **状态：已被取代，勿再按本文实施。**  
> **继任文档**：[`docs/TODOs/新Agent架构方案/`](./新Agent架构方案/README.md)（2026-08-14）。  
> 本文内容已收敛至新目录的 00 / 01 / 02 / 03 / 09 / 10 等章；下文仅作历史归档。

> 文档定位（历史）：站在「Harness 这类成熟 Agent」的方法论视角，对企业数据底座（EADAF + `@eadaf/ai-base`）现有 Agent 进行一次系统化体检，并给出**方法论 → 核心技巧 → 问题分级（P0–P5）→ 项目规划 → 重点修改点**的完整重设计方案。
>
> 写作依据：实际阅读了 `package/ai-base/src/**`、`backend/src/**`（AI 能力链路）、`frontend/src/**`（工具注册/Skill 策略/语义路由）、`backend/scripts/aibase-ai-seed.sql`（权威种子：**18 个 Skill / 156 个 Tool / 204 条 Skill↔Tool 关联**）。
>
> 本文与已有文档的关系：不重复已有内容，只做引用与衔接。
> - `docs/AIBase 成熟闭环与 Planning next moves 统一方案.md`：六阶段闭环方法论（本文第 1 章与其对齐）
> - `docs/TODOs/AIBase-语义化路由与AI决策跳转方案-v2.md`：导航体系
> - `docs/skill-application-review.md`：Skill 应用治理
> - `docs/improvements/`：历史 P2/P3 改进项

---

## 目录

1. 我们从 Harness 看到了什么（表象 → 底层逻辑）
2. Agent 方法论：六条可复用原则
3. 核心技巧：可落地的工程清单
4. 现状盘点：EADAF Agent 架构地图
5. 严重问题清单（P0–P5）
6. 本项目 Agent 规划（目标态与路线图）
7. 重点修改点与修改内容
8. 度量与验收标准
9. 风险、灰度与回滚
10. 附录：Harness 工具 ↔ EADAF 能力映射表

---

## 1. 我们从 Harness 看到了什么（表象 → 底层逻辑）

用户看到的 Harness 行为是一串「看似自然、实则被约束」的节奏：

```text
开始：上下文注入
  └─ 系统身份、运行约束、能力目录（skill 摘要）、文件策略、审批策略
持续按需选用：Think → Bash → Glob → Think → Read → Skill → Bash → Write → 更新任务清单
  └─ 工具小步快跑，读改分离，先勘察再动手
面向用户汇报关键信息
  └─ 阶段性说明「在做什么、发现了什么、下一步」
Deep diving
  └─ 顺着线索下钻，而不是一次性铺开
最后总结：交付内容 + 下一步建议
  └─ 显式收尾，给出可验证的交付物
```

这串节奏背后不是「模型聪明」，而是**一套被工程约束出来的状态机与协议**。它的底层逻辑可以收敛为六条原则（第 2 章展开），一句话概括：

> **Harness 把「Agent 会什么」做成一份常驻的目录摘要，把「Agent 怎么干」做成一组正交的原子工具，把「干到哪了」做成一份外部化的结构化状态，把「上下文装多少」做成一个受预算约束的动态窗口。**

EADAF 当前的问题，本质上是**在这四条上都走了反方向**：目录=全文、工具=资源×动词爆炸、状态=一半靠模型记忆、上下文=全量注入+粗暴裁剪。

---

## 2. Agent 方法论：六条可复用原则

### 原则 1：能力目录与能力体分离（Catalog / Body 分离 + 懒加载）

| 维度 | Harness | EADAF 现状 |
|------|---------|-----------|
| 常驻注入 | 只注入 skill **摘要目录**（名字 + 一句话） | 注入全部 Skill 的**完整 `content_markdown`**（`skillLoader.ts` 的 `buildCombinedSystemPrompt`） |
| 按需加载 | 通过 `skill` 工具显式加载**单个** skill 全文 | 无「按需加载」通道，全部全文拼进 system prompt |
| 效果 | 上下文恒小，模型注意力聚焦 | 上下文被框架协议 + 顶层 Skill + 页面 Skill 全文塞满，指引互相稀释 |

**结论**：目录常驻、正文懒加载，是 Agent 规模化的第一性原理。EADAF 应把 Skill 拆成「目录（slug + name + 一句话 + 授予哪些 Tool）」与「正文」，只在激活某页面/某能力时才加载对应正文。

### 原则 2：正交工具原语（Orthogonal Primitives，而非 资源×动词 爆炸）

- Harness 的工具按**能力动词**切分且正交：`Think`（思考）/ `Read`（读）/ `Glob`（发现）/ `Grep`（搜索）/ `Bash`（执行）/ `Write`（整写）/ `Edit`（定点改）/ `Skill`（加载能力）/ `todo_write`（状态）/ `ask_user`（决策门）/ `subagent`（委托）/ `goal`（目标）/ `job`（后台任务）。
- 文件操作拆成 Read/Write/Edit/Glob/Grep **五种**，而不是 `file(action: read|write|edit|glob|grep)` 一种；也不是 `file_read`、`file_write` 各自 5 个——它做到了「能力正交」与「粒度合理」的平衡。
- EADAF 现状是**资源 × 动词**爆炸：`bizdata_create_entity` / `bizdata_update_entity` / `bizdata_delete_entity` / `bizdata_rename_entity_code` / `bizdata_list_entity_summaries` / `bizdata_get_entity`……156 个 Tool 里大量是同构 CRUD。

**结论**：工具设计的目标不是「越少越好」，而是「**语义边界清晰、彼此不重叠、模型一眼能选对**」。详见第 6 章的合并方案。

### 原则 3：上下文经济（Context Economy）

Harness 的三层手段：
1. **注入最小化**：只注入「当下任务需要」的信息（skill 摘要、运行约束）。
2. **结果裁剪**：工具结果按预算截断，超预算标注 `[truncated]`。
3. **动态压缩**：历史按优先级分层，低优先级先裁，保留任务规约/任务清单。

EADAF 现状：`contextBudget.ts` 用**字符数估算**（120k 字符）做阈值，超 85% 后**粗暴 `slice(-12)`** 只留最近 12 条消息并打一个 `[Context compacted]` 标记——**丢失任务清单、丢失早期 Tool 结论**，恰好裁掉了方法论里「永远保留」的东西。

### 原则 4：状态外部化（Externalized State Machine）

- Harness 用 `todo_write`（任务清单，整表替换语义）、`create_goal/update_goal`（跨轮目标）、`job_*`（后台任务）把状态放在**工具可读写的外部载体**里，而不是靠模型「记着」。
- EADAF 已有 `update_plan` / `task_complete` / `reconcilePlan`，方向是对的，但状态载体是**模块级单例 `agentPlanState.ts` + React 闭包局部变量**（`useAIBaseChat.ts` 里大量 `let` 状态），存在多会话并发污染风险（见 P1-3）。

### 原则 5：委托与编排（Delegation & Orchestration）

- Harness：`subagent`（单点委托，后台跑）、`workflow`（大规模 fan-out 编排）、`ralph`（fresh-agent 迭代）。
- EADAF：**完全没有**委托/编排原语。所有多实体操作只能靠「一个超长上下文里串行 32/48 轮 Tool」硬啃，一旦规模上来（批量建模、批量物化、批量建 API），上下文和轮次上限就是天花板。

### 原则 6：汇报协议 + 显式收尾（Reporting & Closing）

- Harness：过程中**面向用户汇报关键信息**（阶段说明），结束时给「**交付内容 + 下一步建议**」，且交付前**自我 review**。
- EADAF：`task_complete.summary` + `next_steps`（A2UI 按钮）已具备「收尾」雏形，但缺「过程汇报协议」——用户只在终点看到结果，中间的黑盒期只能靠 `Planning next moves` 片段（当前**尚未正式落地到 UI**，见已有文档「待完成」清单）。

---

## 3. 核心技巧：可落地的工程清单

以下是可直接抄进 EADAF 的「工程技巧」，每条都标注 Harness 证据与 EADAF 落点。

### 3.1 上下文注入协议

- **技巧**：把注入物分成「常驻层 / 按需层 / 运行时层」三段，各段有明确的注入时机与字节预算。
- **落点**：
  - 常驻层：Agent 执行协议（结构化终止/汇报/工具结果契约）+ **Skill 目录摘要**（非全文）。
  - 按需层：当前页面激活 Skill 的正文、`aibase_read_surfaces` 读到的页面上下文。
  - 运行时层：语义路由清单（`semanticRoutesToMarkdown` 应按 domain 截断，而不是全量）。

### 3.2 工具定义单一事实源 + 代码生成

- **技巧**：工具的 `name/description/parameters` 只有一份权威定义，其余侧是它的投影（OpenAI schema、DB 行、前端 handler、文档），通过 codegen 或运行时校验保证一致。
- **落点**：见 P0-2 与第 7 章「修改点 M2」。

### 3.3 结果信封契约（Envelope Contract）

- **技巧**：所有工具返回统一信封 `{ ok, verified?, kind, data?, error?, agentHint?, meta }`，模型只消费信封，UI 只消费信封，日志只落信封。
- **EADAF 现状**：已具备 `ToolResponse` 信封（`types/toolResponse.ts`）与 `normalizeToolResult` 归一化，**这条是做对了的**，应保留并强化（把 `agentHint` 用足）。

### 3.4 结构化参数校验 + 自我纠错闭环

- **技巧**：在调用 handler 前用 JSON Schema 校验参数，失败时返回**结构化、可行动**的错误（「参数 X 非法，期望 enum=[…]，当前值=…」），让模型能自我修正，而不是抛一个 `system_error` 让模型猜。
- **落点**：见 P0-3。

### 3.5 收敛检测与熔断

- **技巧**：连续 N 次相同 Tool 签名 / 相同错误指纹 → 硬停止并请用户介入。
- **EADAF 现状**：`useAIBaseChat.ts` 已有 `detectConvergence()`（`CONVERGENCE_WINDOW = 3`），**做对了**，保留。

### 3.6 HITL 决策门（mid-task）

- **技巧**：方案取舍 / 危险写操作前，用结构化选择题挂起，而不是口头「请确认」。
- **EADAF 现状**：`ask_user` + `UserChoiceCard` + `waiting_user_choice` hard-stop 已具备，**做对了**。可补齐：危险写操作（delete/drop）强制前置确认的默认策略。

### 3.7 可观测性（回放与归因）

- **技巧**：每条工具调用落日志（入参/结果/耗时/信封），每个终止决策落「终止原因」，可回放「为什么停、为什么继续、为什么重复」。
- **EADAF 现状**：有 tool-invoke 日志 + `ai_termination_reason` 埋点，但缺**回放 UI 与归因面板**（`docs/improvements/p2-observability.md` 已知缺口）。

### 3.8 自我 review 再交付

- **技巧**：交付前让 Agent 对照成功标准自检一遍，再输出交付总结。
- **落点**：把 `task_complete` 的校验结果（`TASK_INCOMPLETE` 返回的 `incomplete` 列表）作为「自检清单」回灌，而非仅仅报错。

---

## 4. 现状盘点：EADAF Agent 架构地图

> 本章给出「问题分级」的事实依据。所有结论均来自代码阅读。

### 4.1 数据模型（backend）

- `Skill`（18 个）：`name/slug/content_markdown/completion_strategy/is_global/is_dedicated/scope_id`。
- `Tool`（156 个）：`name/slug/function_name/description/execution_type(client|server_http|server_builtin)/parameters_schema/review_markdown/server_config`。
- `SkillTool`（204 条）：skill ↔ tool 多对多，含 `sort_order`。
- `Application`：`top_level_skill_markdown`（顶层 Skill）。

### 4.2 前端循环（`@eadaf/ai-base`）

- 入口：`useAIBaseChat.ts`（**约 1200 行**的单体 Hook，Agent 主循环）。
- 每轮：`streamChatRound`（SSE）→ 解析 tool_calls → `runWithConcurrency`（上限 6）→ `invokeToolByMeta` 分派 → `executeToolWithEnvelope` 归一化 → 回灌 `role: tool`。
- 终止：`decideStructuredTermination`（结构化）/ `shouldAutoContinueAfterTextOnly`（旧 auto-continue）。
- 上下文：`contextBudget.ts` 字符数估算 + `slice(-12)`。

### 4.3 后端下发与执行

- `getCapabilities`：一次返回全部 scope/skill/tool 元数据 + 顶层 Skill。
- `getPublicBySlug(s)`：返回 Skill 全文 + 关联 Tool（含 openaiTools）。
- `toolInvoke`：`client / server_http / server_builtin` 三路分派；`http_request` 为通用兜底。
- `chatCompletions`：`llmGateway` 直通上游 Provider（透传 SSE）。

### 4.4 宿主注册（frontend）

- `AIChatClientToolsRegistrar` 一次性注册 10 个域的工具 handler + Skill 完成策略。
- `skillCompletionPolicies.ts`：前端对 `completion_strategy` 的覆盖（DB 为权威，前端覆盖优先）。
- `config/aiChat.ts`：注入 `systemPromptPrefix`（含「Tool 结果汇报硬约束」）+ 语义路由 + 结构化终止开关。

### 4.5 关键数字

| 指标 | 数值 | 说明 |
|------|------|------|
| Skill | 18 | 权威种子 `aibase-ai-seed.sql` |
| Tool | 156 | 同上 |
| Skill↔Tool 关联 | 204 | 多对多 |
| 单轮 Tool 轮次上限 | 32（旧）/ 48（结构化） | `MAX_TOOL_ROUNDS` / `STRUCTURED_MAX_TOOL_ROUNDS` |
| 单轮并发 Tool | 6 | `TOOLS_CONCURRENCY` |
| 上下文阈值 | 120k 字符 / 85% | `contextBudget.ts` |
| Tool 结果预算 | 8000 字符（默认） | `maxToolResultChars` |

---

## 5. 严重问题清单（P0–P5）

> 分级口径：**P0 = 直接导致「工具调用经常失败」或正确性事故，必须最先修；P1 = 架构级缺陷，第二阶段修；P2 = 治理/健壮性；P3 = 质量/可维护性；P4 = 文档/内容治理；P5 = 命名/规范。**

### P0-1：系统提示词与工具清单「全量注入」，无按需加载（上下文爆炸）

- **现象**：多 Skill 同时加载时，模型注意力被稀释，工具选择准确率下降；长对话/大页面下上下文快速耗尽。
- **证据**：
  - `skillLoader.ts#buildCombinedSystemPrompt`：把**所有**已加载 Skill 的 `contentMarkdown` 全文拼接进 system prompt。
  - `skillLoader.ts#loadChatSkillContext`：加载的是**全文**（`loadSkillsBySlugs`），没有「目录/正文」分离。
  - `useAIBaseChat.ts#openaiTools`：把当前 Skill 关联的**全部** Tool schema 一次性发给 LLM。
  - 语义路由清单 `semanticRoutesToMarkdown` 全量注入（跨所有 domain 的页面清单）。
- **影响**：指令稀释 → 工具选错/漏调 → 「工具调用经常失败」的主因之一；Token 成本高；多轮后上下文被 Skill 正文吃掉。
- **公平说明**：`fallbackSkillSlugs` 已把 Skill 加载收敛到「全局框架 + 当前页面 Skill」，所以单页 Tool 数并非恒定 156；本问题的本质不是「一次注入 156 个」，而是「**已激活的 Skill 正文 + 其全部 Tool schema + 全量语义路由**仍是**一次性全量注入**，没有目录/正文分离、没有按需加载」。
- **修复方向**：目录摘要常驻 + 正文按需加载 + 工具清单按页面 scope 裁剪 + 语义路由按 domain 截断（见 M1）。

### P0-2：工具定义无单一事实源，DB 与前端双源漂移

- **现象**：同一个 client Tool，DB 里的 schema 和前端 `registerFunctionCall` 里的 schema 可能不一致，导致模型按 DB schema 传参、handler 按前端 schema 解析 → 参数错位。
- **证据**：
  - `toolManifest.ts#mergeOpenAITools` 注释原话：「本地 client Tool 注册含完整 parameters，覆盖 DB 中可能过时的 schema」——**官方承认 DB schema 是二等公民**。
  - `toolInvokeService.js#formatOpenAITool`：server 工具 schema 来自 `parameters_schema`；而 client 工具 schema 来自前端 `registerFunctionCall`。两条链，无一致性保障。
- **影响**：schema 漂移 → 传参错 → 校验失败 → 工具调用失败；改一个工具要同时改 DB + 前端，易漏。
- **修复方向**：确立权威源（建议 DB 为准）+ codegen 生成前端 handler 骨架 + 启动期一致性校验（见 M2）。

### P0-3：缺少调用前参数校验与自我纠错闭环

- **现象**：模型传了非法参数（缺必填、枚举越界、类型错误），handler 直接抛错 → 归一化为 `system_error`，模型拿到的错误信息往往不可行动，反复试错。
- **证据**：
  - `invokeFunctionCall` / `invokeToolByMeta` 直接 `def.handler(args)`，无 JSON Schema 预校验。
  - `capabilityValidator.js` 只校验「模型能力」不校验「工具参数」。
  - `docs/improvements/p2-tool-param-validation.md` 已记录此缺口，但未见落地。
- **影响**：参数错误无法自我修复 → 多轮空转 → 收敛检测才硬停，体验差。
- **修复方向**：调用前用 `parameters` schema 做 `ajv/jsonschema` 校验，返回结构化错误（「参数 X 非法…」）供模型自纠（见 M3）。

### P0-4：工具粒度爆炸（资源 × 动词 = 156 个），大量可合并

- **现象**：用户明确感知「很多 Tool 可以合并」；模型在 `create/update/rename/delete/list/get` 六兄弟里选错是常态。
- **证据**：
  - `bizdata` 单域即 `create/update/rename/delete/list/get/upsert_indexes/validate…` 17 个 Tool（`registerBizDataTools.ts`）。
  - 权威种子 156 个 Tool / 204 条关联；同构 CRUD 占大头。
- **影响**：工具选择歧义 → 选错/漏选；schema/描述重复维护 → 漂移；每个 Tool 的描述质量参差 → 调用不稳定。
- **修复方向**：分域做「资源级泛化 Tool + 领域动作 Tool」合并（见 M4）。

### P1-1：两套终止机制并存，且仍重度依赖关键词启发式

- **现象**：`enableStructuredTermination=true` 走结构化终止，否则走旧 auto-continue；两套逻辑并存，行为分叉，回归面翻倍。
- **证据**：
  - `autoContinuePolicy.ts` 同时存在 `shouldAutoContinueAfterTextOnly`（关键词驱动）与 `decideStructuredTermination`（结构化）。
  - 代码注释声称「SDK 不再包含中文正则」，但实际仍有 `PROGRESS_NARRATION_RE`（`第[一二三四五六七八九十\d]+步`…）、`PROGRESS_CLOSING_RE`（`接下来您`…）、`WAITING_USER_CONFIRMATION_RE`（`确认后`…）三组中文正则，且 `completionKeywords/blockKeywords/claimRules` 本质仍是**关键词匹配决定任务完成**——正是「用自然语言决定终止」的反模式。
- **影响**：终止行为不可预测；业务方要维护一堆中文关键词；「过早结束/迟迟不结束」反复出现。
- **修复方向**：收敛为**单一**结构化终止，关键词只做「语言模式兜底」而非主信号（见 M5）。

### P1-2：Skill 完成策略双源 + 解析启发式，容易选错策略

- **现象**：`completion_strategy` 一份在 DB、一份在前端覆盖，`resolveTerminationCompletionStrategy` 用「第一个有策略的 Skill」这种启发式选主策略，可能选到错误 Skill 的写操作清单。
- **证据**：
  - `skillPolicyRegistry.ts#resolveTerminationCompletionStrategy` 注释原话记录了历史 bug：「查询页（uac-access-control）被建模/物化/API 写操作清单误伤」。
  - `getSkillCompletionStrategy` 浅合并（override 优先），合并语义对数组字段（requiredTools）是整体替换而非合并，易产生认知偏差。
- **影响**：查询型任务被写操作验收清单卡死；策略归属不清。
- **修复方向**：策略以「激活 Skill」而非「第一个有策略的 Skill」为准；策略 schema 收敛 + 显式合并语义（见 M6）。

### P1-3：Agent 状态用模块级单例 + React 闭包，多会话并发不安全

- **现象**：两个聊天会话（或快速重发）并发时，plan / toolOutcomes 可能互相污染。
- **证据**：
  - `agentPlanState.ts` 模块级 `let current`，注释自述是「holder 只保存最近一次 active turn」的 hack。
  - `useAIBaseChat.ts` 主循环状态（`accumulatedContent/toolOutcomes/invokedToolNames/recentToolSignatures…`）全部是闭包局部 `let`，无法单测、无法跨会话隔离。
- **影响**：多面板/微前端/并发会话下出现「A 会话的 plan 被 B 会话读走」类诡异 bug。
- **修复方向**：把状态收敛为 per-turn 的显式状态机对象（`turn-scoped context`），去掉模块级单例依赖（见 M7）。

### P2-1：上下文压缩是「字符估算 + 粗暴裁剪」，非语义压缩

- **现象**：超阈值直接丢早期消息，任务清单、早期 Tool 结论一并丢失，模型「失忆」。
- **证据**：`contextBudget.ts#compactHistoryForApi` 只 `history.slice(-KEEP_RECENT_MESSAGES)`（12 条）+ 打 `[Context compacted]` 标记。
- **修复方向**：分层保留（任务规约/任务清单/当前目标永远保留）+ 已完成步骤摘要化 + 旧 Tool 结果只留结论（见 M8）。

### P2-2：可观测性不足，无法归因「为什么停/继续/重复」

- **现象**：用户报「工具调用失败」时，只能靠读代码猜，无法回放。
- **证据**：`docs/improvements/p2-observability.md` 记录为已知缺口；虽有 tool-invoke 日志与 `ai_termination_reason` 埋点，但无回放 UI / 归因面板。
- **修复方向**：turn 级结构化轨迹（每轮：模型输出摘要 + 工具调用 + 结果信封 + 终止决策）+ 调试面板（见 M9）。

### P3-1：模块级副作用广泛存在，可测试性差

- **现象**：`functionRegistry`（Map）、`skillPolicyRegistry`（Map）、`agentPlanState`（holder）、`navigationChannel`、`themeChannel`、`userHabit`（localStorage）都是模块级状态。
- **证据**：`docs/improvements/p3-global-side-effects.md` 已记录。
- **修复方向**：依赖注入 + per-session 上下文容器，模块只做纯函数/通道（见 M7 附带的改造）。

### P3-2：错误处理无分级，模型拿到的错误不可行动

- **现象**：`normalizeToolResult` 把所有抛错归一为 `system_error`，不区分「可重试/参数错/权限/资源不存在/上游 5xx」。
- **修复方向**：错误信封增加 `category`（`invalid_args / not_found / forbidden / upstream / transient`），并附 `retryable` 与 `hint`（见 M3 附带）。

### P4-1：Skill/Tool 内容以 SQL 迁移散落，无版本化治理

- **现象**：`backend/scripts/archive/ai-content-seeds/` 有 50+ 个历史 SQL（归档区），`backend/scripts/` 还有几十个 `migrate-*-skill.sql`，Skill 正文藏在 SQL 字符串里，无法 diff/review/回滚。
- **修复方向**：Skill 正文迁移到版本化的 Markdown 文件（Git 可 diff），SQL 只做元数据引用（见 M6 附带）。

### P5-1：命名/边界/规范不一致

- **现象**：
  - Harness 用 `ask_user_question`，EADAF 用 `ask_user`；Harness 用 `todo_write`，EADAF 用 `update_plan`——命名无统一词表。
  - `useSendAIChatMessage` 已废弃仍导出；`exposeAllClientTools` 是「生产勿用」的逃生舱却长期保留在配置面。
  - 工具名 snake_case，字段 camelCase，混用。
- **修复方向**：建立「工具/字段命名词表 + 废弃清单」；清理逃生舱（见 M10）。

---

## 6. 本项目 Agent 规划（目标态与路线图）

### 6.1 目标态架构（分层）

```text
┌─────────────────────────────────────────────────────────────┐
│ L3 编排层（新增）：subagent / workflow 原语                   │
│   - 批量建模、批量物化、批量建 API 的 fan-out 委托            │
├─────────────────────────────────────────────────────────────┤
│ L2 能力层（Skill）：目录摘要常驻 + 正文按需加载               │
│   - Skill = 目录（slug/name/一句话/授予的 Tool 清单）         │
│           + 正文（Markdown，版本化于 Git，按激活才注入）       │
├─────────────────────────────────────────────────────────────┤
│ L1 工具层（Tool）：正交化 + 单一事实源 + 参数校验             │
│   - 资源级泛化 CRUD + 领域动作；schema 单一权威 + codegen      │
│   - 统一信封 + 错误分级 + agentHint                           │
├─────────────────────────────────────────────────────────────┤
│ L0 内核层（Agent 循环）：单一状态机 + 分层上下文              │
│   - 单一结构化终止；per-turn 状态容器；语义化上下文压缩        │
│   - 收敛检测 / 熔断 / HITL 决策门 / 汇报协议                  │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 工具合并方案（分域、分档，非一刀切）

> 原则：**读 = 资源级泛化（list/get/汇总读收敛到一个资源 Tool）；写 = 保留显式动词 + 业务规则（因为写携带校验/mutation/副作用语义）；领域动作（携带非平凡业务逻辑的）保留为独立 Tool。**

以 `bizdata` 域为例（17 个 → 约 7 个）：

| 现状 Tool | 合并后 | 说明 |
|-----------|--------|------|
| `list_entity_summaries` / `get_entity` | `bizdata_entity`（`action: list|get`） | 读收敛 |
| `create_entity` / `update_entity` / `rename_entity_code` / `delete_entity` | `bizdata_entity`（`action: create|update|rename|delete`） | 写收敛到同一资源 Tool，用 `action` 判别，`delete` 保留 `dropPhysicalTables` 等专属参数 |
| `upsert_entity_indexes` | 并入 `bizdata_entity`（`action: upsert_indexes`） | 索引是实体的子资源 |
| `list_enums` / `create_enum` / `update_enum` | `bizdata_enum`（`action: list|create|update`） | 资源级 |
| `list_relations` / `query_relation_graph` / `add_relation` / `delete_relation` | `bizdata_relation`（`action: list|graph|add|delete`） | 资源级 |
| `get_scope_description` / `upsert_scope_description` | `bizdata_scope_doc`（`action: get|upsert`） | 资源级 |
| `validate_model` | 保留 | 领域动作（携带校验业务规则） |

**关键权衡（必须写进设计）**：泛化 CRUD 会让单个 Tool 的 `parameters` 变复杂（`action` + 各 action 的 `oneOf` 子 schema）。对策：
1. `description` 写清「action 取值与对应参数」，用 `parameters` 的 `oneOf` 按 `action` 分派；
2. 服务端/前端用同一 schema 做校验，`action` 非法直接返回结构化错误；
3. **读操作泛化收益最大、风险最低**（读无副作用），**写操作若业务规则重，宁可保留显式动词**——不要为合并而合并。

其他域同理：`apiservice`（create/publish/run_test/list_draft…）可按「服务资源 + 发布/测试领域动作」合并；`metric`（upsert/card_upsert/execute/execute_batch）可按「指标资源 + 执行动作」合并。

### 6.3 Skill 治理方案

1. **目录/正文分离**：`getCapabilities` 只返回目录（slug/name/一句话/关联 Tool 名清单）；新增 `loadSkillBody(slug)` 按需取正文。
2. **正文版本化**：Skill `content_markdown` 迁到 Git 管理（`skills/<slug>.md`），DB 只存 slug + 引用路径 + 元数据；发布走 MR 评审。
3. **完成策略单一事实源 + 显式归属**：策略挂在「激活 Skill」上，`resolveTerminationCompletionStrategy` 改为「激活 Skill 优先，缺省才回退全局框架」，去掉「第一个有策略的 Skill」启发式。
4. **策略 schema 收敛**：合并 `requiredToolsMode/completionKeywords/blockKeywords/claimRules/continuousExecution` 为更小的「目标式」描述（`successCriteria + verifyTool`），关键词仅作兜底。

### 6.4 上下文管理方案

- **分层保留**（高→低，低优先裁）：TaskSpec/任务清单 → 当前目标 → 当前资源快照 → 最近 Tool 结论 → 历史摘要 → 勘察细节。
- **语义压缩**：完成步骤 → 摘要；旧 Tool 结果 → 只留 `ok/verified/结论`；已完成 Skill 正文 → 释放。
- **保留现有 `resultAggregation`（阶段 E）** 并推广到「跨轮摘要」。

### 6.5 路线图（里程碑）

| 里程碑 | 目标 | 交付物 | 依赖 |
|--------|------|--------|------|
| MS0 | 止血：单源 + 参数校验 | 工具 schema 权威源 + 调用前校验 + 结构化错误 | — |
| MS1 | 上下文瘦身 | 目录/正文分离 + 语义路由按 domain 截断 + 语义压缩 | MS0 |
| MS2 | 工具合并 | 分域资源级泛化（先读后写）+ 回归 | MS0 |
| MS3 | 终止收敛 | 单一结构化终止 + 策略显式归属 | MS2 |
| MS4 | 状态外置 | per-turn 状态机容器 + 去掉模块级单例 | MS3 |
| MS5 | 编排与观测 | subagent/workflow 原语 + 回放/归因面板 | MS4 |

---

## 7. 重点修改点与修改内容

> 每个修改点：**改什么 → 为什么 → 具体内容 → 验收标准**。文件路径以当前仓库为准。

### M1：Skill「目录/正文」分离 + 工具清单按 scope 裁剪

- **改什么**：`ai-base/src/registry/skillLoader.ts`、`chat/useAIBaseChat.ts`；`backend/src/controllers/aiCapabilityController.js`、`skillController.js`。
- **为什么**：治 P0-1 上下文爆炸。
- **内容**：
  1. `getCapabilities` 的 `skills` 数组改为**目录项**（slug/name/一句话 description/`toolNames[]`），不再下发 `content_markdown` 与 `openaiTools`。
  2. 新增 `loadSkillBody(slug)` 接口，返回单个 Skill 正文 + 关联 Tool 全文。
  3. `buildCombinedSystemPrompt` 注入目录摘要（而非全文）；当前激活页面 Skill 的正文在 `loadChatSkillContext` 阶段单独取、单独注入。
  4. 语义路由清单按 `domain` 分组后**按当前页面域截断**（未激活域不注入）。
- **验收**：单页 system prompt 中 Skill 正文只含「框架 + 当前激活页 Skill」；`semanticRoutes` 注入量与当前域相关；长对话 Token 用量可测下降。

### M2：工具定义单一事实源 + codegen

- **改什么**：`backend/src/services/ai/toolInvokeService.js`、`ai-base/src/registry/toolManifest.ts`、新增 `scripts/generate-tool-manifest`。
- **为什么**：治 P0-2 双源漂移。
- **内容**：
  1. 确立 **DB `tools` 表为权威源**（name/description/parameters_schema/execution_type/requires_verification）。
  2. 新增 codegen 脚本：读 DB（或导出 seed）→ 生成前端 `registerFunctionCall` 的**类型化骨架 + schema 常量**，handler 体留空由业务实现。
  3. 前端启动期做一致性校验：本地注册的 schema 与 DB schema 不一致时 `console.warn`（开发态）/ 上报（生产态）。
  4. `mergeOpenAITools` 的「本地覆盖 DB」逻辑改为「校验告警」而非静默覆盖。
- **验收**：client Tool 的 `parameters` 单一来源可追溯；改工具 schema 只改 DB + 跑 codegen；漂移被启动校验捕获。

### M3：调用前参数校验 + 错误分级

- **改什么**：`ai-base/src/utils/normalizeToolResult.ts`、`registry/functionRegistry.ts`、`chat/useAIBaseChat.ts#invokeToolByMeta`；`backend/src/services/ai/executeToolWithEnvelope.js`。
- **为什么**：治 P0-3 / P3-2。
- **内容**：
  1. 引入 `ajv`（前端）+ 同 schema（后端），在 handler 前按 `parameters` 校验 `args`；失败返回 `kind: 'business_error'` + `error.code: 'INVALID_ARGS'` + `error.message` 逐条列出「参数 X 非法，期望…」。
  2. `ToolResponseError` 增加 `category: 'invalid_args' | 'not_found' | 'forbidden' | 'upstream' | 'transient' | 'unknown'` 与 `retryable: boolean`。
  3. handler 抛错时按错误类型映射 category（HTTP 4xx→forbidden/not_found，5xx→upstream/transient）。
  4. 回灌 LLM 的信封附 `agentHint`：`invalid_args` 提示「请按 error.message 修正参数后重试」；`forbidden` 提示「无权限，向用户说明」。
- **验收**：传非法参数不再触发 handler 空转，模型收到可行动错误并能一次修正；错误信封可区分类别。

### M4：工具合并（分域资源级泛化）

- **改什么**：`frontend/src/pages/*/ai/register*.ts`、对应 seed SQL、`frontend/src/ai/skillCompletionPolicies.ts`。
- **为什么**：治 P0-4 工具爆炸。
- **内容**：按 6.2 方案执行，**先做读操作泛化（低风险），写操作分域评估**。
  - 第 1 批：`bizdata` 读收敛（list/get → `bizdata_entity(action)`）、`enum`、`relation`、`scope_doc` 资源化。
  - 第 2 批：写操作按「业务规则轻重」决定合并或保留显式动词。
  - 同步更新 Skill 目录的 `toolNames`、完成策略的 `requiredTools/claimRules`、语义路由与文档。
- **验收**：`bizdata` 域 Tool 数从 17 降到 ~7；模型在合并后的 `action` 判别上调用准确率提升；写操作回归全绿。

### M5：终止机制收敛为单一结构化终止

- **改什么**：`ai-base/src/chat/autoContinuePolicy.ts`、`useAIBaseChat.ts`、`config/runtime.ts`。
- **为什么**：治 P1-1 双机制 + 关键词依赖。
- **内容**：
  1. `enableStructuredTermination` 默认改为 `true`，移除旧 `shouldAutoContinueAfterTextOnly` 分支（保留为「关闭开关的降级路径」或直接删除）。
  2. 关键词（completionKeywords/blockKeywords/claimRules）降级为**语言模式兜底**，主信号改为 `plan 全 completed + 关键 Tool verified + successCriteria`。
  3. 三组中文正则移到「可配置的策略 DSL」中，SDK 不再内置中文业务正则。
- **验收**：终止行为只由 plan/Tool 验证驱动；删除旧分支后回归测试通过；业务方新增 Skill 无需改 SDK。

### M6：完成策略显式归属 + Skill 内容版本化

- **改什么**：`ai-base/src/registry/skillPolicyRegistry.ts`、`backend/scripts/`（Skill 正文外迁）、`backend/src/controllers/skillController.js`。
- **为什么**：治 P1-2 / P4-1。
- **内容**：
  1. `resolveTerminationCompletionStrategy` 改为「激活 Skill（fallbackSkillSlugs 第一个）优先，缺省回退全局框架」，去掉「第一个有策略」启发式；返回带 `slug` 的策略来源。
  2. 合并语义显式化：`requiredTools` 等数组字段明确「覆盖 or 并集」，避免歧义。
  3. Skill `content_markdown` 迁到 Git `skills/<slug>.md`，DB 存引用；新增导入/导出脚本；SQL 迁移仅改元数据。
- **验收**：策略来源可追溯；查询页不再被写操作清单误伤；Skill 正文可 diff/review。

### M7：Agent 状态容器化（去模块级单例）

- **改什么**：`ai-base/src/registry/agentPlanState.ts`、`chat/useAIBaseChat.ts`。
- **为什么**：治 P1-3 / P3-1。
- **内容**：
  1. 把 `agentPlanState` 的模块级 holder 改为**由 `useAIBaseChat` 显式创建、显式传入**的 `TurnContext` 对象（构造函数传入 plan/outcomes/strategy），`update_plan/task_complete` handler 通过 `getTurnContext(turnId)` 读取。
  2. 把主循环的散装 `let` 状态收拢进一个 `TurnState` 对象，便于单测与生命周期管理。
  3. 长线把 `functionRegistry/skillPolicyRegistry` 改为 per-provider 容器（依赖注入）。
- **验收**：两个会话并发时 plan/outcomes 互不污染；主循环可单元测试。

### M8：语义化上下文压缩

- **改什么**：`ai-base/src/chat/contextBudget.ts`。
- **为什么**：治 P2-1。
- **内容**：
  1. 保留「永远保留区」（任务清单 + 最近目标 + 最近 Tool 结论）。
  2. 历史消息按「优先级分层」裁剪，已完成步骤摘要化，而非 `slice(-12)`。
  3. 与 `resultAggregation` 打通：跨轮同类型 Tool 结果摘要化。
- **验收**：超阈值时任务清单/目标不丢；压缩后可回答「当前进度」类问题。

### M9：可观测性与回放面板

- **改什么**：`ai-base/src/utils/toolInvokeLogger.ts`、新增调试面板组件；`backend` 复用 `aiToolInvokeLogService`。
- **为什么**：治 P2-2。
- **内容**：
  1. turn 级轨迹：每轮记录「模型文本摘要 / tool_calls / 结果信封摘要 / 终止决策 reason」。
  2. 开发态调试面板：时间线展示「第 N 轮 → 调了什么 → 结果 → 为什么继续/停止」。
  3. 生产态脱敏后上报，供排查「工具调用失败」。
- **验收**：可回放任意 turn 的完整决策链；「为什么停/继续」可解释。

### M10：命名词表与逃生舱清理

- **改什么**：全局工具/字段命名、`config/runtime.ts`、`registry/builtinTools.ts`。
- **为什么**：治 P5-1。
- **内容**：
  1. 建立命名词表（工具动词 list/get/create/update/delete/upsert/validate/execute；字段 camelCase）。
  2. 废弃 `exposeAllClientTools` 生产逃生舱（改 dev-only 或移除）；清理 `useSendAIChatMessage` 等废弃导出。
- **验收**：命名一致；逃生舱不再在生产暴露。

---

## 8. 度量与验收标准

> 「怎么知道改好了」——在开工前先定义可量化的北极星指标。

| 指标 | 现状基线（估算） | 目标 |
|------|------------------|------|
| 单任务工具调用成功率（一次调用即 verified） | 低（用户反馈「经常失败」） | 关键写操作 ≥ 90% |
| 因参数错误触发的 `system_error` 占比 | 未测 | 下降 70%+（靠 M3） |
| 单页注入的 Tool 数 | 视页面，可达数十个 | 单页 ≤ 15 个 |
| 单页 system prompt 长度 | 长（全文 Skill + 全量路由） | 下降 50%+（靠 M1） |
| 终止误判率（过早/迟迟不结束） | 未测 | 查询型直收尾 + 写操作闭环各加回归 |
| 上下文压缩后的「失忆」投诉 | 存在 | 压缩后仍能回答「当前进度」 |

**验收套件**：为每条修改点补回归（参照已有 `.verify.ts` 模式），尤其覆盖「查询型直接收尾 / 进度叙述不误终止 / 参数校验自纠 / 多会话并发隔离」。

---

## 9. 风险、灰度与回滚

- **工具合并是最高风险项**：先读后写、分域灰度、保留旧 Tool 别名过渡（`bizdata_get_entity` 作为 `bizdata_entity` 的别名兼容一段时间）。
- **终止机制收敛**：用 `enableStructuredTermination` 开关灰度，保留旧分支一个版本周期再删。
- **Skill 正文外迁**：先双写（DB + Git），验证导入导出一致后再切只读 Git。
- **codegen**：只生成骨架与 schema 常量，不覆盖业务 handler 实现；生成物进 Git 以 diff。
- **回滚**：所有修改点保持向后兼容（旧 Tool 名/旧配置项至少一个版本周期）。

---

## 10. 附录：Harness 工具 ↔ EADAF 能力映射表

| Harness 原语 | 作用 | EADAF 对应 | 差距 |
|--------------|------|-----------|------|
| 上下文注入（system + skill catalog） | 常驻身份/约束/目录 | system prompt + Skill 全文 | 目录=全文，无懒加载 |
| `skill`（加载能力） | 按需加载 skill 正文 | 无 | **缺失** |
| `Think` | 推理 | `enable_thinking`（reasoning_content） | 已有 |
| `Read` / `Glob` / `Grep` | 观察 | 各域 `list/get/query_*` 工具 + `aibase_read_surfaces` | 分散、非正交 |
| `Bash` | 执行 | `server_builtin` handler + `http_request` | 已有（`http_request` 是好设计） |
| `Write` / `Edit` | 修改 | 各域 `create/update/upsert` | 粒度爆炸 |
| `todo_write` | 任务清单 | `update_plan` | 已有，但状态容器需去单例 |
| `task_complete`（结构化终止） | 显式收尾 | `task_complete` | 已有，双机制并存 |
| `ask_user_question` | HITL 决策门 | `ask_user` + ChoiceCard | 已有 |
| `subagent` | 单点委托 | 无 | **缺失** |
| `workflow` | fan-out 编排 | 无 | **缺失** |
| `goal`（跨轮目标） | 长任务续命 | 无（会话内循环 + 轮次上限） | **缺失** |
| `job`（后台任务） | 长任务异步 | 无（同步阻塞式多轮） | **缺失** |
| 汇报协议 | 过程汇报 + 交付总结 | `task_complete.summary` + `next_steps` | 缺过程汇报 |
| 自我 review | 交付前自检 | `task_complete` 校验 | 部分已有 |

---

## 结语

EADAF 的 Agent 并非「没做」，恰恰相反，它在**结果信封、收敛检测、HITL 决策门、结构化终止雏形、语义路由、结果预算**这些点上已经做对了，甚至部分比很多团队成熟。当前「工具调用经常失败」的根因不是缺功能，而是**工具与 Skill 的注入/组织方式违背了 Agent 规模化的两条第一性原理——上下文经济 与 单一事实源**：

1. 全文 Skill + 全量工具 + 全量路由一次注入 → 注意力稀释；
2. 工具 schema 双源漂移 + 无参数校验 → 传参错、自纠无门；
3. 156 个资源×动词工具 → 选择歧义。

因此本方案的重心不是「再堆功能」，而是**做减法与收敛**：目录化 Skill、正交化工具、单一事实源、单一终止状态机。按 MS0→MS5 的里程碑推进，每一阶段都有可量化的验收标准与回滚路径，风险可控。

> 文档工作结束。如需，可据此进一步产出「MS0 止血」的详细实施任务清单（每个修改点的具体 diff 级步骤）。
