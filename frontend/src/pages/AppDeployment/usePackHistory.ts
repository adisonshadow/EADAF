import type { PackJob } from '@/services/EADAF/api/appDeployment';
import { useCallback, useState } from 'react';
import { describePackMeta } from './components/packOptions';
import {
  clearPackHistory,
  readPackHistory,
  removePackHistory,
  toHistoryRecord,
  upsertPackHistory,
  type PackHistoryRecord,
} from './storage';

/**
 * 打包历史（浏览器 localStorage）。
 * 任务结束时调用 `remember(job)` 落一条；同一 jobId 覆盖，避免重复。
 */
export function usePackHistory(kind: 'platform' | 'app') {
  const [records, setRecords] = useState<PackHistoryRecord[]>(() =>
    readPackHistory(kind),
  );

  const refresh = useCallback(() => {
    setRecords(readPackHistory(kind));
  }, [kind]);

  const remember = useCallback(
    (job: PackJob | null | undefined) => {
      if (!job || job.status === 'running') return;
      const meta = (job.meta || {}) as Record<string, unknown>;
      upsertPackHistory(toHistoryRecord(job, describePackMeta(job.kind, meta)));
      refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    (jobId: string) => {
      removePackHistory(jobId);
      refresh();
    },
    [refresh],
  );

  const clear = useCallback(() => {
    clearPackHistory(kind);
    refresh();
  }, [kind, refresh]);

  return { records, remember, remove, clear, refresh };
}
