import type {
  ToolErrorCategory,
  ToolResponse,
  ToolResponseError,
  ToolResultKind,
} from '../types/toolResponse';
import { isToolResponse } from '../types/toolResponse';
import { formatToolInvokeError } from './toolInvokeLogger';
import { inferToolDisplay } from './inferToolDisplay';

const MAX_ERROR_MESSAGE = 120;
const MAX_VALIDATION_MESSAGE = 800;

function truncateMessage(text: string, max = MAX_ERROR_MESSAGE): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function buildError(
  partial: Partial<ToolResponseError> & { message: string },
  messageMax = MAX_ERROR_MESSAGE,
): ToolResponseError {
  return {
    code: partial.code,
    message: truncateMessage(partial.message, messageMax),
    hint: partial.hint ? truncateMessage(partial.hint, 200) : undefined,
    category: partial.category,
    retryable: partial.retryable,
  };
}

/** 从抛错文案粗分 category（供模型与观测） */
export function categorizeThrownError(error: unknown): {
  category: ToolErrorCategory;
  retryable: boolean;
} {
  const text = formatToolInvokeError(error).toLowerCase();
  if (
    text.includes('invalid_args') ||
    text.includes('invalid_arguments') ||
    (text.includes('参数') && (text.includes('非法') || text.includes('校验')))
  ) {
    return { category: 'invalid_args', retryable: true };
  }
  if (
    text.includes('404') ||
    text.includes('not found') ||
    text.includes('不存在') ||
    text.includes('未找到')
  ) {
    return { category: 'not_found', retryable: false };
  }
  if (
    text.includes('403') ||
    text.includes('401') ||
    text.includes('forbidden') ||
    text.includes('unauthorized') ||
    text.includes('无权限') ||
    text.includes('权限')
  ) {
    return { category: 'forbidden', retryable: false };
  }
  if (
    text.includes('timeout') ||
    text.includes('etimedout') ||
    text.includes('econnreset') ||
    text.includes('network') ||
    text.includes('超时')
  ) {
    return { category: 'transient', retryable: true };
  }
  if (/\b5\d{2}\b/.test(text) || text.includes('upstream') || text.includes('bad gateway')) {
    return { category: 'upstream', retryable: true };
  }
  return { category: 'unknown', retryable: false };
}

function extractVerification(payload: unknown): { verified?: boolean; message?: string } {
  if (!payload || typeof payload !== 'object') return {};
  const row = payload as Record<string, unknown>;
  const verification = row._verification as Record<string, unknown> | undefined;
  if (verification && typeof verification.verified === 'boolean') {
    const message =
      typeof verification.message === 'string'
        ? verification.message
        : typeof row.error === 'string'
          ? row.error
          : undefined;
    return { verified: verification.verified, message };
  }
  if (typeof row.verified === 'boolean') {
    return {
      verified: row.verified,
      message: typeof row.error === 'string' ? row.error : undefined,
    };
  }
  return {};
}

function unwrapMutationData(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const row = raw as Record<string, unknown>;
  if ('data' in row && 'mutation' in row) return row.data;
  return raw;
}

