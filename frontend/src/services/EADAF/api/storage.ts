// @ts-ignore
import { request } from '@/utils/request';

const BASE = '/api/v1/storage';

export async function getStorageBuckets(params?: { page?: number; size?: number; keyword?: string }) {
  return request<{ code: number; message: string; data: API.StorageBucketList }>(`${BASE}/buckets`, {
    method: 'GET',
    params,
  });
}

export async function getStorageBucket(id: string) {
  return request<{ code: number; message: string; data: API.StorageBucket }>(`${BASE}/buckets/${id}`, {
    method: 'GET',
  });
}

export async function postStorageBucket(body: Partial<API.StorageBucket>) {
  return request<{ code: number; message: string; data: API.StorageBucket }>(`${BASE}/buckets`, {
    method: 'POST',
    data: body,
  });
}

export async function putStorageBucket(id: string, body: Partial<API.StorageBucket>) {
  return request<{ code: number; message: string; data: API.StorageBucket }>(`${BASE}/buckets/${id}`, {
    method: 'PUT',
    data: body,
  });
}

export async function deleteStorageBucket(id: string) {
  return request<{ code: number; message: string; data: null }>(`${BASE}/buckets/${id}`, {
    method: 'DELETE',
  });
}

export async function getStorageObjects(params?: {
  page?: number;
  size?: number;
  keyword?: string;
  bucketId?: string;
  applicationId?: string;
  mimeType?: string;
}) {
  return request<{ code: number; message: string; data: API.StorageObjectList }>(`${BASE}/objects`, {
    method: 'GET',
    params,
  });
}

export async function deleteStorageObject(id: string) {
  return request<{ code: number; message: string; data: null }>(`${BASE}/objects/${id}`, {
    method: 'DELETE',
  });
}

export async function postStorageObjectUpload(formData: FormData) {
  return request<{ code: number; message: string; data: API.StorageObject }>(`${BASE}/objects/upload`, {
    method: 'POST',
    data: formData,
    requestType: 'form',
  });
}

export function getStoragePreviewUrl(objectId: string) {
  return `${BASE}/objects/${objectId}/preview`;
}

export function getStorageDownloadUrl(objectId: string) {
  return `${BASE}/objects/${objectId}/download`;
}

export type StorageCropParams = {
  w?: number;
  h?: number;
  fit?: 'cover' | 'contain';
};

export function getStorageCropUrl(objectId: string, params?: StorageCropParams) {
  const search = new URLSearchParams();
  if (params?.w != null) search.set('w', String(params.w));
  if (params?.h != null) search.set('h', String(params.h));
  if (params?.fit) search.set('fit', params.fit);
  const qs = search.toString();
  return `${BASE}/objects/${objectId}/crop${qs ? `?${qs}` : ''}`;
}

export async function postStorageObjectDedupCheck(body: { bucketCode: string; md5: string }) {
  return request<{
    code: number;
    message: string;
    data: { duplicate: boolean; object?: API.StorageObject | null };
  }>(`${BASE}/objects/dedup-check`, {
    method: 'POST',
    data: body,
  });
}

export async function getStorageTusResult(uploadId: string) {
  return request<{
    code: number;
    message: string;
    data: {
      status: string;
      uploadId?: string;
      offset?: number;
      uploadLength?: number;
      object?: API.StorageObject | null;
    };
  }>(`${BASE}/tus/${encodeURIComponent(uploadId)}/result`, {
    method: 'GET',
    skipErrorHandler: true,
  });
}
