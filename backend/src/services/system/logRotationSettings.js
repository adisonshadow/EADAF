/**
 * 运行日志滚动配置。
 *
 * 设置页没改过时，用 env / config 里的默认值（LOG_ROTATION_*）。
 * 设置页保存后写入 system_features.logRotation，并立刻套到 winston。
 * 保留时间一律按天（winston 的 maxFiles 用「14d」这种写法）。
 */
const config = require('../../config');

const SIZE_RE = /^(\d+(?:\.\d+)?)([mg])$/i;
const MIN_DAYS = 1;
const MAX_DAYS = 3650;
const MAX_SIZE_NUMBER = 1024;

function parseDays(value, fallback) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  const match = String(value || '').trim().match(/^(\d+)d$/i);
  if (!match) return fallback;
  return Number(match[1]);
}

function defaultsFromConfig() {
  const rotation = config.logging.rotation;
  return {
    maxSize: String(rotation.maxSize || '20m').trim().toLowerCase(),
    retentionDays: parseDays(rotation.maxFiles, 14),
    errorRetentionDays: parseDays(rotation.errorMaxFiles, 30),
    zippedArchive: Boolean(rotation.zippedArchive),
  };
}

function bad(message) {
  return Object.assign(new Error(message), { status: 400 });
}

/**
 * 校验并归一化一份日志滚动配置。非法输入抛 400。
 * 入参可以是设置页的扁平字段，或已存的 logRotation 对象。
 */
function normalizeLogRotation(input = {}) {
  const defaults = defaultsFromConfig();
  const maxSizeRaw = input.maxSize != null ? input.maxSize : input.logMaxSize;
  const retentionRaw = input.retentionDays != null ? input.retentionDays : input.logRetentionDays;
  const errorRetentionRaw = input.errorRetentionDays != null
    ? input.errorRetentionDays
    : input.logErrorRetentionDays;
  const zippedRaw = input.zippedArchive != null ? input.zippedArchive : input.logZippedArchive;

  let maxSize = defaults.maxSize;
  if (maxSizeRaw != null && String(maxSizeRaw).trim() !== '') {
    const match = String(maxSizeRaw).trim().toLowerCase().match(SIZE_RE);
    if (!match) {
      throw bad('单个日志文件大小须为数字加 m 或 g，如 20m、1g');
    }
    const amount = Number(match[1]);
    if (!(amount > 0) || amount > MAX_SIZE_NUMBER) {
      throw bad(`单个日志文件大小须在 1–${MAX_SIZE_NUMBER}（m 或 g）之间`);
    }
    maxSize = `${match[1]}${match[2]}`;
  }

  const retentionDays = normalizeDays(retentionRaw, defaults.retentionDays, '运行日志保留天数');
  const errorRetentionDays = normalizeDays(
    errorRetentionRaw,
    defaults.errorRetentionDays,
    '错误日志保留天数',
  );

  let zippedArchive = defaults.zippedArchive;
  if (zippedRaw != null && zippedRaw !== '') {
    zippedArchive = zippedRaw === true || zippedRaw === 'true' || zippedRaw === 1 || zippedRaw === '1';
  }

  return { maxSize, retentionDays, errorRetentionDays, zippedArchive };
}

function normalizeDays(raw, fallback, label) {
  if (raw == null || raw === '') return fallback;
  const days = Number(raw);
  if (!Number.isInteger(days) || days < MIN_DAYS || days > MAX_DAYS) {
    throw bad(`${label}须为 ${MIN_DAYS}–${MAX_DAYS} 的整数`);
  }
  return days;
}

/** 读库时用：坏数据退回 null（表示仍用默认），不要让设置页打不开。 */
function readStoredLogRotation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    return normalizeLogRotation(value);
  } catch {
    return null;
  }
}

/** 当前生效值：设置页优先，否则 env 默认。 */
function resolveLogRotation(stored) {
  return stored ? normalizeLogRotation(stored) : defaultsFromConfig();
}

/** 交给 winston-daily-rotate-file 的 maxFiles 写法。 */
function toWinstonRotation(settings) {
  const resolved = resolveLogRotation(settings);
  const errorFiles = `${resolved.errorRetentionDays}d`;
  return {
    maxSize: resolved.maxSize,
    maxFiles: `${resolved.retentionDays}d`,
    errorMaxFiles: errorFiles,
    exceptionsMaxFiles: errorFiles,
    rejectionsMaxFiles: errorFiles,
    zippedArchive: resolved.zippedArchive,
  };
}

module.exports = {
  defaultsFromConfig,
  normalizeLogRotation,
  readStoredLogRotation,
  resolveLogRotation,
  toWinstonRotation,
};
