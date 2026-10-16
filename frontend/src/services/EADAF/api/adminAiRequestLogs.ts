import { request } from '@/utils/request';

export async function getAdminAiRequestLogs(params?: {
  page?: number;
  size?: number;
  slug?: string;
  traceId?: string;
}) {
  return request<any>('/api/v1/admin/ai-request-logs', { method: 'GET', params });
}

export async function getAdminAiRequestLogsId(params: { id: string }) {
  const { id, ...queryParams } = params;
  return request<any>(`/api/v1/admin/ai-request-logs/${id}`, { method: 'GET', params: queryParams });
}
