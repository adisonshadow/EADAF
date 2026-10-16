import type { PackLogLine } from '@/services/EADAF/api/appDeployment';

/** 控制台配色：正常输出 / 进度信息（stderr 里的 docker buildx 等）/ 警告 / 错误 */
export const LOG_COLOR = {
  normal: '#d4d4d4',
  info: '#b7eb8f',
  warn: '#ffe58f',
  error: '#ffa39e',
  muted: '#8c8c8c',
};

/** 警告（黄） */
const WARN_RE = /(\[WARN\]|\bwarn(ing)?s?\b|deprecat|已停用)/i;

/**
 * 是否算「真错误」：docker buildx 的进度（#1 DONE 0.0s）走 stderr，不能算错。
 *
 * 中文只认「动词+失败」或「失败：」，避免把提示语里的假设句（如「如拉包失败，用 … 覆盖」）
 * 误标成红色。脚本真正的失败都走 `die()` → `[ERR] ...`，已被 `[ERR]` 兜住。
 */
export function isErrorLine(text: string): boolean {
  if (/\[ERR\]/i.test(text)) return true;
  // “0 errors” 是成功统计，不算错误
  if (/\b0\s+errors?\b/i.test(text)) return false;
  return /(\berror\b|\berrors\b|\bfailed\b|\bfailure\b|\bfatal\b|\bpanic:|\bexception\b|\btraceback\b|not found|no such file|permission denied|\bcannot |\bunable to|did not complete successfully|exit code: [1-9]|缺少命令|命令失败|(打包|构建|安装|执行|校验|导入|导出|启动|连接|生成|复制|写入|读取|上传|下载|部署)失败|失败[:：])/i.test(
    text,
  );
}

/**
 * 单行日志的颜色。
 *
 * docker 构建、pnpm 等大量「进度信息」写在 **stderr**，早先一律按浅红显示，容易被误读成报错；
 * 现在：真错误=浅红、警告=浅黄、其余 stderr=浅绿（进度信息）、stdout=默认色。
 */
export function logLineColor(line: PackLogLine): string {
  const text = line.text || '';
  if (isErrorLine(text)) return LOG_COLOR.error;
  if (WARN_RE.test(text)) return LOG_COLOR.warn;
  if (line.stream === 'stderr') return LOG_COLOR.info;
  return LOG_COLOR.normal;
}
