import { getApiService, getApiServices } from '@/services/EADAF/api/apiServices';
import { getApiData, parseApiListResponse } from '@/utils/apiResponse';

/** 列表类 Tool 回灌预算（字符）；超限时结构化裁剪 items，避免中段砍 JSON */
export const API_SERVICE_LIST_TOOL_BUDGET_CHARS = 24_000;

export interface ApiServiceListQueryArgs {
  codePrefix?: string;
  status?: string;
  tag?: string;
  connectionId?: string;
  page?: number;
  size?: number;
}

export interface ApiServiceListItemView {
  id?: string;
  code?: string;
  name?: string;
  status?: string;
  entityCode?: string;
  scopeCode?: string;
  scriptMode?: string;
  enabledOperations?: string[];
  version?: number;
  publishedAt?: string;
  tags?: string[];
  connection?: { name?: string; dbType?: string };
  statusHint?: string;
}

export interface ApiServiceListToolResult {
  /** 符合 appliedFilters 的总数（来自后端 count，非本页条数） */
  total: number;
  /** 本页实际返回条数（截断后为 shownCount） */
  returnedCount: number;
  page?: number;
  hasMore?: boolean;
  items: ApiServiceListItemView[];
  statusSummary: {
    draft: number;
    published: number;
    disabled: number;
  };
  appliedFilters: {
    codePrefix?: string;
    status?: string;
    tag?: string;
    connectionId?: string;
    size: number;
  };
  filterWarning?: string;
  /** 列表 status 与 get_service 回读不一致时记录（不剔除行） */
  statusDriftWarnings?: string[];
  exactMatch?: {
    id?: string;
    code?: string;
    name?: string;
    status?: string;
  } | null;
  /** 因回灌预算对 items 做了条数裁剪 */
  truncated?: boolean;
  shownCount?: number;
  hint?: string;
}

/** status=ALL / * / 空 → 不过滤（与后端 normalizeListStatus 对齐） */
export function normalizeApiServiceListStatus(status?: string): string | undefined {
  if (status == null) return undefined;
  const s = String(status).trim().toLowerCase();
  if (!s || s === 'all' || s === '*') return undefined;
  return s;
}

function summarizeStatus(items: ApiServiceListItemView[]) {
  return {
    draft: items.filter((item) => (item.status || 'draft') === 'draft').length,
    published: items.filter((item) => item.status === 'published').length,
    disabled: items.filter((item) => item.status === 'disabled').length,
  };
}

function buildStatusHint(service: API.ApiService): string | undefined {
  const status = service.status || 'draft';
  if (status === 'draft' && service.publishedAt) {
    return '曾发布但因配置更新已回退为 draft，须重新 apiservice_publish_service';
  }
  return undefined;
}

/** 列表/过滤 Tool 回灌用的精简视图（不含 securityConfig、脚本正文等） */
function compactServiceForListTool(service: API.ApiService): ApiServiceListItemView {
  return {
    id: service.id,
    code: service.code,
    name: service.name,
    status: service.status,
    entityCode: service.entityCode,
    scopeCode: service.scopeCode,
    scriptMode: service.scriptMode,
    enabledOperations: service.enabledOperations,
    version: service.version,
    publishedAt: service.publishedAt,
    tags: service.tags,
    connection: service.connection
      ? { name: service.connection.name, dbType: service.connection.dbType }
      : undefined,
    statusHint: buildStatusHint(service),
  };
}

/**
 * 抽样回读校验 status 漂移：只告警，不替换/剔除列表行（避免 draft 查询被掏空）。
 * 全量 N+1 成本过高，最多抽查 12 条。
 */
