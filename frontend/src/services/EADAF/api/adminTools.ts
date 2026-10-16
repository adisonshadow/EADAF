import { request } from '@/utils/request';

export async function getAdminTools(params?: {
  page?: number;
  size?: number;
  name?: string;
  functionName?: string;
  scopeId?: string;
  executionType?: string;
  isActive?: boolean | string;
}) {
  return request<any>('/api/v1/admin/tools', { method: 'GET', params });
}

export async function postAdminTools(body: {
  scopeId: string;
  name: string;
  slug?: string;
  functionName: string;
  description?: string;
  executionType: string;
  parametersSchema?: object;
  reviewMarkdown?: string;
  serverConfig?: object;
}) {
  return request<any>('/api/v1/admin/tools', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
  });
}

export async function getAdminToolsId(params: { id: string }) {
  const { id, ...queryParams } = params;
  return request<any>(`/api/v1/admin/tools/${id}`, { method: 'GET', params: queryParams });
}

export async function patchAdminToolsId(
  params: { id: string },
  body: Record<string, unknown>,
) {
  const { id, ...queryParams } = params;
  return request<any>(`/api/v1/admin/tools/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    params: queryParams,
    data: body,
  });
}

export async function deleteAdminToolsId(params: { id: string }) {
  const { id, ...queryParams } = params;
  return request<any>(`/api/v1/admin/tools/${id}`, { method: 'DELETE', params: queryParams });
}
