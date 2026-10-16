// @ts-ignore
import { request } from '@/utils/request';

const BASE = '/api/v1/system';

/** 应用导出/导入、备份恢复等长任务统一超时（默认 10s 不够） */
export const APP_TRANSFER_TIMEOUT = 30 * 60 * 1000;

export async function getSystemFeatures() {
  return request<{
    code: number;
    message: string;
    data: API.SystemFeatures;
  }>(`${BASE}/features`, { method: 'GET' });
}

export async function putSystemFeatures(body: API.SystemFeatures) {
  return request<{
    code: number;
    message: string;
    data: API.SystemFeatures;
  }>(`${BASE}/features`, { method: 'PUT', data: body });
}

export async function getSystemBackups() {
  return request<{
    code: number;
    message: string;
    data: API.SystemBackupList;
  }>(`${BASE}/backups`, { method: 'GET' });
}

export async function postSystemBackupRun() {
  return request<{
    code: number;
    message: string;
    data: Record<string, unknown>;
  }>(`${BASE}/backups/run`, { method: 'POST' });
}

/** 上传 .dump 备份文件并恢复数据库（覆盖现有数据，高危操作，同步等待执行完成） */
export async function postSystemBackupRestore(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return request<{
    code: number;
    message: string;
    data: Record<string, unknown>;
  }>(`${BASE}/backups/restore`, {
    method: 'POST',
    data: formData,
    requestType: 'form',
    // 恢复同步执行（后端等待 pg_restore 完成），覆盖默认超时
    timeout: APP_TRANSFER_TIMEOUT,
  });
}

/** 按应用导出 zip 迁移包：返回附件 blob（失败时可能是 JSON 错误信封） */
export async function postAppTransferExport(
  body: API.AppTransferExportParams,
): Promise<Blob> {
  return request<Blob>(`${BASE}/app-transfer/export`, {
    method: 'POST',
    data: body,
    responseType: 'blob',
    skipErrorHandler: true,
    timeout: APP_TRANSFER_TIMEOUT,
  });
}

/** 上传导出文件做导入预览：返回节条数/冲突/连接匹配等摘要，不写数据 */
export async function postAppTransferPreview(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return request<{
    code: number;
    message: string;
    data: API.AppTransferPreviewResult;
  }>(`${BASE}/app-transfer/preview`, {
    method: 'POST',
    data: formData,
    requestType: 'form',
    timeout: APP_TRANSFER_TIMEOUT,
  });
}

/** 导出 EADAF 平台 zip 包：返回附件 blob */
export async function postPlatformTransferExport(
  body?: { includeFiles?: boolean },
): Promise<Blob> {
  return request<Blob>(`${BASE}/platform-transfer/export`, {
    method: 'POST',
    data: body || {},
    responseType: 'blob',
    skipErrorHandler: true,
    timeout: APP_TRANSFER_TIMEOUT,
  });
}

/** 预览 EADAF 平台导出文件，不写数据 */
export async function postPlatformTransferPreview(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return request<{
    code: number;
    message: string;
    data: API.PlatformTransferPreviewResult;
  }>(`${BASE}/platform-transfer/preview`, {
    method: 'POST',
    data: formData,
    requestType: 'form',
    timeout: APP_TRANSFER_TIMEOUT,
  });
}

/** 按策略导入 EADAF 平台包 */
export async function postPlatformTransferImport(file: File, strategy: string) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('strategy', strategy);
  return request<{
    code: number;
    message: string;
    data: API.PlatformTransferImportResult;
  }>(`${BASE}/platform-transfer/import`, {
    method: 'POST',
    data: formData,
    requestType: 'form',
    timeout: APP_TRANSFER_TIMEOUT,
  });
}

/** 按策略执行导入（overwrite/skip/abort），返回分节结果 */
export async function postAppTransferImport(
  file: File,
  strategy: string,
  options: { safeMode?: boolean } = {},
) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('strategy', strategy);
  if (typeof options.safeMode === 'boolean') {
    formData.append('safeMode', options.safeMode ? 'true' : 'false');
  }
  return request<{
    code: number;
    message: string;
    data: API.AppTransferImportResult;
  }>(`${BASE}/app-transfer/import`, {
    method: 'POST',
    data: formData,
    requestType: 'form',
    timeout: APP_TRANSFER_TIMEOUT,
  });
}

/** 从 Content-Disposition 解析附件文件名（形如 attachment; filename="xxx.json"） */
export function getAttachmentFileName(
  disposition: string | null | undefined,
): string | null {
  if (!disposition) return null;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return match ? decodeURIComponent(match[1]) : null;
}
