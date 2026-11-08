# 03 — Tool 与参数契约

> 合并自：重设计方案 M2/M3/M4、[`p2-tool-param-validation.md`](../../improvements/p2-tool-param-validation.md)。  
> **这是「工具调用经常失败」的主修复面。**

---

## 1. 失败根因（写死）

不是「模型笨」，而是：

1. **无调用前 Schema 校验**：`JSON.parse` 失败曾静默成 `{}`；非法参数直进 handler
2. **双源漂移**：DB `parameters_schema` vs 前端 `registerFunctionCall` 的 parameters；`mergeOpenAITools` 曾用本地静默覆盖 DB
3. **错误不可行动**：一律 `system_error`，模型无法按字段修正

插件化后的权威源见 [01](./01-插件内核.md) §7：**运行时以 `defineTool` 代码为准**；DB 管授权与治理。

---

## 2. `defineTool` 契约

```ts
defineTool({
  name: 'bizdata_entity',
  description: '...',
  parameters: { /* JSON Schema / DSL → JSON Schema */ },
  output: {
    schema: { /* canonical value */ },
    render: (args, value) => '给模型的短文本',
  },
  presentCall?: (args) => ToolCallView,
  presentResult?: (args, result) => ToolResultView | DisplaySpec,
  async execute(args, exec) { /* handler */ },
})
```

三轨分离：

| 轨 | 消费者 | 内容 |
|----|--------|------|
| canonical `value` / `data` | 程序、二次校验、mutation | 结构化数据 |
| `render` / context 视图 | 模型（回灌 tool 消息） | 短、可行动、含 agentHint |
| `present*` / `display` | 用户 UI | Surface（table/entity/…） |

---

## 3. 调用前参数校验（MS0 必做）

### 3.1 规则

1. `arguments` 不是合法 JSON → **不执行** handler；回灌 `INVALID_ARGUMENTS_JSON` + raw 片段
2. 按 Tool 的 `parameters` 做 ajv 校验（`allErrors: true`）；失败 → `INVALID_ARGS`，逐条列出路径 / 期望 / 当前值
3. 回灌附 `agentHint`：`请按 error.message 修正参数后重试`
4. validator 按 schema 缓存编译，避免每调重编译

### 3.2 落点

| 位置 | 改动 |
|------|------|
| `ai-base` 新增 `validateToolArgs.ts` | ajv + formatAjvErrors |
| `useAIBaseChat` / `invokeToolByMeta` | parse → validate → handler |
| 后端 `toolInvoke` / `executeToolWithEnvelope` | server 路径同样校验 |
| `normalizeToolResult` | 错误分级（见下） |

前端依赖：`ajv`（+ 可选 `ajv-formats`）。

### 3.3 验收

- 缺必填 / 枚举越界 / 类型错误：不进业务 handler
- 模型能依据字段级错误一次修正
- 因参数错误导致的空转轮次下降（见 [10](./10-度量验收与风险.md)）

---

## 4. 错误分级

扩展 `ToolResponseError`：

```ts
category?:
  | 'invalid_args'
  | 'not_found'
  | 'forbidden'
  | 'upstream'
  | 'transient'
  | 'unknown'
retryable?: boolean
```

映射建议：

| 来源 | category | retryable |
|------|----------|-----------|
| Schema / JSON 解析 | `invalid_args` | true（改参后） |
| 404 / 资源不存在 | `not_found` | false（换 id） |
| 403 / 权限 | `forbidden` | false |
| 5xx / 超时 | `upstream` / `transient` | true |
| 未分类抛错 | `unknown` | false |

`kind` 仍用现有 `business_error` / `system_error`；`category` 供模型与观测面板使用。

---

## 5. 工具合并（分域、分档）

> 原则：**读 = 资源级泛化；写 = 显式动词或带 action 的资源 Tool（业务规则重则保留独立 Tool）。**

### 5.1 bizdata 示例（约 17 → ~7）

| 现状 | 合并后 |
|------|--------|
| list/get entity | `bizdata_entity`（`action: list\|get`） |
| create/update/rename/delete | 同资源 Tool + `action`；delete 保留专属参数 |
| upsert indexes | `action: upsert_indexes` |
| enum CRUD | `bizdata_enum` |
| relation list/graph/add/delete | `bizdata_relation` |
| scope doc get/upsert | `bizdata_scope_doc` |
| `validate_model` | **保留**（领域动作） |

`parameters` 用 `oneOf` / 按 `action` 分派；非法 action 直接 `INVALID_ARGS`。

### 5.2 其他域

- `apiservice`：服务资源 + 发布/测试领域动作
- `metric`：指标资源 + execute / execute_batch

### 5.3 风险控制

- **先读后写**；写操作分域评估
- 旧 Tool 名做别名兼容至少一个版本周期
- 同步更新 Skill `toolNames`、完成策略 `requiredTools` / `claimRules`

---

## 6. 与 DB / 管理面的关系

- 管理面 Tool 行：记录 name、描述摘要、execution_type、requires_verification、启停、Skill 关联
- 运行时 schema：**以插件 `defineTool` 为准**同步到发给 LLM 的 openaiTools
- 启动校验：DB 授权集合与已注册工具名对齐；描述可从插件回写或管理面维护，避免双源 parameters

兼容层：过渡期仍可读 DB `parameters_schema`，但若与插件不一致 → **告警而非静默覆盖**。

---

## 6.1 Tool 契约总线（跨应用）

运行时统一入口：`ToolContractRegistry`（`registerToolContractSource` / `resolveVisibleContracts`）。

```text
可见池 = Skill 授权名 ∩ 各契约源已注册契约
```

| 角色 | API |
|------|-----|
| 业务包注册契约 | `registerToolContractSource({ id, list })` |
| EADAF 默认适配 | `ensureFunctionRegistryContractSource()`（`registerFunctionCall` → 契约） |
| LLM 下发 | `resolveVisibleContracts(authorized).map(toolContractToOpenAITool)`；无契约的 server Tool 回退 DB meta |
| 调用前校验 | `getToolContract(name)?.parameters` → `validateToolArgs` |
| run_code | `tools.list()` / `tools.schema(name?)`；子调用先校验再 handler |

DB **只做授权与启停**，不以 `parameters_schema` 为运行时权威。其它业务系统（FMMS 等）只需挂自己的 `ToolContractSource`，无需再写 overlay。

`validateToolArgs`：`required` 中的 string 为空串/空白一律失败（跨业务通用）。

---

## 7. 命名词表（P5）

- 工具动词：`list` / `get` / `create` / `update` / `delete` / `upsert` / `validate` / `execute`
- 工具名 snake_case；字段 camelCase（对外 JSON 与前端一致处按现有约定）
- 废弃生产态 `exposeAllClientTools` 逃生舱；清理废弃导出

---

## 8. 修改点索引（实施时）

| ID | 内容 | 优先级 |
|----|------|--------|
| M3 | 调用前校验 + 错误分级 | P0 / MS0 |
| M2' | 插件权威 schema + 启动一致性校验 | P0 / MS1 |
| M4 | 分域工具合并 | P0 / MS4 |
| M10 | 命名词表与逃生舱清理 | P5 |
