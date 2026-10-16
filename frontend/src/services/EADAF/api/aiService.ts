import { request } from '@/utils/request';

export interface AiServiceModelInfo {
  slug: string;
  displayName: string;
  capabilities?: string[];
  inputTags?: string[];
  outputTags?: string[];
  defaultParams?: Record<string, unknown>;
}

export async function getAiServiceModels(options?: { [key: string]: unknown }) {
  return request<{ data?: AiServiceModelInfo[] }>('/api/v1/ai/models', {
    method: 'GET',
    ...(options || {}),
  });
}
