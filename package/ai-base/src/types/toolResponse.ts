export type ToolResultKind = 'success' | 'business_error' | 'system_error' | 'user_choice_request';

export type ToolErrorCategory =
  | 'invalid_args'
  | 'not_found'
  | 'forbidden'
  | 'upstream'
  | 'transient'
  | 'unknown';

export type ToolDisplayKind =
  | 'table'
  | 'entity'
  | 'metric'
  | 'chart'
  | 'diff'
  | 'approval'
  | 'json'
  | 'empty'
  | 'status'
  | 'planning'
  | 'error';

export interface ToolDisplay {
  kind: ToolDisplayKind;
  title?: string;
  payload: unknown;
  /** 默认展开 / 折叠 */
  collapsed?: boolean;
  /**
   * 结果区可见性（实测1）：
   * - sticky：保持展示（业务 list/get 等，默认）
   * - transient：当前步可展开；下一条 Tool 开始后自动折叠
   * - result_hidden：成功时不挂 Surface，仅 ThoughtChain 一行
   */
  visibility?: 'sticky' | 'transient' | 'result_hidden';
  /** 折叠后预览行数（默认 2） */
  previewLines?: number;
}

export interface ToolResponseError {
  code?: string;
  message: string;
  hint?: string;
  category?: ToolErrorCategory;
  retryable?: boolean;
}

export interface ToolResponse<T = unknown> {
  /** 执行完成（含业务失败；未捕获异常时为 false） */
  ok: boolean;
  /** 写操作：业务侧二次校验通过 */
  verified?: boolean;
  kind: ToolResultKind;
  data?: T;
  error?: ToolResponseError;
  /**
   * 仅回灌 LLM 的行为提示（不展示给用户）。
   * 例如写成功后提醒立刻调用 navigate_to_page。
   */
  agentHint?: string;
  /** 用户可见 Surface（与模型文本解耦） */
  display?: ToolDisplay;
  meta: {
    tool: string;
    durationMs?: number;
  };
}

export function isToolResponse(value: unknown): value is ToolResponse {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.ok === 'boolean' &&
    typeof row.kind === 'string' &&
    row.meta != null &&
    typeof (row.meta as Record<string, unknown>).tool === 'string'
  );
}

/** 构造参数错误信封（不执行 handler） */
export function buildInvalidArgsEnvelope(
  tool: string,
  message: string,
  code: 'INVALID_ARGS' | 'INVALID_ARGUMENTS_JSON' = 'INVALID_ARGS',
): ToolResponse {
  return {
    ok: false,
    kind: 'business_error',
    error: {
      code,
      message,
      hint: '请按 error.message 修正参数后重试',
      category: 'invalid_args',
      retryable: true,
    },
    agentHint: '请按 error.message 修正参数后重试',
    display: {
      kind: 'error',
      title: '参数错误',
      payload: { code, message },
    },
    meta: { tool },
  };
}
