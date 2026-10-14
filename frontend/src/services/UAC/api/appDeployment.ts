// @ts-ignore
import { request } from '@/utils/request';

const BASE = '/api/v1/admin/app-deployment';

/** bash 探测结果 */
export interface PackBashInfo {
  available: boolean;
  path: string | null;
  kind: 'bash' | 'git-bash' | 'wsl' | null;
  hint: string | null;
}

/** 打包产物（tar.gz）信息 */
export interface PackArtifact {
  path: string;
  file: string;
  dir: string;
  size: number | null;
  mtime: string | null;
}

export type PackJobStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface PackJob {
  id: string;
  kind: 'platform' | 'app';
  label: string;
  /** 供复制到终端的 pnpm 等价命令 */
  command: string;
  /** 后端实际 spawn 的命令（含 bash 形态路径） */
  spawnCommand: string;
  status: PackJobStatus;
  exitCode: number | null;
  startedAt: string;
  finishedAt: string | null;
  version: string;
  outDir: string;
  artifact: PackArtifact | null;
  error: string | null;
  droppedBefore: number;
  nextSeq: number;
  logFile: string | null;
  meta: Record<string, unknown> | null;
}

export interface PackLogLine {
  seq: number;
  stream: 'stdout' | 'stderr';
  text: string;
  at: string;
}

/** SSE / 轮询事件负载 */
export type PackStreamEvent =
  | { type: 'snapshot'; job: PackJob; lines: PackLogLine[] }
  | { type: 'log'; line: PackLogLine }
  | { type: 'job'; job: PackJob }
  | { type: 'end'; job: PackJob };

export interface AppDeploymentStatus {
  devMode: boolean;
  devModeHint: string | null;
  repoRoot: string;
  host: { platform: string; arch: string; node: string };
  bash: PackBashInfo;
  pnpm: { available: boolean; path: string | null };
  platform: {
    version: string | null;
    versionSource: string;
    packageJson: string;
    script: string;
    defaultOutDir: string;
    packCommand: string;
    defaultWebPort: number;
    defaultApiPort: number;
  };
  app: {
    script: string;
    defaultOutDir: string;
    packCommand: string;
    manifestFileName: string;
    defaultWebPort: number;
    defaultApiPort: number;
  };
  enums: {
    network: string[];
    runtime: string[];
    os: string[];
    arch: string[];
    kind: string[];
    patch: string[];
  };
  runningJob: PackJob | null;
}

export interface AppDirInspection {
  appDir: string;
  manifestPath: string;
  manifest: Record<string, string>;
  appName: string;
  applicationCode: string | null;
  preset: string | null;
  appVersion: string;
  appPackageVersion: string | null;
  manifestVersion: string | null;
  versionSource: string;
  appPackageJson: string;
  webPort: number | null;
  apiPort: number | null;
}

export interface PlatformPackInput {
  network: string;
  runtime: string;
  os: string;
  arch: string;
  kind: string;
  patch?: string[];
  webPort?: number;
  apiPort?: number;
  version?: string;
  outDir?: string;
}

export interface AppPackInput {
  appDir: string;
  arch: string;
  kind: string;
  patch?: string[];
  webPort?: number;
  apiPort?: number;
  version?: string;
  outDir?: string;
}

const TIMEOUT = 60 * 1000;

/** 应用部署状态：DEV 模式、默认版本、bash/pnpm、脚本与输出目录 */
export async function getAppDeploymentStatus() {
  return request<{ code: number; message: string; data: AppDeploymentStatus }>(
    `${BASE}/status`,
    {
      method: 'GET',
    },
  );
}

/** 校验应用目录（eadaf.app.yaml + 应用 package.json 版本） */
export async function postAppDirInspect(appDir: string) {
  return request<{ code: number; message: string; data: AppDirInspection }>(
    `${BASE}/app/inspect`,
    {
      method: 'POST',
      data: { appDir },
      timeout: TIMEOUT,
    },
  );
}

/** 发布平台：开始打包 EADAF 平台包（等价 pnpm pack:eadaf） */
export async function postPlatformPack(body: PlatformPackInput) {
  return request<{ code: number; message: string; data: PackJob }>(
    `${BASE}/platform/pack`,
    {
      method: 'POST',
      data: body,
      timeout: TIMEOUT,
    },
  );
}

/** 发布应用：开始打包业务应用（等价 pnpm pack:app） */
export async function postAppPack(body: AppPackInput) {
  return request<{ code: number; message: string; data: PackJob }>(
    `${BASE}/app/pack`,
    {
      method: 'POST',
      data: body,
      timeout: TIMEOUT,
    },
  );
}

/** 最近打包任务（新→旧） */
export async function getPackJobs() {
  return request<{ code: number; message: string; data: { items: PackJob[] } }>(
    `${BASE}/jobs`,
    {
      method: 'GET',
    },
  );
}

/** 单个打包任务详情 */
export async function getPackJob(jobId: string) {
  return request<{ code: number; message: string; data: PackJob }>(
    `${BASE}/jobs/${jobId}`,
    {
      method: 'GET',
    },
  );
}

/** 取消打包任务 */
export async function postPackJobCancel(jobId: string) {
  return request<{ code: number; message: string; data: PackJob }>(
    `${BASE}/jobs/${jobId}/cancel`,
    { method: 'POST' },
  );
}

/** 轮询兜底：取 fromSeq 之后的日志 */
export async function getPackJobLog(jobId: string, fromSeq = 0) {
  return request<{
    code: number;
    message: string;
    data: { job: PackJob; lines: PackLogLine[] };
  }>(`${BASE}/jobs/${jobId}/log`, { method: 'GET', params: { fromSeq } });
}

/** SSE 流地址（开发环境走 devServer proxy，生产走 API_BASE_URL） */
export { resolveStreamApiUrl as resolvePackStreamUrl } from '@/constants/env';
