import { request } from '@/utils/request';

export type OperationLogListParams = {
  page?: number;
  size?: number;
  domain?: string;
  operationType?: string;
  resourceType?: string;
  resourceId?: string;
  operatorId?: string;
  operatorName?: string;
  status?: string;
  startTime?: string;
  endTime?: string;
  traceId?: string;
  keyword?: string;
  /** 逗号分隔的三员身份，如 system_admin,security_admin */
  operatorThreeMemberRoles?: string;
};

export async function getAdminOperationLogs(params?: OperationLogListParams) {
  return request<any>('/api/v1/admin/operation-logs', { method: 'GET', params });
}

export async function getAdminOperationLogsId(params: { logId: string }) {
  const { logId, ...queryParams } = params;
  return request<any>(`/api/v1/admin/operation-logs/${logId}`, {
    method: 'GET',
    params: queryParams,
  });
}
