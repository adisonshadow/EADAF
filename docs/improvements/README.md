# AIBase SKILL/TOOL 架构提升路线（P2 / P3）

> **状态：已被 [`docs/TODOs/新Agent架构方案/`](../TODOs/新Agent架构方案/README.md) 吸收为总路线图的一部分。**  
> 参数校验 → [03-Tool与参数契约](../TODOs/新Agent架构方案/03-Tool与参数契约.md)；观测 / 分级 → [09](../TODOs/新Agent架构方案/09-路线图与问题分级.md) / [10](../TODOs/新Agent架构方案/10-度量验收与风险.md)。  
> 下列分文件仍保留 **file:line 锚点与改动清单**，实施时可对照；排期以新方案里程碑为准。

本文档集是 AIBase SKILL/TOOL 框架的**后续提升路线**，按优先级分文件存放，便于针对性修改。
P0 / P1 已在本次实现完成，以下是尚未实施的 P2、P3 项。

| 优先级 | 文档 | 一句话 |
|--------|------|--------|
| P2 | [p2-skill-tool-caching.md](./p2-skill-tool-caching.md) | Skill/Tool 加载 N+1 + 无缓存，改批量接口 + 内存缓存 |
| P2 | [p2-tool-param-validation.md](./p2-tool-param-validation.md) | Tool 参数 JSON.parse 失败静默吞掉，改为 Schema 校验 + 结构化错误回灌 |
| P2 | [p2-observability.md](./p2-observability.md) | 可观测性薄弱：补 traceId 串联 + 成功率/p50/p99 指标 |
| P3 | [p3-global-side-effects.md](./p3-global-side-effects.md) | 全局 monkey-patch（history）与模块级单例（aiChatBridge）收敛 |

## 通用约定

- **SDK 包根**：`package/ai-base/src/`（对外 `@eadaf/ai-base`，产物在 `dist/`）。
- **改动后必做**：`cd package/ai-base && npx tsc --noEmit && npx tsup`；
  若改了 `EADAF_frontend` 消费的导出，还需 `pnpm refresh:ai-base`（在 frontend 根）。
- **后端改动**：跑对应 `backend/scripts/migrate-*.sql`；涉及 controller 时用
  `node -e "require('./src/controllers/xxx.js')"` 快速自检语法。
- **每个文档包含**：背景、当前问题（含 `file:line` 锚点）、目标方案、改动清单（按文件）、
  验证方式、风险/回退。建议按文档内的「改动清单」逐项落地。

## 与已完成 P0/P1 的关系

- P2 的「Skill 缓存」与 P0-1 后端 `completionStrategy` 下发有协同：批量接口返回里已含
  `completionStrategy`，缓存后前端无需逐个 `loadSkill`。
- P2 的「参数校验」回灌结构化错误，与 P0-2 的并行执行兼容（每个 `executeOneToolCall` 独立校验）。
- P3 的「aiChatBridge 收敛」与 P1-2 的 namespace 化思路一致（多实例隔离）。
