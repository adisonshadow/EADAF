# EADAF Skill 应用合理性审查

> **状态：架构层结论已被新 Agent 架构方案吸收；勿再按本文单独作为总方案。**  
> **继任文档**：[`docs/TODOs/新Agent架构方案/02-Skill按需加载.md`](./TODOs/新Agent架构方案/02-Skill按需加载.md)、[`08-多应用扩展.md`](./TODOs/新Agent架构方案/08-多应用扩展.md)（总览 [README](./TODOs/新Agent架构方案/README.md)）。  
> 下文保留作审查否决项与路径速查归档。
>
> **本文档**：2026-07-30 对照代码的人工审查结论与待办清单。  
> **旧文档**（AI 初稿，保留不覆盖）：[`skill-management-analysis.md`](./skill-management-analysis.md)  
> **审查范围**：Skill 分层、可见性、加载链路、完成策略、种子与管理面；不展开逐 Skill 全文点评（初稿第三部分仍可作参考）。

---

## 1. 总评

**当前 Skill 应用方式合理，应保持；真正要治的是权威源分裂与漂移，不是「切错了 Skill」。**

| 维度 | 结论 |
|------|------|
| 按**阶段**拆 Skill（建模 / 物化 / API create·manage·test-fix / 指标…） | 合理，靠 Tool 池隔离阶段边界 |
| 页面 `fallbackSkillSlugs` 收窄 | 合理，刻意放在前端 wrappers，不是缺 DB 表 |
| 全局 `aibase-chat-framework` + 业务 Skill | 合理；结构化终止协议另有 `skillLoader` 硬注入 |
| `completion_strategy`（DB）+ 前端 `registerSkillCompletionPolicy` | 机制对，运维差：双源 + UI 不可见 + 已有错 slug / 旧 tool 名 |
| 可见性靠 migrate 事后补 `is_dedicated` | 可运行但脆弱；新 Skill 易漏 |

**不要做的事（明确否决）：**

- 合并 `aibase-capability-design` / `-manage`（页面已拆，合并只扩大 Tool 池）
- 按「读 / 写」拆 Skill（大量任务是查→改→查；读写应共处，分的是阶段）
- 用后端 `scopeSlug` 过滤重做一套页面绑定（会与 `fallbackSkillSlugs` 打架）
- 把「测试成功后收束」塞进全局 framework（过宽，只留在 API Skill / Tool review）
- 把 Scope 说明自动注入绑进本次治理（产品增强，正交）

---

## 2. 运行时模型（应保持）

```text
DB skills (is_global / is_dedicated + skill_applications)
        │
        ▼
GET /v1/ai/capabilities?applicationId=   ← 应用可见集合
        │
        ▼
loadChatSkillContext
  · 只加载 isGlobal ∪ fallbackSkillSlugs
  · 拼 system prompt：结构化协议 → prefix → 顶层 Skill → 各 Skill 正文
  · Tool 池 = 已加载 Skill 的 tools 去重 + harness（update_plan / task_complete）
        │
        ▼
resolveTerminationCompletionStrategy     ← 只选一个主 Skill 策略
  · DB completion_strategy
  · 前端 registerSkillCompletionPolicy 浅合并覆盖
```

**两道闸门：**

1. **后端** `filterSkillsForContext`：无 `applicationId` → `[]`；否则 `is_global` 或 `is_dedicated ∧ 绑定该应用`。`scopeSlug` 传入但**不参与过滤**（页面隔离交给前端）。
2. **前端** `skillLoader`：有 `fallbackSkillSlugs` 时只加载全局框架 + 当前页 Skill。

**写操作验收（值得保持）：**

- Tool 信封 `_verification.verified`
- `task_complete` → `TASK_INCOMPLETE` 强制继续
- `claimRules` / `requiredTools` / `terminationStrictness`

**提示 vs 强制（共识）：**

