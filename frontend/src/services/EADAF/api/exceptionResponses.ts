// @ts-ignore
import { request } from '@/utils/request';

const BASE = '/api/v1/admin/exception-responses';

export async function getExceptionResponses(params?: {
  isEnabled?: string;
  page?: number;
  size?: number;
}) {
  return request<{ code: number; message: string; data: API.ExceptionResponseListResult }>(BASE, {
    method: 'GET',
    params,
  });
}

export async function getExceptionResponse(id: string) {
  return request<{ code: number; message: string; data: API.ExceptionResponseItem }>(`${BASE}/${id}`, {
    method: 'GET',
  });
}

export async function createExceptionResponse(body: {
  code: number;
  title: string;
  description?: string;
  schema?: Record<string, unknown>;
  example?: unknown;
  isEnabled?: boolean;
  sortOrder?: number;
}) {
  return request<{ code: number; message: string; data: API.ExceptionResponseItem }>(BASE, {
    method: 'POST',
    data: body,
  });
}

export async function patchExceptionResponse(
  id: string,
  patch: Partial<{
    code: number;
    title: string;
    description: string;
    schema: Record<string, unknown>;
    example: unknown;
    isEnabled: boolean;
    sortOrder: number;
  }>,
) {
  return request<{ code: number; message: string; data: API.ExceptionResponseItem }>(`${BASE}/${id}`, {
    method: 'PATCH',
    data: patch,
  });
}

export async function deleteExceptionResponse(id: string) {
  return request<{ code: number; message: string; data: null }>(`${BASE}/${id}`, {
    method: 'DELETE',
  });
}
