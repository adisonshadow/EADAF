import { getSystemStorageBucketCode } from '@/config/deployConfig';

/**
 * 系统内置存储桶 code（需与后端 SYSTEM_STORAGE_BUCKET_CODE 一致）。
 *
 * 取值：运行时可配（runtime-config.js 注入 / 后端 /api/v1/system/runtime-config）
 * → 默认 'eadaf-system'。**不再走构建期注入**，同一份产物换环境不必重新构建。
 * 本模块在 App 依赖链里，而 main.tsx 会先加载运行时可配再 import App，所以这里拿到的是最终值。
 */
export const SYSTEM_STORAGE_BUCKET_CODE = getSystemStorageBucketCode();

export function buildStoragePreviewPath(objectId: string) {
  return `/api/v1/storage/objects/${objectId}/preview`;
}

export function extractStorageObjectId(ref?: string | null): string | undefined {
  if (!ref?.trim()) return undefined;
  const trimmed = ref.trim();
  const match = trimmed.match(/\/api\/v1\/storage\/objects\/([0-9a-f-]{36})\/preview/i);
  return match?.[1];
}
