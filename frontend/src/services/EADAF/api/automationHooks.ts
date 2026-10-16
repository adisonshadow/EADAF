// @ts-ignore
import { request } from '@/utils/request';

const BASE = '/api/v1/automation/hooks';

export async function getAutomationHooks(params?: {
  status?: string;
  eventType?: string;
  page?: number;
  size?: number;
}) {
  return request<{ code: number; message: string; data: API.HookListResult }>(BASE, {
    method: 'GET',
    params,
  });
}

export async function getAutomationHook(id: string) {
  return request<{ code: number; message: string; data: API.Hook }>(`${BASE}/${id}`, {
    method: 'GET',
  });
}

export async function postAutomationHook(data: API.HookSaveInput) {
  return request<{ code: number; message: string; data: API.Hook }>(BASE, {
    method: 'POST',
    data,
  });
}

export async function putAutomationHook(id: string, data: API.HookSaveInput) {
  return request<{ code: number; message: string; data: API.Hook }>(`${BASE}/${id}`, {
    method: 'PUT',
    data,
  });
}

export async function deleteAutomationHook(id: string) {
  return request<{ code: number; message: string; data: { id: string; deleted: boolean } }>(
    `${BASE}/${id}`,
    { method: 'DELETE' },
  );
}

export async function postAutomationHookEnable(id: string) {
  return request<{ code: number; message: string; data: API.Hook }>(`${BASE}/${id}/enable`, {
    method: 'POST',
  });
}

export async function postAutomationHookDisable(id: string) {
  return request<{ code: number; message: string; data: API.Hook }>(`${BASE}/${id}/disable`, {
    method: 'POST',
  });
}

export async function postAutomationHookTest(id: string, data: { mockPayload?: object; sourceRunId?: string }) {
  return request<{ code: number; message: string; data: API.HookTestResult }>(`${BASE}/${id}/test`, {
    method: 'POST',
    data,
  });
}

export async function getAutomationHookRuns(
  id: string,
  params?: { status?: string; triggerSource?: string; page?: number; size?: number },
) {
  return request<{ code: number; message: string; data: API.HookRunListResult }>(`${BASE}/${id}/runs`, {
    method: 'GET',
    params,
  });
}

export async function postAutomationHookRunRetry(runId: string) {
  return request<{ code: number; message: string; data: API.HookTestResult }>(
    `${BASE}/runs/${runId}/retry`,
    { method: 'POST' },
  );
}

export async function getAutomationHookEventTypes() {
  return request<{ code: number; message: string; data: API.HookEventType[] }>(
    `${BASE}/event-types`,
    { method: 'GET' },
  );
}

export async function postAutomationHookValidateScript(data: { source: string }) {
  return request<{
    code: number;
    message: string;
    data: { ok: boolean; diagnostics: API.HookScriptDiagnostic[] };
  }>(`${BASE}/validate-script`, { method: 'POST', data });
}
