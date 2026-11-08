# 02 — Skill 按需加载与治理

> 合并自：重设计方案 M1/M6、[`skill-application-review.md`](../../skill-application-review.md)。

---

## 1. 问题

当前 [`skillLoader.ts`](../../../package/ai-base/src/registry/skillLoader.ts) 的 `buildCombinedSystemPrompt` 把**已加载 Skill 的全文**拼进 system prompt；`loadChatSkillContext` 拉取的也是全文。结果：

- Token 被框架协议 + 顶层 Skill + 页面 Skill 吃满
- 多 Skill 指引互相稀释 → 工具选错 / 漏调
- 无「先看目录再加载正文」的通道

`fallbackSkillSlugs` 已把加载收敛到「全局框架 + 当前页」，这是对的；缺的是 **Catalog / Body 分离**。

---

## 2. 目标模型：Catalog vs Body

| 类型 | 内容 | 何时进入模型上下文 |
|------|------|-------------------|
| **SkillSummary（目录）** | slug、name、一句话 description、授予的 `toolNames[]`、invocation 标志 | 常驻（capabilities / pre-step catalog） |
| **SkillDefinition（正文）** | Summary + `contentMarkdown`（SOP） | 调用 `skill` 工具或当前页预取后 |

对齐 Harness：

- catalog 用 digest 去重，变更才 republish
- 正文经 `skill` tool 结果注入（如 `<skill_content name="...">`），或用户快捷指令等价物

### 2.1 接口变化（概念）

1. `getCapabilities` 的 `skills` 改为**目录项**，不再下发全文与完整 openaiTools 大包（Tool schema 仍按「当前可见 Tool 池」下发，见下）
2. 新增 `loadSkillBody(slug)` / 批量 body 接口
3. 新增 harness 工具 **`skill`**：`{ name | slug }` → 返回正文；失败返回可行动错误
4. `buildCombinedSystemPrompt`：常驻 = 执行协议 + 目录摘要；当前页 Skill 正文可预取注入；其余靠 `skill` 懒加载

### 2.2 当前页预取策略

- `fallbackSkillSlugs` 中的业务 Skill：**允许预取正文**（降低首轮延迟）
- 全局框架 Skill：保留精简协议注入（结构化终止协议可继续硬注入，但应逐步收敛体积）
- 未激活 Skill：只出现在目录；需要时再 `skill` 加载

### 2.3 Tool 池与 Skill 的关系

- 模型可见 Tool = 已激活 Skill 授予的 Tool ∪ harness 内置 Tool ∪（可选）`run_code`
- 加载某个远程 Skill 正文时，若其授予额外 Tool，需同步扩展可见 Tool schema（或要求业务 Skill 已在 application 绑定内）——第一期可限制为「目录内 Skill 的 Tool 已在 capabilities 授权集合中」
- **硬验收（实测4）**：`skill` 工具成功返回后，**同回合后续 LLM round** 的 `tools:` 必须已包含该 Skill 的 `grantedTools`；不得等下一用户消息 / React 重渲染才扩展。实现上用 turn 内 Tool 池 ref + `expandAvailableTools`，与 `run_code` / `run_subagent` 的 `availableToolNames` 同源。
- `skill` 回灌须带 `grantedTools: string[]`，并提示模型直接 native 调用，禁止再用 `run_code` 探路。
- 目录项（理想态）含 `toolNames[]` 摘要，便于模型在未拉正文前知道能力边界。

---

## 3. 运行时闸门（应保持）

来自 Skill 应用审查，**不要推翻**：

```text
DB skills (is_global / is_dedicated + skill_applications)
        │
        ▼
GET /v1/ai/capabilities?applicationId=   ← 应用可见集合
        │
        ▼
loadChatSkillContext
  · 只加载 isGlobal ∪ fallbackSkillSlugs（正文：预取或懒加载）
  · Tool 池 = 已激活 Skill 的 tools 去重 + harness
        │
        ▼
resolveTerminationCompletionStrategy
  · 激活 Skill 优先，缺省回退全局框架（去掉「第一个有策略的 Skill」启发式）
```

两道闸门：

1. **后端** `filterSkillsForContext`：无 `applicationId` → `[]`；否则全局或专用绑定该应用
2. **前端** 页面 `fallbackSkillSlugs`：收窄到当前页

`scopeSlug` 不参与后端过滤（页面隔离交给前端）——保持。

---

## 4. 治理结论（明确否决）

| 不要做 | 原因 |
|--------|------|
| 合并 `aibase-capability-design` / `-manage` | 页面已拆；合并只扩大 Tool 池 |
| 按「读 / 写」拆 Skill | 大量任务是查→改→查；分的是**阶段**不是读写 |
| 用后端 `scopeSlug` 重做页面绑定 | 与 `fallbackSkillSlugs` 打架 |
| 把「测试成功后收束」塞进全局 framework | 过宽 |

**应保持**：按阶段拆 Skill（建模 / 物化 / API create·manage·test-form / 指标…）；写操作靠 `_verification.verified` + `task_complete` 验收。

---

## 5. 完成策略（单一归属）

问题：`completion_strategy` DB + 前端 `registerSkillCompletionPolicy` 双源；`resolveTerminationCompletionStrategy` 曾用「第一个有策略的 Skill」误伤查询页。

目标：

1. 策略归属 = **激活业务 Skill**（`fallbackSkillSlugs[0]` 或显式 active），缺省回退 `aibase-chat-framework`
2. 返回值带 `slug` 来源，便于观测
3. 数组字段合并语义显式化（覆盖 vs 并集）
4. 长期：关键词（completionKeywords 等）降为兜底；主信号 = plan + verified + successCriteria（见 [06](./06-闭环与终止.md)）

---

## 6. Skill 正文版本化

现状：正文散落在 SQL / 权威种子 `aibase-ai-seed.sql`，难 diff。

目标路径：

1. 过渡期：DB 仍存 `content_markdown`；导出脚本保持权威种子
2. 目标：`skills/<slug>.md`（Git）+ DB 存 slug / 元数据 / 引用；发布走 MR
3. 双写验证后再切只读 Git

管理面：继续可编辑 `completionStrategy`；保存后 `invalidateSkillCache`。

---

## 7. 语义路由截断（与 Skill 同属「注入经济」）

`semanticRoutesToMarkdown` 应按当前页面 `domain` / `scopeGroup` 截断；未激活域不注入全文清单。详见 [07](./07-语义路由.md)。

---

## 8. 验收（MS2）

- [ ] capabilities 下发无全文 Skill body（或仅目录）
- [ ] 存在 `skill` harness 工具；懒加载正文可回归
- [x] **同回合** `skill` 成功后扩展可见 Tool schema（grantedTools + turn 池；实测4）
- [ ] 单页 system prompt 中预取正文 ≤「框架 + 当前页 Skill」
- [ ] 查询页策略不再被写操作清单误伤（策略来源可追溯）
- [ ] Token / 字符用量相对基线可测下降