| 规则 | 正文提示 | 系统强制 | 关系 |
|------|----------|----------|------|
| `update_plan` / `task_complete` | 教模型怎么用 | strict 拦错误调用 | 互补，缺一不可 |
| 一次一事 / 阶段边界 | 有 | 无（仅靠 Tool 池没有下游工具） | 正文是唯一归宿，不可删 |

---

## 3. 相对旧文档的校正

旧稿 [`skill-management-analysis.md`](./skill-management-analysis.md) 架构与 Q2/Q3 设计答疑可信，但下列判断需校正：

| 旧稿说法 | 校正 |
|----------|------|
| P1：`test-form` 错 slug → 自动修复闭环失效 | **严重度下调**。结构化终止已默认开启；DB `migrate-skill-task-complete.sql` 已对正确 slug `bizdata-api-service-test-fix` 写入含 `continuousExecution` 的策略。前端 `bizdata-api-service-test-form` 错 slug 主要让 **blockKeywords 覆盖**失效，不是整条闭环死掉。 |
| 「多数终止策略只在前端」 | **半过时**。DB 已批量写入；前端是覆盖层（keywords / claimRules 更细）。 |
| P0 重复 Tool UUID | **已通过权威种子收敛解决**：现库导出的 [`aibase-ai-seed.sql`](../../backend/scripts/aibase-ai-seed.sql) 中 id 唯一；历史分散 seed 已归档，不再重放。 |
| `bizdata-mock-data` 策略 | **已删**前端死注册；MOCK 仍挂在 `bizdata-materialization` Tool 池。 |
| metrics / manage 策略 | **已对齐**：DB 与前端均用 claimRules + 真实 tool 名。 |

### 已核实的漂移点（已修复）

- ~~DB metrics：`bizdata_save_metric`~~ → 现为 claimRules + `bizdata_metric_upsert` 等
- ~~DB manage：全局 `requiredTools: run_test`~~ → 现为 claimRules 按声称匹配

### 管理面缺口

- ~~Skills 表单不编辑 `completionStrategy`~~ → **已支持** JSON 编辑
- ~~保存后未调用 `invalidateSkillCache`~~ → Skill/Tool 表单与 Admin AI Tool 写路径已失效缓存
- Public `GET /ai/skills/:slug` 无 application 闸门（依赖前端只请求白名单）— 仍开放

---

## 4. 权威源现状

**AI 内容种子已收敛（2026-07-30）：**

| 文件 | 职责 |
|------|------|
| [`aibase-ai-seed.sql`](../../backend/scripts/aibase-ai-seed.sql) | scopes / tools / skills / skill_tools / skill_applications / 顶层 Skill（现库导出） |
| [`aibase-seed.sql`](../../backend/scripts/aibase-seed.sql) | providers / models 示例 |
| [`export-aibase-ai-seed.js`](../../backend/scripts/export-aibase-ai-seed.js) | 从现库重新导出权威种子 |
| [`archive/ai-content-seeds/`](../../backend/scripts/archive/ai-content-seeds/) | 历史分散 `*-ai-seed` / `migrate-*-skill`（勿再挂回 initdb） |

`initdb.sh --with-aibase-seed` 仅跑 `aibase-seed.sql` + `aibase-ai-seed.sql`。

仍可能双源：前端 `skillCompletionPolicies.ts`（覆盖层）与 `skillLoader` 硬编码结构化协议文案。

治理目标：**行为以 DB / aibase-ai-seed 为主权威；前端仅保留确需代码表达的覆盖；UI 可编辑并可失效缓存。**

---

## 5. TODO（按执行顺序）

> 明确不做的项见 §1，不列入 TODO。

### 立刻（确定性正确性）

- [x] **T1** ~~修分散 seed 重复 UUID~~ → 从现库导出 `aibase-ai-seed.sql`，归档历史 AI 内容增量；`initdb --with-aibase-seed` 只跑权威种子。
- [x] **T2** 修正 `skillCompletionPolicies.ts`：`test-fix` 正确 slug；删除 `bizdata-mock-data`。
- [x] **T3** 对齐 metrics：`claimRules` + 真实 tool 名（已写回 DB 并编入权威种子）。
- [x] **T4** manage 收敛为 claimRules（已写回 DB 并编入权威种子）。

