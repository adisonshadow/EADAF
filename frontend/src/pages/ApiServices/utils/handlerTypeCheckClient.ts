import { parseInterfaceFields } from './parseInterfaceFields';
import {
  getApiServiceHandlerSdkDts,
  postApiServiceCheckHandler,
  type ApiServiceHandlerCheckResult,
  type ApiServiceHandlerDiagnostic,
} from '@/services/EADAF/api/apiServices';
import { getApiData, getApiErrorMessage, isApiSuccess } from '@/utils/apiResponse';

let cachedSdkDts: string | null = null;

export async function loadHandlerSdkDts(): Promise<string> {
  if (cachedSdkDts != null) return cachedSdkDts;
  try {
    const res = await getApiServiceHandlerSdkDts();
    const data = getApiData<{ dts: string }>(res);
    cachedSdkDts = data?.dts || '';
  } catch {
    cachedSdkDts = '';
  }
  return cachedSdkDts;
}

function ambientTsType(field: { type?: string; isArray?: boolean; isFile?: boolean }): string {
  if (field.isFile) return 'string';
  if (field.isArray) return 'string[]';
  const t = String(field.type || 'string').toLowerCase();
  if (t.includes('number')) return 'number';
  if (t.includes('boolean')) return 'boolean';
  if (t.includes('[]') || t.includes('array')) return 'string[]';
  // StatusType 等别名在 parse 后已落成 string；勿把原文 interface 再注入一次
  return 'string';
}

/**
 * 为 Handler Monaco / tsc 合成 params ambient。
 * 禁止粘贴 requestParameterInterface 原文（会与左侧 interface 编辑器重复声明 StatusType 等）。
 */
export function buildParamsAmbientDts(requestParameterInterface?: string): string {
  const fields = parseInterfaceFields(requestParameterInterface);
  if (!fields.length) {
    return 'interface RequestParams { [key: string]: unknown }\ndeclare const params: RequestParams;\n';
  }
  const lines = fields.map((field) => {
    const optional = field.required ? '' : '?';
    return `  ${field.name}${optional}: ${ambientTsType(field)};`;
  });
  return [
    'interface RequestParams {',
    ...lines,
    '}',
    'declare const params: RequestParams;',
    '',
  ].join('\n');
}

export function formatHandlerDiagnostics(diagnostics: ApiServiceHandlerDiagnostic[]): string {
  if (!diagnostics?.length) return '';
  return diagnostics
    .slice(0, 8)
    .map((d) => `L${d.line}:${d.column} ${d.message}`)
    .join('\n');
}

/**
 * 调用后端 check-handler；通过返回 null，失败返回结果（含 diagnostics）。
 */
export async function ensureHandlerScriptValid(
  handlerScript: string,
  requestParameterInterface?: string,
): Promise<ApiServiceHandlerCheckResult | null> {
  const trimmed = String(handlerScript || '').trim();
  if (!trimmed) {
    return {
      ok: false,
      diagnostics: [{ line: 1, column: 1, message: 'Handler 脚本为空' }],
    };
  }
  try {
    const res = await postApiServiceCheckHandler({
      handlerScript: trimmed,
      requestParameterInterface,
    });
    const data = getApiData<ApiServiceHandlerCheckResult>(res);
    if (data && data.ok) return null;
    if (data && !data.ok) return data;
    return {
      ok: false,
      diagnostics: [{
        line: 1,
        column: 1,
        message: getApiErrorMessage(res, 'Handler 语法检查失败'),
      }],
    };
  } catch (error) {
    const diagnostics =
      error && typeof error === 'object' && 'data' in error
        ? (error as { data?: { diagnostics?: ApiServiceHandlerDiagnostic[] } }).data?.diagnostics
        : undefined;
    if (diagnostics?.length) {
      return { ok: false, diagnostics };
    }
    return {
      ok: false,
      diagnostics: [{
        line: 1,
        column: 1,
        message: getApiErrorMessage(error, 'Handler 语法检查失败'),
      }],
    };
  }
}

export function isApiSuccessResult(res: unknown): boolean {
  return isApiSuccess(res);
}
