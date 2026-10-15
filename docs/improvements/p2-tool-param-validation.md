# P2 — Tool 参数 Schema 校验

> **已被吸收**：实施以 [`新Agent架构方案/03-Tool与参数契约.md`](../TODOs/新Agent架构方案/03-Tool与参数契约.md)（MS0）为准；本文保留 file:line 锚点。

## 背景

模型产出的 `tool_calls[i].function.arguments` 是流式拼接的字符串，可能畸形（截断、
字段缺失、类型不符）。当前 `JSON.parse` 失败时**静默降级为 `{}`**，handler 拿到空对象
往往报「参数缺失」的误导性错误；更糟的是参数类型错误（如把数组传成字符串）会一路透传
到 handler 内部才报错，且错误信息对模型不友好（无法据此自我修正）。

Tool 元数据里已带 `parameters`（OpenAI function JSON Schema），但**完全没有被用于校验**。

## 当前问题（锚点）

- `package/ai-base/src/chat/useAIBaseChat.ts:610-614`（`executeOneToolCall` 内）：
  ```ts
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(call.function?.arguments || '{}');
  } catch {
    args = {};   // ← 静默吞掉解析失败，handler 收到空对象
  }
  ```
- `package/ai-base/src/registry/toolManifest.ts` 的 `toOpenAIToolFromMeta`
  生成 `parameters` 但仅用于发给 LLM，从不用于运行时校验。
- 后端 `backend/src/services/ai/toolInvokeService.js` `invokeTool` 也不校验 args。

## 目标方案

1. **JSON 解析失败**：不静默吞，构造结构化错误回灌（`role:'tool'` content 为
   `{error, ...}`），让模型看到「参数不是合法 JSON」并重试。
2. **Schema 校验**：用 `ajv` 按 `parameters` 校验 args；失败时回灌**可读的字段级错误**
   （如 `field X is required` / `field X must be string`），引导模型自我修正。
3. **可选**：支持严格模式（拒绝非法参数）vs 宽松模式（记录警告但仍执行）。

## 改动清单（按文件）

### 前端 SDK

- **新增依赖**：`ajv` + `ajv-formats`（peer 或 direct；考虑包体积可用 `ajv/dist/2020`）。
  在 `package/ai-base/package.json` 加 `dependencies`。
- **新建 `package/ai-base/src/utils/validateToolArgs.ts`**：
  ```ts
  import Ajv, { type ErrorObject } from 'ajv';
  const ajv = new Ajv({ allErrors: true, strict: false });

  export interface ToolArgValidationResult {
    valid: boolean;
    errors?: ErrorObject[];        // ajv 原始错误
    message?: string;              // 人读摘要，用于回灌模型
  }

  /** 校验 args 是否符合 OpenAI function JSON Schema（parameters） */
  export function validateToolArgs(
    args: Record<string, unknown>,
    parameters?: Record<string, unknown>,
  ): ToolArgValidationResult;

  /** 把 ajv 错误转成可读字符串（含字段路径） */
  export function formatAjvErrors(errors: ErrorObject[]): string;
  ```
  缓存编译后的 validator（按 schema 序列化做 key），避免每次重编译。
- **`package/ai-base/src/chat/useAIBaseChat.ts`**（`executeOneToolCall` 内，
  JSON.parse 之后、`invokeToolByMeta` 之前）：
  ```ts
  let args: Record<string, unknown>;
  let parseError: string | undefined;
  try {
    args = JSON.parse(call.function?.arguments || '{}');
  } catch (e) {
    parseError = `arguments 不是合法 JSON: ${(e as Error).message}`;
    args = {};
  }

  if (parseError) {
    // 不执行 handler，直接回灌结构化错误
    return {
      role: 'tool',
      content: serializeToolResultForContext(
        { error: 'INVALID_ARGUMENTS_JSON', message: parseError, raw: call.function?.arguments },
        budget,
      ),
      tool_call_id: call.id,
      name: functionName,
    };
    // 注意：appendToolStep 标记 error，不进 invokeToolByMeta
  }

  const validation = validateToolArgs(args, toolMeta?.parametersSchema);
  if (!validation.valid) {
    const message = `参数校验失败: ${validation.message}`;
    appendToolStep({ id: stepId, functionName, displayName, status: 'error', error: message });
    return {
      role: 'tool',
      content: serializeToolResultForContext(
        { error: 'INVALID_ARGUMENTS', message, details: validation.errors },
        budget,
      ),
      tool_call_id: call.id,
      name: functionName,
    };
  }
  ```
  → 把这段插在 `startedAt`/`invokedToolNames.add` 之前，校验不过不计入「已执行」。
- **`index.ts`** 导出 `validateToolArgs`、`formatAjvErrors`（供业务方复用 / 测试）。

### 后端（可选，对称加固）

- **`backend/src/services/ai/toolInvokeService.js`** `invokeTool`：
  引入 `ajv`，按 `tool.parameters_schema` 校验 `args`，失败抛 `{ code: 'INVALID_ARGS' }`。
  后端校验主要是防止绕过前端的直接调用（如 server_http 工具被外部触发）。

## 验证方式

- 单元测试 `validateToolArgs`：构造 `{required:['id']}` schema，传 `{}` → valid:false，
  message 含 `id is required`。
- 集成：让模型故意产出畸形 arguments（或 mock `call.function.arguments = '{bad'`），
  确认回灌 `role:'tool'` content 含 `INVALID_ARGUMENTS_JSON`，且模型下一轮能据此修正。
- 回归：正常参数下 `validateToolArgs` 返回 valid:true，handler 照常执行。

## 风险 / 回退

- `ajv` 包体积（~130KB min）：对 SDK 有影响。备选：轻量自实现「required + type」校验
  （覆盖 90% 场景），ajv 作为可选增强。
- 某些 Tool 的 `parameters_schema` 可能为空或 `{}`（无约束）→ 校验跳过（valid:true），
  不影响现有行为。
- 严格模式可能过度拦截「模型传了额外字段」→ ajv `additionalProperties` 默认不报错，
  仅校验声明字段；如需严格再开。