### 短期（降低脆弱性）

- [x] **T5** 权威种子已含 `is_dedicated` + `skill_applications`；后续改 Skill 请改库后重跑 `export-aibase-ai-seed.js`。
- [x] **T6** Skills 管理 UI 支持编辑 / 展示 `completionStrategy`（JSON）。
- [x] **T7** Skill / Tool 管理保存成功后调用 `invalidateSkillCache`（表单 + Admin AI Tool）。
- [x] **T8** 为 `filterSkillsForContext` 补注释。

### 中期（提示工程与可维护性）

- [x] **T9** Handler SDK 契约单一源：权威文案在 Tool `apiservice_check_handler` review；create/manage/test-fix Skill 与 create/update Tool review 改为短指针（`apply-skill-midterm-hardening.js`）。
- [x] **T10** 抽取前端 `BLOCK_SUGGEST_NEXT` / `BLOCK_WAIT_CONFIRM` / `BLOCK_MODEL_RECREATE` 常量。
- [x] **T11** 收敛 create/manage「成功判定/二次验证」冗长禁令；model-design「禁止口头已生效」统一为 verified 表述。
- [x] **T12** ~~试点 markdown SSOT~~ → 由权威种子替代；日常：改库 / 管理 UI → `export-aibase-ai-seed.js`。
- [x] **T13** ~~清理 Demo 种子重复~~ → 历史种子已归档，权威种子只保留一份。
- [x] **T14** `api-services-collection-pipeline` Skill id：`…7710` → `…7730`（不再与 `member-org` scope / 其他元数据撞号）。

### 暂缓 / 不在本清单

| 项 | 原因 |
|----|------|
| Scope doc 自动注入 Tool 信封 / Surface | 产品增强，与 Skill 治理正交；单独评估 token |
| 合并 capability design/manage | 否决，见 §1 |
| 后端按 scopeSlug 做页面级 Skill 过滤 | 与 `fallbackSkillSlugs` 职责重叠 |
| 为每个只读 Skill 再堆前端策略 | DB 已对 provider/model/capability 写 `plan-only` |
| Soft-delete / Skill 版本表 / page↔skill DB 表 | 非当前痛点；有明确产品需求再开 |

---

## 6. 关键路径速查

| 职责 | 路径 |
|------|------|
| **权威 AI 种子** | `backend/scripts/aibase-ai-seed.sql` |
| 导出脚本 | `backend/scripts/export-aibase-ai-seed.js` |
| 中期正文硬化（可重复跑） | `backend/scripts/apply-skill-midterm-hardening.js` |
| 历史增量归档 | `backend/scripts/archive/ai-content-seeds/` |
| 加载 / 拼 prompt | `package/ai-base/src/registry/skillLoader.ts` |
| 策略覆盖 / 主 Skill 解析 | `.../skillPolicyRegistry.ts` |
| 前端业务策略注册 | `frontend/src/ai/skillCompletionPolicies.ts` |
| 页面 Skill 绑定 | `frontend/src/wrappers/*AI.tsx` |
| 可见性过滤 | `backend/src/controllers/skillController.js` → `filterSkillsForContext` |

---

## 7. 验收标准（做到哪算阶段性完成）

**立刻 + 短期项（已完成）：**

- [x] `initdb --with-aibase-seed` 只依赖权威种子，不再重放几十个 AI migrate
- [x] 前端无指向不存在 slug 的 `registerSkillCompletionPolicy`
- [x] metrics / manage 的 DB 与前端策略语义一致（claimRules）
- [x] 管理页可改 `completionStrategy`，保存后 `invalidateSkillCache`

**中期项完成：**

- [x] API Handler 契约以 `apiservice_check_handler` review 为单一权威源
- [x] blockKeywords 常量抽取
- [x] collection-pipeline Skill UUID 去撞号
- [x] 权威种子已重导出（含上述正文/策略变更）
