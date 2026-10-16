// @ts-ignore
/* eslint-disable */
import { request } from '@/utils/request';

/** 健康检查 检查系统运行状态，包括服务器状态和数据库连接状态 GET /api/v1/health */
export async function getHealth(options?: { [key: string]: any }) {
  return request<{
    code?: number;
    message?: string;
    data?: {
      status?: 'ok' | 'warning';
      timestamp?: string;
      version?: string;
      uptime?: number;
      memory?: { total?: number; free?: number; used?: number };
      cpu?: { cores?: number; loadAvg?: number[] };
      database?: { status?: 'ok' | 'error'; message?: string };
    };
  }>('/api/v1/health', {
    method: 'GET',
    ...(options || {}),
  });
}
