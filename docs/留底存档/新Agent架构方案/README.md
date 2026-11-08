# 新 Agent 架构方案

> **状态**：权威方案（取代下列旧文档）  
> **日期**：2026-08-14  
> **范围**：`@eadaf/ai-base` + EADAF 宿主前端/后端 AI 链路 + 业务系统插件扩展面  
> **性质**：架构与工程方案（**本稿只写文档**；代码按 [09-路线图与问题分级](./09-路线图与问题分级.md) 分里程碑实施）

---

## 一句话定位

EADAF Agent **不是编程 Agent**，而是挂在 **Web 业务系统**上的**业务自动化 Agent**：用 Skill 目录按需加载、Cordis 插件组合、标准化 Tool Surface、以及可选的 `run_code`（JS/Python）编排已注册 Tool，完成数据底座与业务系统上的自动化任务。

---

## 阅读地图

| 顺序 | 文档 | 读什么 |
|------|------|--------|
| 0 | [00-定位与原则](./00-定位与原则.md) | 业务 Agent vs 编程 Agent；七条原则 |
| 1 | [01-插件内核](./01-插件内核.md) | Cordis 服务表、双平面、composition |
| 2 | [02-Skill按需加载](./02-Skill按需加载.md) | 目录/正文分离、`skill` 工具、治理否决项 |
| 3 | [03-Tool与参数契约](./03-Tool与参数契约.md) | defineTool、校验、错误分级、工具合并 |
| 4 | [04-代码运行时](./04-代码运行时.md) | `run_code`、JS/Python 边界 |
| 5 | [05-展示协议](./05-展示协议.md) | Surface 词表、默认展示、Planning |
| 6 | [06-闭环与终止](./06-闭环与终止.md) | 六阶段、结构化终止、查询型直收尾 |
| 7 | [07-语义路由](./07-语义路由.md) | 语义清单、`navigate_to_page`、自动跳转 |
| 8 | [08-多应用扩展](./08-多应用扩展.md) | EADAF vs 业务系统；插件包约定 |
| 9 | [09-路线图与问题分级](./09-路线图与问题分级.md) | P0–P5、MS0–MS6、修改点 |
| 10 | [10-度量验收与风险](./10-度量验收与风险.md) | 指标、灰度、回滚 |

**建议路径**：先读 00 → 01 → 05（定位 + 插件 + 展示痛点），再按实施需要读 02/03/04；做终止/跳转时读 06/07；接业务系统读 08；排期读 09/10。

---

## 取代关系（旧文档勿再按旧文实施）

下列文档文首已标注「已被本目录取代」；内容已收敛进上表对应章节。**不删除旧文件**，避免外链失效。

| 旧文档 | 收敛到 |
|--------|--------|
| [`docs/TODOs/AI数据底座Agent重设计方案.md`](../AI数据底座Agent重设计方案.md) | 00 / 01 / 02 / 03 / 09 / 10 |
| [`docs/AIBase 成熟闭环与 Planning next moves 统一方案.md`](../../AIBase%20成熟闭环与%20Planning%20next%20moves%20统一方案.md) | 05（Planning）/ 06 |
| [`docs/TODOs/AIBase-语义化路由与AI决策跳转方案-v2.md`](../AIBase-语义化路由与AI决策跳转方案-v2.md) | 07 |
| [`docs/TODOs/AIBase-语义化路由与AI决策跳转方案.md`](../AIBase-语义化路由与AI决策跳转方案.md)（v1，已被 v2 取代） | 07（仅历史） |
| [`docs/skill-application-review.md`](../../skill-application-review.md) | 02 / 08 |
| [`docs/improvements/`](../../improvements/)（P2/P3） | 03 / 05 / 09 |

---

## 方法论对照（Harness → EADAF）

对照本地 DeepSeek Harness（`deepseek-harness-master`）可复用的是**方法论与接口形状**，不是整仓依赖：

| Harness | EADAF 新方案 |
|---------|--------------|
| Cordis 一切皆插件 | `@eadaf/ai-base` 内 Cordis Context（Agent 能力平面） |
| Skill catalog + `skill` 懒加载 | `ctx.skills` + harness `skill` 工具 |
| `defineTool` + 调用前校验 | `ctx.tools` + ajv；错误可行动 |
| `presentCall` / `presentResult` | `ctx.surfaces` + `ToolResponse.display` |
| Code Mode `run_code` | 可选；JS Worker/后端 + Python 后端；默认仍 native tools |
| bash / Landlock / 改仓库 | **不引入**（非业务 Agent 核心） |

---

## 里程碑速览

| 里程碑 | 目标 | 状态 |
|--------|------|------|
| **MS0** | 止血：参数校验 + 错误分级 + 默认 Surface | 已落地（2026-08-14） |
| **MS1** | Cordis 插件内核包现有 registry | 已落地（2026-08-14） |
| **MS2** | Skill 目录/正文分离 + `skill` 工具 | 已落地（2026-08-14） |
| **MS3** | `run_code`（JS → Python） | 已落地骨架（JS 浏览器；Python/服务端执行待接） |
| **MS4** | 工具合并 + 单一结构化终止 | 已落地（读合并 + 结构化终止默认主路径） |
| **MS5** | 多应用插件包约定 | 已落地（`createBusinessPluginPack`） |
| **MS6** | 编排（subagent）+ 回放观测 | 已落地骨架（2026-08-15）：`run_subagent` + Turn 回放面板 + 指标 |

详见 [09-路线图与问题分级](./09-路线图与问题分级.md)。

---

## 明确不做

- 不把 DeepSeek Harness 当运行时依赖；不 vendor bash/FS/Landlock
- 不把 `run_code` 设为默认工具入口
- 不按「读/写」拆 Skill（按阶段拆 + 页面 `fallbackSkillSlugs`）
- 业务按钮不得直连 chat completions；统一 `sendMockUserMessage` + Skill/Tool
