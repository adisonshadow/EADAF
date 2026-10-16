import { request } from '@/utils/request';

export async function getAdminSkills(params?: {
  page?: number;
  size?: number;
  name?: string;
  slug?: string;
  description?: string;
  isActive?: boolean | string;
  isGlobal?: boolean | string;
  isDedicated?: boolean | string;
}) {
  return request<any>('/api/v1/admin/skills', { method: 'GET', params });
}

export async function postAdminSkills(body: {
  name: string;
  slug?: string;
  description?: string;
  contentMarkdown?: string;
  scopeId?: string;
  toolIds?: string[];
  isGlobal?: boolean;
  isDedicated?: boolean;
  applicationIds?: string[];
  isActive?: boolean;
  completionStrategy?: Record<string, unknown> | null;
}) {
  return request<any>('/api/v1/admin/skills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
  });
}

export async function getAdminSkillsId(params: { id: string }) {
  const { id, ...queryParams } = params;
  return request<any>(`/api/v1/admin/skills/${id}`, { method: 'GET', params: queryParams });
}

export async function patchAdminSkillsId(
  params: { id: string },
  body: {
    name?: string;
    slug?: string;
    description?: string;
    contentMarkdown?: string;
    scopeId?: string;
    toolIds?: string[];
    isGlobal?: boolean;
    isDedicated?: boolean;
    applicationIds?: string[];
    isActive?: boolean;
    completionStrategy?: Record<string, unknown> | null;
  },
) {
  const { id, ...queryParams } = params;
  return request<any>(`/api/v1/admin/skills/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    params: queryParams,
    data: body,
  });
}

export async function deleteAdminSkillsId(params: { id: string }) {
  const { id, ...queryParams } = params;
  return request<any>(`/api/v1/admin/skills/${id}`, { method: 'DELETE', params: queryParams });
}
