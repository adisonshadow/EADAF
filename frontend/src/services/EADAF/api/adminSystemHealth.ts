import { request } from '@/utils/request';

export type SystemHealthStatus = 'ok' | 'warning' | 'error' | 'skip';

export type SystemHealthItem = {
  key: string;
  label: string;
  status: SystemHealthStatus;
  summary: string;
  hint?: string | null;
  href?: string | null;
};

export type SystemHealthReport = {
  status: 'ok' | 'warning' | 'error';
  errorCount: number;
  warningCount: number;
  checkedAt?: string;
  items: SystemHealthItem[];
};

export async function getAdminSystemHealth(params?: { refresh?: '1' }) {
  return request<{
    code?: number;
    message?: string;
    data?: SystemHealthReport;
  }>('/api/v1/admin/system-health', {
    method: 'GET',
    params,
  });
}
