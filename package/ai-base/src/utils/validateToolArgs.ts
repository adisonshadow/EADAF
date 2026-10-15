import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  // 模型常多传字段；默认不因 additionalProperties 失败
  validateSchema: false,
});

const validatorCache = new Map<string, ValidateFunction>();

export interface ToolArgValidationResult {
  valid: boolean;
  errors?: ErrorObject[];
  /** 人读摘要，用于回灌模型 */
  message?: string;
}

function schemaCacheKey(parameters: Record<string, unknown>): string {
  try {
    return JSON.stringify(parameters);
  } catch {
    return String(parameters);
  }
}

/** 把 ajv 错误转成可读字符串（含字段路径） */
export function formatAjvErrors(errors: ErrorObject[]): string {
  return errors
    .map((err) => {
      const path = err.instancePath?.replace(/^\//, '').replace(/\//g, '.') || '(root)';
      const expected =
        err.params && typeof err.params === 'object'
          ? Object.entries(err.params as Record<string, unknown>)
              .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
              .join(', ')
          : '';
      const detail = expected ? `（${expected}）` : '';
      return `${path}: ${err.message || 'invalid'}${detail}`;
    })
    .join('; ');
}

function isEmptySchema(parameters?: Record<string, unknown> | object | null): boolean {
  if (!parameters || typeof parameters !== 'object') return true;
  const row = parameters as Record<string, unknown>;
  const keys = Object.keys(row);
  if (keys.length === 0) return true;
  // `{ type: 'object' }` / `{ type: 'object', properties: {} }` 视为无约束
  if (row.type === 'object') {
    const props = row.properties;
    const required = row.required;
    const hasProps = props && typeof props === 'object' && Object.keys(props as object).length > 0;
    const hasRequired = Array.isArray(required) && required.length > 0;
    if (!hasProps && !hasRequired) return true;
  }
  return false;
}

/**
 * 按 OpenAI function JSON Schema（parameters）校验 args。
 * schema 为空或无约束时直接通过。
 * required 中的 string 字段若为 "" / 纯空白，视为缺参（跨业务通用）。
 */
export function validateToolArgs(
  args: Record<string, unknown>,
  parameters?: Record<string, unknown> | object | null,
): ToolArgValidationResult {
  if (isEmptySchema(parameters)) {
    return { valid: true };
  }

  const schema = parameters as Record<string, unknown>;
  const key = schemaCacheKey(schema);
  let validate = validatorCache.get(key);
  if (!validate) {
    try {
      validate = ajv.compile(schema);
      validatorCache.set(key, validate);
    } catch (err) {
      // schema 本身非法时不阻断业务，仅告警
      console.warn('[validateToolArgs] schema compile failed:', err);
      return { valid: true };
    }
  }

  const blankRequired = collectBlankRequiredStrings(args, schema);
  const ok = validate(args);
  if (ok && blankRequired.length === 0) return { valid: true };

  const errors = [...(validate.errors || [])];
  const blankMsgs = blankRequired.map((field) => `${field}: 不能为空字符串`);
  const ajvMsg = errors.length ? formatAjvErrors(errors) : '';
  const message = [...blankMsgs, ajvMsg].filter(Boolean).join('; ') || '参数不符合 schema';

  return {
    valid: false,
    errors,
    message,
  };
}

/** required string 字段值为空串/空白时列出字段名 */
function collectBlankRequiredStrings(
  args: Record<string, unknown>,
  schema: Record<string, unknown>,
): string[] {
  const required = Array.isArray(schema.required)
    ? (schema.required as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  if (!required.length) return [];
  const props =
    schema.properties && typeof schema.properties === 'object'
      ? (schema.properties as Record<string, unknown>)
      : {};
  const blank: string[] = [];
  for (const field of required) {
    const propSchema = props[field];
    const isStringProp =
      propSchema &&
      typeof propSchema === 'object' &&
      (propSchema as { type?: unknown }).type === 'string';
    if (!isStringProp) continue;
    const value = args[field];
    if (typeof value === 'string' && value.trim() === '') {
      blank.push(field);
    }
  }
  return blank;
}

/** 测试用：清空编译缓存 */
export function clearValidateToolArgsCache(): void {
  validatorCache.clear();
}
