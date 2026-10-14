/**
 * 应用部署页的浏览器本地缓存：
 * - 打包历史（`packHistory`）：已完成的任务记成历史，刷新/重开浏览器仍在；
 * - 应用目录记忆（`appDirs`）：发布应用时按「应用 → 项目目录」记住上次填的地址。
 *
 * 只用 localStorage，键名带版本号，读失败（旧格式/脏数据）一律降级为空，不抛错。
 */

import type { PackJob, PackJobStatus } from '@/services/UAC/api/appDeployment';

const HISTORY_KEY = 'eadaf.app-deployment.pack-history.v1';
const APP_DIR_KEY = 'eadaf.app-deployment.app-dirs.v1';
const MAX_HISTORY = 50;

export interface PackHistoryRecord {
  jobId: string;
  kind: 'platform' | 'app';
  label: string;
  version: string;
  status: PackJobStatus;
  startedAt: string;
  finishedAt: string | null;
  outDir: string;
  artifactDir: string | null;
  artifactFile: string | null;
  artifactPath: string | null;
  artifactSize: number | null;
  /** 配置摘要，如「安装包 · amd64 · 离线 / Compose」 */
  summary: string;
  /** 业务应用名/编码（发布应用才有） */
  appName?: string | null;
  applicationCode?: string | null;
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 隐私模式 / 配额满：忽略，不影响打包 */
  }
}

/** 组装历史记录要从任务里带走的字段 */
export function toHistoryRecord(
  job: PackJob,
  summary: string,
): PackHistoryRecord {
  const meta = (job.meta || {}) as Record<string, unknown>;
  return {
    jobId: job.id,
    kind: job.kind,
    label: job.label,
    version: job.version || '',
    status: job.status,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    outDir: job.outDir,
    artifactDir: job.artifact?.dir || null,
    artifactFile: job.artifact?.file || null,
    artifactPath: job.artifact?.path || null,
    artifactSize: job.artifact?.size ?? null,
    summary,
    appName: (meta.appName as string) || null,
    applicationCode: (meta.applicationCode as string) || null,
  };
}

export function readPackHistory(
  kind?: 'platform' | 'app',
): PackHistoryRecord[] {
  const raw = safeGet(HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const records = parsed.filter(
      (item): item is PackHistoryRecord =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof item.jobId === 'string',
    );
    return kind ? records.filter((item) => item.kind === kind) : records;
  } catch {
    return [];
  }
}

/** 新增或更新一条历史（按 jobId 去重），返回最新列表 */
export function upsertPackHistory(
  record: PackHistoryRecord,
): PackHistoryRecord[] {
  const rest = readPackHistory().filter((item) => item.jobId !== record.jobId);
  const next = [record, ...rest].slice(0, MAX_HISTORY);
  safeSet(HISTORY_KEY, JSON.stringify(next));
  return next;
}

export function removePackHistory(jobId: string): PackHistoryRecord[] {
  const next = readPackHistory().filter((item) => item.jobId !== jobId);
  safeSet(HISTORY_KEY, JSON.stringify(next));
  return next;
}

export function clearPackHistory(
  kind?: 'platform' | 'app',
): PackHistoryRecord[] {
  if (!kind) {
    safeSet(HISTORY_KEY, JSON.stringify([]));
    return [];
  }
  const next = readPackHistory().filter((item) => item.kind !== kind);
  safeSet(HISTORY_KEY, JSON.stringify(next));
  return next;
}

/* ------------------------- 应用 → 项目目录（记忆） ------------------------- */

export function readAppDirMap(): Record<string, string> {
  const raw = safeGet(APP_DIR_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {};
    const map: Record<string, string> = {};
    for (const [key, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (typeof value === 'string' && value.trim()) map[key] = value.trim();
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * 记住「应用 → 项目目录」。同时按 applicationId、应用 code、应用名建索引，
 * 这样换一台机器/换选择的键也能命中缓存。
 */
export function rememberAppDir(
  keys: Array<string | null | undefined>,
  appDir: string,
): Record<string, string> {
  const map = readAppDirMap();
  for (const key of keys) {
    const normalized = String(key || '').trim();
    if (!normalized) continue;
    map[normalized] = appDir;
  }
  safeSet(APP_DIR_KEY, JSON.stringify(map));
  return map;
}

export function forgetAppDir(key: string): Record<string, string> {
  const map = readAppDirMap();
  delete map[key];
  safeSet(APP_DIR_KEY, JSON.stringify(map));
  return map;
}

/** 按项目目录反查用过的应用（用于「最近使用」提示） */
export function listKnownAppDirs(): Array<{ appDir: string; keys: string[] }> {
  const map = readAppDirMap();
  const byDir = new Map<string, string[]>();
  for (const [key, dir] of Object.entries(map)) {
    const keys = byDir.get(dir) || [];
    keys.push(key);
    byDir.set(dir, keys);
  }
  return Array.from(byDir.entries()).map(([appDir, keys]) => ({
    appDir,
    keys,
  }));
}
