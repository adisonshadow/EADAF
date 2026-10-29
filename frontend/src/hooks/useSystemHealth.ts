import { useEffect, useState } from 'react';
import {
  getAdminSystemHealth,
  type SystemHealthReport,
} from '@/services/EADAF/api/adminSystemHealth';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';

/** 头像菜单与健康页共用一次轮询，避免两处各打一遍接口。 */
const POLL_MS = 30_000;

type Store = {
  report: SystemHealthReport | null;
  loading: boolean;
  error: string | null;
};

type Listener = () => void;

let store: Store = { report: null, loading: false, error: null };
const listeners = new Set<Listener>();
let subscribers = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let inflight: Promise<void> | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

function setStore(patch: Partial<Store>) {
  store = { ...store, ...patch };
  emit();
}

export function getSystemHealthSnapshot() {
  return store;
}

export function refreshSystemHealth(options?: { fresh?: boolean }) {
  if (inflight && !options?.fresh) return inflight;
  if (!store.report) setStore({ loading: true, error: null });

  const task = (async () => {
    try {
      const response = await getAdminSystemHealth(options?.fresh ? { refresh: '1' } : undefined);
      if (!isApiSuccess(response)) {
        setStore({ loading: false, error: '系统健康检查失败' });
        return;
      }
      setStore({
        report: getApiData<SystemHealthReport>(response) || null,
        loading: false,
        error: null,
      });
    } catch {
      setStore({ loading: false, error: '系统健康检查失败' });
    }
  })();

  if (!options?.fresh) {
    inflight = task;
    task.finally(() => {
      if (inflight === task) inflight = null;
    });
  }
  return task;
}

function retainSystemHealthPolling() {
  subscribers += 1;
  if (subscribers === 1) {
    void refreshSystemHealth();
    timer = setInterval(() => {
      void refreshSystemHealth();
    }, POLL_MS);
  }
  return () => {
    subscribers -= 1;
    if (subscribers > 0) return;
    subscribers = 0;
    if (timer) clearInterval(timer);
    timer = null;
  };
}

export function useSystemHealth(enabled = true) {
  const [, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    const release = retainSystemHealthPolling();
    return () => {
      listeners.delete(listener);
      release();
    };
  }, [enabled]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshSystemHealth({ fresh: true });
    } finally {
      setRefreshing(false);
    }
  };

  return { ...getSystemHealthSnapshot(), refreshing, refresh };
}
