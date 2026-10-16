import { getApiService, getApiServices } from '@/services/EADAF/api/apiServices';
import { getApiData } from '@/utils/apiResponse';

export interface ApiServiceVerification {
  verified: boolean;
  id: string;
  code: string;
  name?: string;
  status?: string;
  routePath?: string;
  entityCode?: string;
  message?: string;
  /** 请求参数 TypeScript interface 是否非空（编辑页「请求参数结构」来源） */
  hasRequestParameterInterface?: boolean;
  requestDocsComplete?: boolean;
  /** find 响应是否含完整 pagination 文档 */
  hasPaginationDocs?: boolean;
}

export interface VerifyApiServiceOptions {
  expectedCode?: string;
  /** 指定时期望的 status；不满足时 verified=false */
  expectedStatus?: 'draft' | 'published' | 'disabled';
  /** 为 true 时要求 requestParameterInterface 非空，否则 verified=false */
  requireRequestParameterInterface?: boolean;
  /** 为 true 且主操作为 find 时，要求 responseExample 含完整 pagination */
  requireFindPaginationDocs?: boolean;
}

export function assessRequestParameterInterface(service?: Partial<API.ApiService> | null): {
  hasRequestParameterInterface: boolean;
  requestDocsComplete: boolean;
  message?: string;
} {
  const text = String(service?.requestParameterInterface || '').trim();
  const has = text.length > 0;
  return {
    hasRequestParameterInterface: has,
    requestDocsComplete: has,
    message: has
      ? undefined
      : 'requestParameterInterface 为空；编辑页「请求参数结构」将显示为空，Example 不能代替 interface',
  };
}

const PAGINATION_KEYS = ['total', 'page', 'pageSize', 'totalPages', 'hasNext'] as const;

/** find 类响应文档须含 data.items + data.pagination 完整字段 */
export function assessFindPaginationResponseDocs(
  service?: Partial<API.ApiService> | null,
  operation?: string,
): {
  hasPaginationDocs: boolean;
  message?: string;
} {
  const op = String(operation || service?.enabledOperations?.[0] || '').trim();
  if (op !== 'find') {
    return { hasPaginationDocs: true };
  }

  const securityConfig = (service?.securityConfig || {}) as Record<string, unknown>;
  const overrides = securityConfig.responseOverrides as
    | Record<string, { responseExample?: unknown; responsesSchema?: unknown }>
    | undefined;
  const entry = overrides?.find;
  const example = entry?.responseExample;
  const data =
    example && typeof example === 'object' && !Array.isArray(example)
      ? (example as Record<string, unknown>).data
      : null;

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      hasPaginationDocs: false,
      message:
        'find 响应文档缺少 data；须含 items[] 与 pagination{ total, page, pageSize, totalPages, hasNext }',
    };
  }

  const record = data as Record<string, unknown>;
  if (!Array.isArray(record.items) || record.items.length < 1) {
    return {
      hasPaginationDocs: false,
      message: 'find 的 responseExample.data.items 至少须有 1 条示例',
    };
  }

  const pagination = record.pagination;
  if (!pagination || typeof pagination !== 'object' || Array.isArray(pagination)) {
    return {
      hasPaginationDocs: false,
      message:
        'find 须使用 data.pagination 对象（禁止仅平铺 total/count）；字段：total, page, pageSize, totalPages, hasNext',
    };
  }

  const missing = PAGINATION_KEYS.filter(
    (key) => !Object.prototype.hasOwnProperty.call(pagination, key),
  );
  if (missing.length) {
    return {
      hasPaginationDocs: false,
      message: `find 的 pagination 缺少字段：${missing.join(', ')}`,
    };
  }

  return { hasPaginationDocs: true };
}

