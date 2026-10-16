import { getApiServices } from '@/services/EADAF/api/apiServices';
import { getApiData } from '@/utils/apiResponse';

const CODE_SEGMENT_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

/** 与后端 buildCodeFromScopeAndSlug 对齐的轻量合成 */
export function buildApiServiceCodeFromScopeAndSlug(
  scopeCode?: string,
  serviceSlug?: string,
): string {
  const scope = String(scopeCode || '').trim();
  const slug = String(serviceSlug || '').trim();
  if (!scope || !slug) return '';
  if (!CODE_SEGMENT_RE.test(slug)) return '';
  return `${scope}:${slug}`;
}

export async function resolveApiServiceId(args: Record<string, unknown>): Promise<string> {
  const serviceId = args.serviceId ? String(args.serviceId).trim() : '';
  if (serviceId) return serviceId;

  let code = args.code ? String(args.code).trim() : '';
  if (!code) {
    code = buildApiServiceCodeFromScopeAndSlug(
      args.scopeCode as string | undefined,
      args.serviceSlug as string | undefined,
    );
  }

  if (!code) {
    throw new Error(
      '请提供 serviceId、code，或 scopeCode + serviceSlug。勿使用实体 code（如 fmms:WorkCard）当作服务 code',
    );
  }

  const res = await getApiServices({ codePrefix: code, size: -1 });
  const data = getApiData<API.ApiServiceListResult>(res);
  const exact = data?.items?.find((item) => item.code === code);
  if (exact?.id) return exact.id;

  throw new Error(
    `未找到 code 为 ${code} 的 API 服务。请使用 create 返回的 id/code，或 scopeCode + serviceSlug 定位；勿把实体 code 当作服务 code`,
  );
}
