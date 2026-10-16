import * as tus from 'tus-js-client';
import { getStorageTusResult } from '@/services/EADAF/api/storage';
import { getApiData } from '@/utils/apiResponse';

const TUS_ENDPOINT = '/api/v1/storage/tus';

export type TusUploadProgress = {
  bytesUploaded: number;
  bytesTotal: number;
  percent: number;
};

export type TusUploadHandle = {
  start: () => void;
  abort: () => Promise<void>;
  pause: () => void;
};

function getBearerToken(): string {
  const token = localStorage.getItem('token') || '';
  return token ? `Bearer ${token}` : '';
}

function extractUploadId(uploadUrl?: string | null): string | null {
  if (!uploadUrl) return null;
  const clean = uploadUrl.split('?')[0].replace(/\/$/, '');
  const id = clean.split('/').pop();
  return id || null;
}

async function wait(ms: number) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function pollStorageTusResult(uploadId: string, timeoutMs = 10 * 60 * 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await getStorageTusResult(uploadId);
    const data = getApiData<{
      status: string;
      object?: API.StorageObject | null;
    }>(res);
    const status = data?.status;
    if (status === 'completed' || status === 'duplicate') {
      return data;
    }
    if (status === 'failed' || status === 'expired') {
      throw new Error((res as { message?: string }).message || '上传失败');
    }
    await wait(600);
  }
  throw new Error('文件处理超时，请稍后在列表中刷新查看');
}

export function startStorageTusUpload(options: {
  file: File;
  bucketCode: string;
  onProgress?: (progress: TusUploadProgress) => void;
}): { handle: TusUploadHandle; done: Promise<API.StorageObject> } {
  const { file, bucketCode, onProgress } = options;
  const upload = new tus.Upload(file, {
    endpoint: TUS_ENDPOINT,
    chunkSize: 8 * 1024 * 1024,
    retryDelays: [0, 1000, 3000, 5000, 10000],
    removeFingerprintOnSuccess: true,
    storeFingerprintForResuming: true,
    fingerprint: async (fingerprintFile) =>
      `eadaf-tus-${bucketCode}-${fingerprintFile.name}-${fingerprintFile.size}-${fingerprintFile.lastModified}`,
    headers: {
      Authorization: getBearerToken(),
    },
    metadata: {
      bucketCode,
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
    },
    onProgress(bytesUploaded, bytesTotal) {
      const total = bytesTotal || file.size || 1;
      onProgress?.({
        bytesUploaded,
        bytesTotal: total,
        percent: Math.min(100, Math.round((bytesUploaded / total) * 100)),
      });
    },
  });

  let rejectDone: ((error: Error) => void) | undefined;
  const done = new Promise<API.StorageObject>((resolve, reject) => {
    rejectDone = reject;
    upload.options.onError = (error) => {
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    upload.options.onSuccess = () => {
      void (async () => {
        try {
          const uploadId = extractUploadId(upload.url);
          if (!uploadId) throw new Error('未获得上传会话');
          const result = await pollStorageTusResult(uploadId);
          if (!result?.object?.objectId) throw new Error('上传完成但未返回文件');
          resolve(result.object);
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      })();
    };
  });

  return {
    handle: {
      start: () => {
        void upload.findPreviousUploads().then((previous) => {
          if (previous.length > 0) {
            upload.resumeFromPreviousUpload(previous[0]);
          }
          upload.start();
        });
      },
      abort: async () => {
        await upload.abort(true);
        rejectDone?.(new Error('已取消上传'));
      },
      pause: () => {
        void upload.abort(false);
      },
    },
    done,
  };
}
