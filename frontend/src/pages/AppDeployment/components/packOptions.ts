/** 发布平台 / 发布应用 共用的下拉选项与说明文案 */

export const KIND_OPTIONS = [
  { value: 'install', label: '安装包（首次部署）' },
  { value: 'upgrade', label: '升级包（仅程序）' },
  { value: 'patch', label: '补丁包（web / api）' },
];

export const NETWORK_OPTIONS = [
  { value: 'offline', label: '离线（目标机不能上网）' },
  { value: 'online', label: '在线（目标机可上网安装运行时）' },
];

export const RUNTIME_OPTIONS = [
  { value: 'compose', label: 'Docker Compose' },
  { value: 'k8s', label: 'K8s Pod（集群需已存在）' },
];

export const OS_OPTIONS = [
  { value: 'centos', label: 'CentOS / RHEL / Rocky / Alma' },
  { value: 'ubuntu', label: 'Ubuntu' },
  { value: 'debian', label: 'Debian' },
];

export const ARCH_OPTIONS = [
  { value: 'amd64', label: 'amd64 (x86_64)' },
  { value: 'arm64', label: 'arm64 (aarch64)' },
];

export const PATCH_OPTIONS = [
  { value: 'web', label: '前端程序 web' },
  { value: 'api', label: '后端程序 api' },
];

/** 数据补丁已停用，改走「应用数据导出/导入」 */
export const PATCH_DISABLED_HINT =
  '数据补丁（bizdata）已停用：应用的配置、模型与业务数据请用「应用数据导出/导入」。';

export const DEV_MODE_HINT =
  '发布平台 / 发布应用 只在 DEV 模式（后端 NODE_ENV=development，即 pnpm dev / pm2dev 起的开发栈）下可用。';

const KIND_LABEL: Record<string, string> = {
  install: '安装包',
  upgrade: '升级包',
  patch: '补丁包',
};

const NETWORK_LABEL: Record<string, string> = {
  offline: '离线',
  online: '在线',
};

const RUNTIME_LABEL: Record<string, string> = {
  compose: 'Compose',
  k8s: 'K8s',
};

/** 按当前平台/应用的路径分隔符拼接「项目目录 + 相对路径」 */
export function joinProjectPath(
  root: string | null | undefined,
  relative: string,
): string {
  const base = String(root || '').replace(/[\\/]+$/, '');
  if (!base) return relative;
  const sep = base.includes('\\') ? '\\' : '/';
  return `${base}${sep}${relative.replace(/[\\/]+/g, sep)}`;
}

/** 把项目目录前缀显示成 `<项目目录>/...`（统一用正斜杠，示例里不出现某台机器的绝对路径） */
export function aliasProjectPath(
  target: string,
  repoRoot?: string | null,
): string {
  const root = String(repoRoot || '').replace(/[\\/]+$/, '');
  if (!root || !target.startsWith(root)) return target;
  const rest = target
    .slice(root.length)
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  return rest ? `<项目目录>/${rest}` : '<项目目录>';
}

/** 任务 meta → 历史记录里的一行配置摘要 */
export function describePackMeta(
  kind: 'platform' | 'app',
  meta: Record<string, unknown> | null | undefined,
): string {
  const data = meta || {};
  const parts: string[] = [];
  const kindLabel =
    KIND_LABEL[String(data.kind || '')] || String(data.kind || '');
  if (kindLabel) parts.push(kindLabel);
  const patch = Array.isArray(data.patch) ? (data.patch as string[]) : [];
  if (patch.length) parts.push(patch.join('+'));
  if (kind === 'platform') {
    if (data.arch) parts.push(String(data.arch));
    if (data.network || data.runtime) {
      parts.push(
        [
          NETWORK_LABEL[String(data.network || '')],
          RUNTIME_LABEL[String(data.runtime || '')],
        ]
          .filter(Boolean)
          .join(' / '),
      );
    }
    if (data.os) parts.push(String(data.os));
  } else {
    if (data.arch) parts.push(String(data.arch));
    if (data.preset) parts.push(`preset ${data.preset}`);
  }
  return parts.filter(Boolean).join(' · ');
}
