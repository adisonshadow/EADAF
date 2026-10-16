// @ts-ignore
import { request } from '@/utils/request';

const BASE = '/api/v1/admin/api-services';

export async function getApiServices(params?: {
  codePrefix?: string;
  status?: string;
  tag?: string;
  entityId?: string;
  connectionId?: string;
  page?: number;
  size?: number;
}) {
  return request<{ code: number; message: string; data: API.ApiServiceListResult }>(BASE, {
    method: 'GET',
    params,
  });
}

export async function getApiServiceTree(params?: { codePrefix?: string }) {
  return request<{ code: number; message: string; data: API.ApiServiceDomainTreeItem[] }>(
    `${BASE}/tree`,
    { method: 'GET', params },
  );
}

export async function getApiServiceOperationCatalog() {
  return request<{ code: number; message: string; data: API.ApiServiceOperationMeta[] }>(
    `${BASE}/operations/catalog`,
    { method: 'GET' },
  );
}

export async function getApiService(id: string) {
  return request<{ code: number; message: string; data: API.ApiService }>(`${BASE}/${id}`, {
    method: 'GET',
  });
}

export async function postApiServiceResolveConnection(body?: {
  connectionId?: string;
  scopeCode?: string;
  entityId?: string;
  entityCodes?: string[];
}) {
  return request<{ code: number; message: string; data: API.ApiServiceResolvedConnection }>(
    `${BASE}/resolve-connection`,
    { method: 'POST', data: body || {} },
  );
}

export async function postApiService(body: API.ApiServiceCreateInput) {
  return request<{ code: number; message: string; data: API.ApiService }>(BASE, {
    method: 'POST',
    data: body,
  });
}

export async function patchApiService(id: string, body: Partial<API.ApiServiceCreateInput>) {
  return request<{ code: number; message: string; data: API.ApiService }>(`${BASE}/${id}`, {
    method: 'PATCH',
    data: body,
  });
}

export async function postApiServicePublish(
  id: string,
  options?: { skipErrorHandler?: boolean },
) {
  return request<{ code: number; message: string; data: API.ApiService }>(`${BASE}/${id}/publish`, {
    method: 'POST',
    skipErrorHandler: options?.skipErrorHandler,
  });
}

export async function postApiServiceDisable(id: string) {
  return request<{ code: number; message: string; data: API.ApiService }>(`${BASE}/${id}/disable`, {
    method: 'POST',
  });
}

export async function deleteApiService(id: string) {
  return request<{ code: number; message: string; data: null }>(`${BASE}/${id}`, {
    method: 'DELETE',
  });
}

export async function postApiServiceTest(
  id: string,
  body?: { operation?: string; parameters?: Record<string, unknown> },
  options?: { skipErrorHandler?: boolean },
) {
  return request<{ code: number; message: string; data: API.ApiServiceTestResult }>(
    `${BASE}/${id}/test`,
    { method: 'POST', data: body || {}, skipErrorHandler: options?.skipErrorHandler },
  );
}

export async function getApiServiceTestProfile(id: string) {
  return request<{ code: number; message: string; data: API.ApiServiceTestProfile }>(
    `${BASE}/${id}/test-profile`,
    { method: 'GET' },
  );
}

export async function postApiServiceSuggestTestParams(
  id: string,
  body?: { operation?: string },
) {
  return request<{ code: number; message: string; data: API.ApiServiceSuggestTestParamsResult }>(
    `${BASE}/${id}/suggest-test-params`,
    { method: 'POST', data: body || {} },
  );
}

export async function putApiServiceTestMockParams(
  id: string,
  body: { operation: string; mockParameters: Record<string, unknown> },
) {
  return request<{ code: number; message: string; data: API.ApiServiceSaveTestMockParamsResult }>(
    `${BASE}/${id}/test-mock-parameters`,
    { method: 'PUT', data: body },
  );
}

export type ApiServiceHandlerDiagnostic = {
  line: number;
  column: number;
  message: string;
  code?: number;
};

export type ApiServiceHandlerCheckResult = {
  ok: boolean;
  diagnostics: ApiServiceHandlerDiagnostic[];
};

export async function postApiServiceCheckHandler(body: {
  handlerScript: string;
  requestParameterInterface?: string;
}) {
  return request<{ code: number; message: string; data: ApiServiceHandlerCheckResult }>(
    `${BASE}/check-handler`,
    { method: 'POST', data: body, skipErrorHandler: true },
  );
}

export async function getApiServiceHandlerSdkDts() {
  return request<{ code: number; message: string; data: { dts: string } }>(
    `${BASE}/handler-sdk-dts`,
    { method: 'GET' },
  );
}
