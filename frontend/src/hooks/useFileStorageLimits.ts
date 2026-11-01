import { useMemo } from 'react';
import { useInitialState } from '@/providers/InitialStateProvider';
import { resolveFileStorageSettings, type FileStorageSettings } from '@/utils/fileStorage';

/**
 * 当前生效的文件存储上限（图片 / 文档 / 视频）。
 *
 * 取值来自系统设置启动时下发的 systemFeatures.fileStorage；
 * 还没拿到或字段缺失时回退到与服务端一致的默认值。
 */
export function useFileStorageLimits(): FileStorageSettings {
  const { initialState } = useInitialState();
  const raw = initialState?.systemFeatures?.fileStorage;
  return useMemo(() => resolveFileStorageSettings(raw), [raw]);
}
