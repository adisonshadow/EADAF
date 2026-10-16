// @ts-ignore
import { request } from '@/utils/request';

export interface ApplicationApiCatalogOperation {
  operation: string;
  httpMethod: string;
  routePattern?: string;
  parametersSchema?: Record<string, unknown>;
  mockParameters?: Record<string, unknown>;
  /** 与 mockParameters 相同：请求参数 Example（编辑/测试页同源） */
  requestExample?: Record<string, unknown>;
  /** 请求参数 TypeScript interface（内置 API 从 swagger 生成） */
  requestParameterInterface?: string;
  responseInterface?: string;
  responsesSchema?: Record<string, unknown>;
  responseSchema?: Record<string, unknown>;
  responseExample?: unknown;
  label?: string;
  category?: string;
}

export interface ApplicationApiCatalogService {
  id: string;
  code: string;
  name?: string;
  description?: string;
  tags?: string[];
  status?: string;
  routePath?: string;
  basePath?: string;
  transportProtocols?: string[];
  entityCode?: string;
  entityLabel?: string;
  version?: number;
  requestParameterInterface?: string;
  operations?: ApplicationApiCatalogOperation[];
}

export interface ApplicationApiCatalogTreeNode {
  code: string;
  name: string;
  isDomainNode?: boolean;
  isApiNode?: boolean;
  serviceCount?: number;
  children?: ApplicationApiCatalogTreeNode[];
}

/** 内置 API 明细（公开目录展示用） */
export interface BuiltinApiCatalogItem {
  code: string;
  domain: string;
  label: string;
  routePath: string;
  httpMethods: string[];
  actions: string[];
  description: string;
  /** 按 HTTP method 拆分的请求/响应文档（来自路由 swagger） */
  operations?: ApplicationApiCatalogOperation[];
}

/** 采集管道 API 明细（公开目录展示用） */
export interface CollectionApiCatalogItem {
  id?: string;
  code: string;
  label: string;
  name?: string;
  description?: string;
  protocolType?: string;
  status?: string;
  routePath?: string;
  basePath?: string;
  httpMethods?: string[];
  entityCode?: string | null;
  entityLabel?: string | null;
  sampleData?: string;
  targetStructure?: string;
  authHint?: string;
  bodyHint?: string;
  responseInterface?: string;
  responseExample?: unknown;
}

export interface OutboundWebhookCatalogItem {
  id?: string;
  code: string;
  name?: string;
  description?: string | null;
  status?: string;
  triggerType?: string;
  triggerApiServiceId?: string;
  triggerApiServiceCode?: string;
  targetUrl?: string;
  httpMethod?: string;
  authType?: string;
  authSendMode?: string | null;
  authKeyName?: string | null;
  authSecretSet?: boolean;
  requestStructure?: string | null;
  requestExample?: string | null;
  responseConfig?: API.OutboundWebhookResponseConfig | null;
  version?: number;
  publishedAt?: string;
}

export interface ApplicationApiCatalogResult {
  application: {
    application_id: string;
    name: string;
    code: string;
    description?: string | null;
    logo_url?: string | null;
  };
  tree: ApplicationApiCatalogTreeNode[];
  services: ApplicationApiCatalogService[];
  builtinApis?: BuiltinApiCatalogItem[];
  builtinApiTree?: ApplicationApiCatalogTreeNode[];
  collectionApis?: CollectionApiCatalogItem[];
  collectionApiTree?: ApplicationApiCatalogTreeNode[];
  /** 关联提交外部 API（仅文档页；不进入 apis.json） */
  outboundWebhooks?: OutboundWebhookCatalogItem[];
  outboundWebhookTree?: ApplicationApiCatalogTreeNode[];
  exceptionResponses?: API.ExceptionResponseDocItem[];
  generatedAt?: string;
}

/** 获取应用可访问 API 目录（公开，无需登录） GET /api/v1/applications-public/${key}/api-catalog */
export async function getApplicationsPublicApiCatalog(
  key: string,
  options?: { skipErrorHandler?: boolean },
) {
  return request<{ code: number; message: string; data: ApplicationApiCatalogResult }>(
    `/api/v1/applications-public/${encodeURIComponent(key)}/api-catalog`,
    {
      method: 'GET',
      timeout: 60_000,
      skipErrorHandler: options?.skipErrorHandler,
    },
  );
}
