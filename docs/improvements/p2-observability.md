# P2 — 可观测性（trace 串联 + 指标）

> **已被吸收**：排期见 [`新Agent架构方案/09`](../TODOs/新Agent架构方案/09-路线图与问题分级.md) MS6 与 [`10`](../TODOs/新Agent架构方案/10-度量验收与风险.md)；本文保留锚点。

## 背景

当前可观测性零散且不串联：
- 前端 `toolInvokeLogger` 只是个 logger + listener set，**无结构化指标**（成功率、
  p50/p99 耗时、按 tool 聚合）。
- 一次 turn 内多轮（LLM 请求）×多个工具调用的**因果关系丢失**——无法把
  「第 3 轮的 `search_orders` 调用」与「整个 turn」关联。
- 后端 `ApiRequestLog` 只记 chat 请求，**工具调用的审计/成本不完整**：
  `POST /v1/ai/tools/invoke` 没有写日志表。

结果：出问题时（某工具偶发超时、模型陷入死循环、token 成本突增）很难定位。

## 当前问题（锚点）

- `package/ai-base/src/utils/toolInvokeLogger.ts`：
  ```ts
  export interface ToolInvokeLogEntry {
    side, name, args, success, durationMs, result?, error?, executionType?
    // ← 无 turnId / round / traceId
  }
  let toolInvokeLogger: ToolInvokeLogger | null = null;  // 单 logger，无聚合
  ```
- `package/ai-base/src/chat/useAIBaseChat.ts` 的 tool 循环：
  无 turnId 贯穿；每次 `executeOneToolCall` 独立 log，丢失「属于第几轮 / 哪个会话」。
- 后端 `backend/src/controllers/aiServiceController.js` 写 `ApiRequestLog`（trace_id、slug、
  status、duration），但 `aiCapabilityController.invokeTool`（`/v1/ai/tools/invoke`）
  **不写日志**。
- 后端 `backend/src/models/api_request_log.js` 无 tool 调用相关字段。

## 目标方案

1. **前端 turnId 串联**：每次 `submitQuery` 生成一个 `turnId`，贯穿该 turn 的所有轮次与
   工具调用，注入 `ToolInvokeLogEntry`。
2. **前端指标聚合**：提供 `getToolMetrics()` 返回按 tool 维度的成功率/p50/p99/调用次数，
   供调试面板或上报。
3. **后端 tool 调用审计**：`/v1/ai/tools/invoke` 写 `ApiRequestLog`（或新表
   `ai_tool_invoke_log`），含 functionName、executionType、duration、error、turnId（从请求头透传）。
4. **（可选）OpenTelemetry**：把 turnId / round 作为 span attributes，接入 OTel。

## 改动清单（按文件）

### 前端 SDK

- **`package/ai-base/src/utils/toolInvokeLogger.ts`**：
  ```ts
  export interface ToolInvokeLogEntry {
    side: ToolInvokeSide;
    name: string;
    args: Record<string, unknown>;
    success: boolean;
    durationMs: number;
    result?: unknown;
    error?: string;
    executionType?: string;
    turnId?: string;   // ← 新增
    round?: number;    // ← 新增（第几轮 LLM 请求）
    conversationKey?: string; // ← 新增
  }
  ```
- **`package/ai-base/src/chat/useAIBaseChat.ts`**（`submitQuery` 开头）：
  ```ts
  const turnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  ```
  在 `executeOneToolCall` 内把 `turnId`、`round`、`conversationKey` 传给
  `invokeToolByMeta` → `withToolInvokeLog`（需透传）。
- **新建 `package/ai-base/src/utils/toolMetrics.ts`**：
  ```ts
  export interface ToolMetric {
    name: string;
    calls: number;
    successes: number;
    failures: number;
    successRate: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    avgMs: number;
  }
  // 内部 ring buffer（按 tool 聚合最近 N 次），subscribeToolInvoke 自动更新
  export function getToolMetrics(): ToolMetric[];
  export function resetToolMetrics(): void;
  export function subscribeToolMetrics(listener: () => void): () => void;
  ```
- **`package/ai-base/src/chat/useAIBaseChat.ts`**（chat 请求头）：
  在 `streamChatRound` 的 fetch headers 加 `X-AIBase-TurnId: <turnId>`，让后端能关联。

### 后端

- **`backend/src/controllers/aiServiceController.js` `chatCompletions`**：
  从 `ctx.get('x-aibase-turnid')` 取 turnId，写入 `ApiRequestLog.turn_id`（新列）。
- **`backend/src/controllers/aiCapabilityController.js` `invokeTool`**：
  成功/失败后写 `ApiRequestLog`（或复用）：functionName、executionType、durationMs、
  error_code、turn_id（从 header）、user_id（从 auth）。包在 `withToolInvokeLog` 后。
- **`backend/src/models/api_request_log.js`**：加列 `turn_id`（string, nullable）、
  `tool_function_name`（string, nullable）、`tool_execution_type`（string, nullable）。
- **新建 `backend/scripts/migrate-api-request-log-tool-audit.sql`**：ALTER TABLE 加列。
- **（可选）`backend/src/controllers/aiRequestLogController.js`**：list 接口支持按 turnId
  过滤，返回「一个 turn 内的 chat 请求 + tool 调用」完整时间线。

### 前端管理页（可选）

- 在 AI 管理 → 请求日志页加「按 turn 展开」视图：同 turnId 的 chat + tool 调用聚合展示。

## 验证方式

- 前端：发一条会触发多轮工具的消息，`getToolMetrics()` 应返回各 tool 的聚合指标；
  `subscribeToolInvoke` 的 entry 含相同 turnId。
- 后端：查 `api_request_logs`，同一 turnId 下应有 1 条 chat + N 条 tool 调用，
  durationMs 可拼出完整耗时瀑布。
- 调试面板（可临时）：渲染 metrics 表，确认成功率/p95 合理。

## 风险 / 回退

- metrics 内存占用：ring buffer 限最近 1000 次/tool，避免无界增长。
- turnId 透传 header：需确保 `streamToolChat.ts` 的 fetch 与 `client.invokeServerTool`
  都带上（两处 fetch）。
- 后端日志表膨胀：按业务量加 TTL / 定期清理；或单独 `ai_tool_invoke_log` 表便于分区。
- 既有 `ToolInvokeLogEntry` 新增字段全可选，旧 listener 不受影响。