function buildVerificationMessage(
  data: API.ApiService,
  options?: VerifyApiServiceOptions,
  docs?: ReturnType<typeof assessRequestParameterInterface>,
  paginationDocs?: ReturnType<typeof assessFindPaginationResponseDocs>,
): string {
  const code = data.code || options?.expectedCode || data.id || '';
  let base: string;
  if (options?.expectedStatus) {
    if (data.status === options.expectedStatus) {
      base = `已验证「${code}」status=${data.status}`;
    } else {
      base = `校验失败：期望 status=${options.expectedStatus}，实际为 ${data.status ?? '未知'}`;
    }
  } else {
    base = `已验证「${code}」存在（status=${data.status ?? '未知'}）`;
  }
  const extras: string[] = [];
  if (options?.requireRequestParameterInterface && docs && !docs.requestDocsComplete) {
    extras.push(docs.message || '请求文档不完整');
  }
  if (options?.requireFindPaginationDocs && paginationDocs && !paginationDocs.hasPaginationDocs) {
    extras.push(paginationDocs.message || '分页响应文档不完整');
  }
  if (extras.length) {
    return `${base}；但${extras.join('；')}`;
  }
  return base;
}

/** 创建/发布后回读服务，供 AI Tool 返回与 Skill 校验 */
export async function verifyApiServiceById(
  serviceId: string,
  options?: VerifyApiServiceOptions | string,
): Promise<ApiServiceVerification> {
  const opts: VerifyApiServiceOptions =
    typeof options === 'string' ? { expectedCode: options } : options || {};

  const res = await getApiService(serviceId);
  const data = getApiData<API.ApiService>(res);
  if (!data?.id) {
    throw new Error(
      `校验失败：服务 ${opts.expectedCode || serviceId} 在系统中不存在，请勿向用户声称创建/发布成功`,
    );
  }
  if (opts.expectedCode && data.code !== opts.expectedCode) {
    throw new Error(`校验失败：期望 code=${opts.expectedCode}，实际为 ${data.code}`);
  }

  const statusOk =
    !opts.expectedStatus || data.status === opts.expectedStatus;
  const docs = assessRequestParameterInterface(data);
  const docsOk = !opts.requireRequestParameterInterface || docs.requestDocsComplete;
  const paginationDocs = assessFindPaginationResponseDocs(
    data,
    data.enabledOperations?.[0],
  );
  const paginationOk = !opts.requireFindPaginationDocs || paginationDocs.hasPaginationDocs;

  return {
    verified: statusOk && docsOk && paginationOk,
    id: data.id,
    code: data.code || opts.expectedCode || serviceId,
    name: data.name,
    status: data.status,
    routePath: data.routePath,
    entityCode: data.entityCode,
    hasRequestParameterInterface: docs.hasRequestParameterInterface,
    requestDocsComplete: docs.requestDocsComplete,
    hasPaginationDocs: paginationDocs.hasPaginationDocs,
    message: buildVerificationMessage(data, opts, docs, paginationDocs),
  };
}

/** 按 code 在列表中确认服务可见（与列表页同源） */
export async function verifyApiServiceListed(
  code: string,
  options?: Pick<VerifyApiServiceOptions, 'expectedStatus'>,
): Promise<ApiServiceVerification> {
  const res = await getApiServices({ codePrefix: code, size: -1 });
  const data = getApiData<API.ApiServiceListResult>(res);
  const exact = data?.items?.find((item) => item.code === code);
  if (!exact?.id) {
    throw new Error(
      `校验失败：列表中未找到 code=${code} 的 API 服务，请勿声称创建成功`,
    );
  }

  const statusOk =
    !options?.expectedStatus || exact.status === options.expectedStatus;

  return {
    verified: statusOk,
    id: exact.id,
    code: exact.code || code,
    name: exact.name,
    status: exact.status,
    routePath: exact.routePath,
    entityCode: exact.entityCode,
    message: statusOk
      ? `列表中已确认「${exact.code}」status=${exact.status ?? '未知'}`
      : `列表校验失败：「${exact.code}」status=${exact.status ?? '未知'}，期望 ${options?.expectedStatus}`,
  };
}

/** 发布专用：回读并强制 status=published */
export async function verifyApiServicePublished(
  serviceId: string,
  expectedCode?: string,
): Promise<ApiServiceVerification> {
  const verified = await verifyApiServiceById(serviceId, {
    expectedCode,
    expectedStatus: 'published',
  });
  if (!verified.verified) {
    throw new Error(
      verified.message ||
        `发布校验失败：期望 status=published，实际为 ${verified.status ?? '未知'}`,
    );
  }
  return verified;
}