async function collectStatusDriftWarnings(
  items: API.ApiService[],
): Promise<string[]> {
  const statusDriftWarnings: string[] = [];
  const sample = items.filter((item) => item.id).slice(0, 12);

  await Promise.all(
    sample.map(async (item) => {
      try {
        const res = await getApiService(item.id!);
        const fresh = getApiData<API.ApiService>(res);
        if (!fresh) return;
        const listStatus = item.status || 'draft';
        const freshStatus = fresh.status || 'draft';
        if (listStatus !== freshStatus) {
          statusDriftWarnings.push(
            `${item.code}：列表 status=${listStatus}，get_service 回读=${freshStatus}（列表为准，未剔除）`,
          );
        }
      } catch {
        // ignore
      }
    }),
  );

  return statusDriftWarnings;
}

function estimateJsonChars(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

/** 超预算时裁剪 items，保留 total / statusSummary / appliedFilters 等元数据 */
export function fitApiServiceListResultToBudget(
  result: ApiServiceListToolResult,
  maxChars = API_SERVICE_LIST_TOOL_BUDGET_CHARS,
): ApiServiceListToolResult {
  if (estimateJsonChars(result) <= maxChars) {
    return result;
  }

  let lo = 0;
  let hi = result.items.length;
  let best = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate: ApiServiceListToolResult = {
      ...result,
      items: result.items.slice(0, mid),
      returnedCount: mid,
      shownCount: mid,
      truncated: true,
      hint: `结果超预算已只返回前 ${mid} 条（共 total=${result.total}），请缩小 codePrefix 或使用 page/size 分页`,
      statusSummary: summarizeStatus(result.items.slice(0, mid)),
    };
    if (estimateJsonChars(candidate) <= maxChars) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const sliced = result.items.slice(0, best);
  return {
    ...result,
    items: sliced,
    returnedCount: best,
    shownCount: best,
    truncated: true,
    hasMore: true,
    hint: `结果超预算已只返回前 ${best} 条（共 total=${result.total}），请缩小 codePrefix 或使用 page/size 分页`,
    statusSummary: summarizeStatus(sliced),
  };
}

/** AI Tool 统一列表查询：默认 size=-1；status=ALL 不过滤 */
export async function queryApiServicesForTool(
  args: ApiServiceListQueryArgs,
): Promise<ApiServiceListToolResult> {
  const codePrefix = args.codePrefix ? String(args.codePrefix).trim() : undefined;
  const requestedStatus = normalizeApiServiceListStatus(
    args.status ? String(args.status) : undefined,
  );
  const size = args.size ?? -1;
  const page = args.page && args.page > 0 ? args.page : 1;

  const res = await getApiServices({
    codePrefix,
    status: requestedStatus,
    tag: args.tag as string | undefined,
    connectionId: args.connectionId as string | undefined,
    page,
    size,
  });

  const data = getApiData<API.ApiServiceListResult>(res);
  const backendTotal = data?.total ?? parseApiListResponse(res).total ?? 0;
  const rawItems: API.ApiService[] =
    data?.items ?? parseApiListResponse<API.ApiService>(res).items;
  const items = rawItems.map((item) => compactServiceForListTool(item));

  const statusDriftWarnings = await collectStatusDriftWarnings(rawItems);
  const warnings: string[] = [...statusDriftWarnings];

  const exactMatch =
    codePrefix && codePrefix.includes(':')
      ? items.find((item) => item.code === codePrefix)
      : undefined;

  const filterWarning = warnings.length ? warnings.join('；') : undefined;

  const result: ApiServiceListToolResult = {
    total: backendTotal,
    returnedCount: items.length,
    page: size === -1 ? undefined : page,
    hasMore: size !== -1 && page * Math.abs(size) < backendTotal,
    items,
    statusSummary: summarizeStatus(items),
    appliedFilters: {
      codePrefix,
      status: requestedStatus,
      tag: args.tag as string | undefined,
      connectionId: args.connectionId as string | undefined,
      size,
    },
    filterWarning,
    statusDriftWarnings: statusDriftWarnings.length ? statusDriftWarnings : undefined,
    exactMatch: exactMatch
      ? {
          id: exactMatch.id,
          code: exactMatch.code,
          name: exactMatch.name,
          status: exactMatch.status,
        }
      : null,
  };

  return fitApiServiceListResultToBudget(result);
}
