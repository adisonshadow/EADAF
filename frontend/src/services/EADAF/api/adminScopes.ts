import { request } from '@/utils/request';

export async function getAdminScopes(params?: { page?: number; size?: number; isActive?: boolean }) {
  return request<any>('/api/v1/admin/scopes', { method: 'GET', params });
}

export async function postAdminScopes(body: { name: string; slug?: string; description?: string }) {
  return request<any>('/api/v1/admin/scopes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
  });
}

export async function getAdminScopesId(params: { id: string }) {
  const { id, ...queryParams } = params;
  return request<any>(`/api/v1/admin/scopes/${id}`, { method: 'GET', params: queryParams });
}

export async function patchAdminScopesId(
  params: { id: string },
  body: { name?: string; slug?: string; description?: string; isActive?: boolean },
) {
  const { id, ...queryParams } = params;
  return request<any>(`/api/v1/admin/scopes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    params: queryParams,
    data: body,
  });
}

export async function deleteAdminScopesId(params: { id: string }) {
  const { id, ...queryParams } = params;
  return request<any>(`/api/v1/admin/scopes/${id}`, { method: 'DELETE', params: queryParams });
}