function inferFromPayload(
  payload: unknown,
): Pick<ToolResponse, 'ok' | 'verified' | 'kind' | 'data' | 'error'> {
  if (payload == null) {
    return { ok: true, kind: 'success', data: payload };
  }

  if (typeof payload === 'object') {
    const row = payload as Record<string, unknown>;

    if (typeof row.error === 'string' && row.error.trim()) {
      return {
        ok: false,
        kind: 'business_error',
        error: buildError({ message: row.error, category: 'unknown', retryable: false }),
      };
    }

    if (row.error && typeof row.error === 'object') {
      const errObj = row.error as Record<string, unknown>;
      const message = typeof errObj.message === 'string' ? errObj.message : '操作失败';
      return {
        ok: false,
        kind: 'business_error',
        error: buildError({
          code: typeof errObj.code === 'string' ? errObj.code : undefined,
          message,
          hint: typeof errObj.hint === 'string' ? errObj.hint : undefined,
          category:
            typeof errObj.category === 'string'
              ? (errObj.category as ToolErrorCategory)
              : 'unknown',
          retryable: typeof errObj.retryable === 'boolean' ? errObj.retryable : false,
        }),
      };
    }

    if (row.success === false) {
      const message =
        typeof row.error === 'string'
          ? row.error
          : typeof row.message === 'string'
            ? row.message
            : '操作未成功';
      return {
        ok: true,
        verified: false,
        kind: 'business_error',
        data: payload,
        error: buildError({ message, category: 'unknown', retryable: false }),
      };
    }

    if (row.isValid === false) {
      const errors = Array.isArray(row.errors) ? row.errors.filter(Boolean).join('；') : '';
      return {
        ok: true,
        verified: false,
        kind: 'business_error',
        data: payload,
        error: buildError({
          code: 'VALIDATION_FAILED',
          message: errors || '校验未通过',
          category: 'invalid_args',
          retryable: true,
        }),
      };
    }

    const { verified, message: verificationMessage } = extractVerification(row);
    if (verified === false) {
      return {
        ok: true,
        verified: false,
        kind: 'business_error',
        data: payload,
        error: buildError({
          code: 'VERIFICATION_FAILED',
          message: verificationMessage || '业务校验未通过',
          category: 'unknown',
          retryable: false,
        }),
      };
    }

    if (verified === true) {
      return {
        ok: true,
        verified: true,
        kind: 'success',
        data: payload,
      };
    }

    if (row.success === true && row.verified === false) {
      const message = typeof row.error === 'string' ? row.error : '操作未通过验证';
      return {
        ok: true,
        verified: false,
        kind: 'business_error',
        data: payload,
        error: buildError({ message }),
      };
    }

    if (row.success === true) {
      return {
        ok: true,
        verified: row.verified === true ? true : undefined,
        kind: 'success',
        data: payload,
      };
    }
  }

  return {
    ok: true,
    kind: 'success',
    data: payload,
  };
}

export interface NormalizeToolResultOptions {
  tool: string;
  rawResult?: unknown;
  thrownError?: unknown;
  durationMs?: number;
  requiresVerification?: boolean;
}

/** 将 handler 原始返回值或异常规范为 ToolResponse 信封 */
export function normalizeToolResult(options: NormalizeToolResultOptions): ToolResponse {
  const { tool, rawResult, thrownError, durationMs, requiresVerification } = options;

  if (thrownError !== undefined) {
    const { category, retryable } = categorizeThrownError(thrownError);
    const envelope: ToolResponse = {
      ok: false,
      kind: 'system_error',
      error: buildError({
        code: 'SYSTEM_ERROR',
        message: formatToolInvokeError(thrownError),
        hint:
          category === 'invalid_args'
            ? '请按 error.message 修正参数后重试'
            : '请根据错误信息修正参数或重试',
        category,
        retryable,
      }),
      meta: { tool, durationMs },
    };
    envelope.display = inferToolDisplay(envelope);
    return envelope;
  }

  if (isToolResponse(rawResult)) {
    const envelope: ToolResponse = {
      ...rawResult,
      meta: { ...rawResult.meta, tool: rawResult.meta.tool || tool, durationMs },
    };
    if (!envelope.display) {
      envelope.display = inferToolDisplay(envelope);
    }
    return envelope;
  }

  const unwrapped = unwrapMutationData(rawResult);
  const inferred = inferFromPayload(unwrapped);

  let kind: ToolResultKind = inferred.kind;
  let verified = inferred.verified;
  let error = inferred.error;

  if (requiresVerification && verified !== true) {
    kind = 'business_error';
    verified = false;
    error =
      error ||
      buildError({
        code: 'VERIFICATION_REQUIRED',
        message: '写操作未完成业务校验（verified 不为 true）',
        hint: '请调用校验 Tool 或检查返回数据后再汇报',
        category: 'unknown',
        retryable: false,
      });
  }

  const envelope: ToolResponse = {
    ok: inferred.ok,
    verified,
    kind,
    data: inferred.data,
    error,
    meta: { tool, durationMs },
  };
  envelope.display = inferToolDisplay(envelope);
  return envelope;
}

/** 从信封中提取用于 LLM 的精简视图（不含 display，保留 category / agentHint） */
export function toToolResponseContextView(envelope: ToolResponse): ToolResponse {
  return {
    ok: envelope.ok,
    verified: envelope.verified,
    kind: envelope.kind,
    error: envelope.error,
    meta: envelope.meta,
    data: envelope.data,
    ...(envelope.agentHint ? { agentHint: envelope.agentHint } : {}),
  };
}

/** 校验失败时使用较长 message，避免字段级错误被截断 */
export function buildValidationError(
  partial: Partial<ToolResponseError> & { message: string },
): ToolResponseError {
  return buildError(partial, MAX_VALIDATION_MESSAGE);
}
