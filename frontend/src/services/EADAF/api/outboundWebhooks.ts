// @ts-ignore
import { request } from '@/utils/request';

const BASE = '/api/v1/admin/outbound-webhooks';

/** 外部 API 提交配置 */
export async function getOutboundWebhooks(params?: {
  codePrefix?: string;
  status?: string;
  page?: number;
  size?: number;
}, options?: { [key: string]: any }) {
  return request<{
    code: number;
    message: string;
    data: { total: number; items: API.OutboundWebhook[]; page: number; size: number };
  }>(BASE, { method: 'GET', params, ...(options || {}) });
}

export async function getOutboundWebhook(id: string, options?: { [key: string]: any }) {
  return request<{ code: number; message: string; data: API.OutboundWebhook }>(
    `${BASE}/${id}`, { method: 'GET', ...(options || {}) },
  );
}

export async function postOutboundWebhook(body: Partial<API.OutboundWebhook>, options?: { [key: string]: any }) {
  return request<{ code: number; message: string; data: API.OutboundWebhook }>(
    BASE, { method: 'POST', data: body, ...(options || {}) },
  );
}

export async function patchOutboundWebhook(id: string, body: Partial<API.OutboundWebhook>, options?: { [key: string]: any }) {
  return request<{ code: number; message: string; data: API.OutboundWebhook }>(
    `${BASE}/${id}`, { method: 'PATCH', data: body, ...(options || {}) },
  );
}

export async function deleteOutboundWebhook(id: string, options?: { [key: string]: any }) {
  return request<{ code: number; message: string; data: null }>(
    `${BASE}/${id}`, { method: 'DELETE', ...(options || {}) },
  );
}

export async function postOutboundWebhookPublish(id: string, options?: { [key: string]: any }) {
  return request<{ code: number; message: string; data: API.OutboundWebhook }>(
    `${BASE}/${id}/publish`, { method: 'POST', ...(options || {}) },
  );
}

export async function postOutboundWebhookDisable(id: string, options?: { [key: string]: any }) {
  return request<{ code: number; message: string; data: API.OutboundWebhook }>(
    `${BASE}/${id}/disable`, { method: 'POST', ...(options || {}) },
  );
}

export async function getOutboundWebhookTestProfile(id: string, options?: { [key: string]: any }) {
  return request<{ code: number; message: string; data: API.OutboundWebhookTestProfile }>(
    `${BASE}/${id}/test-profile`, { method: 'GET', ...(options || {}) },
  );
}

export async function postOutboundWebhookTest(
  id: string, body: { mockData?: string }, options?: { [key: string]: any },
) {
  return request<{ code: number; message: string; data: API.OutboundWebhookTestResult }>(
    `${BASE}/${id}/test`, { method: 'POST', data: body, ...(options || {}) },
  );
}

export async function getOutboundWebhookRuns(id: string, params?: { page?: number; size?: number }, options?: { [key: string]: any }) {
  return request<{
    code: number; message: string;
    data: { total: number; items: API.OutboundWebhookRun[]; page: number; size: number };
  }>(`${BASE}/${id}/runs`, { method: 'GET', params, ...(options || {}) });
}
