/**
 * 用户登录令牌有效期。
 *
 * 设置页没保存时：
 * - 访问令牌沿用现有环境变量链（SSO_ACCESS_TOKEN_TTL，否则 JWT_EXPIRES_IN）
 * - 刷新令牌沿用 JWT_REFRESH_EXPIRES_IN
 * 设置页保存后写入 system_features，签发新令牌时高于环境变量。
 * 老的 /users 登录仍只覆盖 JWT_EXPIRES_IN，不把 SSO_ACCESS_TOKEN_TTL 套到那条老接口上。
 */
const config = require('../../config');

const DURATION_RE = /^(\d+)(s|m|h|d)$/i;
const MIN_SECONDS = 60;
const MAX_SECONDS = 3650 * 24 * 60 * 60;

let memory = {
  expiresIn: null,
  refreshExpiresIn: null,
};

function bad(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function durationToSeconds(value, fallbackSeconds) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value);
  const text = String(value || '').trim();
  if (!text) return fallbackSeconds;
  const matched = text.match(/^(\d+)\s*(ms|s|m|h|d)?$/i);
  if (!matched) return fallbackSeconds;
  const amount = Number(matched[1]);
  if (!Number.isFinite(amount) || amount <= 0) return fallbackSeconds;
  switch ((matched[2] || 's').toLowerCase()) {
    case 'ms': return Math.max(1, Math.floor(amount / 1000));
    case 'm': return amount * 60;
    case 'h': return amount * 3600;
    case 'd': return amount * 86400;
    default: return amount;
  }
}

function durationToMs(value, fallbackMs) {
  const seconds = durationToSeconds(value, Math.floor(fallbackMs / 1000));
  return seconds * 1000;
}

/**
 * 校验并归一化一段有效期。空串表示恢复环境变量（返回 null）。非法输入抛 400。
 * @param {unknown} raw
 * @param {string} label
 * @returns {string|null}
 */
function normalizeDuration(raw, label) {
  if (raw == null) return null;
  const text = String(raw).trim().toLowerCase();
  if (!text) return null;
  const match = text.match(DURATION_RE);
  if (!match) {
    throw bad(`${label}须为数字加单位，如 15m、24h、7d`);
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const seconds = durationToSeconds(`${amount}${unit}`, 0);
  if (seconds < MIN_SECONDS) {
    throw bad(`${label}不能短于 1 分钟`);
  }
  if (seconds > MAX_SECONDS) {
    throw bad(`${label}不能超过 3650 天`);
  }
  return `${amount}${unit}`;
}

/** 读库存档；坏数据当没配过 */
function readStoredDuration(value) {
  if (typeof value !== 'string') return null;
  try {
    return normalizeDuration(value, '登录有效期');
  } catch {
    return null;
  }
}

function applyAuthTokenSettings(stored = {}) {
  memory = {
    expiresIn: readStoredDuration(stored.jwtExpiresIn != null ? stored.jwtExpiresIn : stored.expiresIn),
    refreshExpiresIn: readStoredDuration(
      stored.jwtRefreshExpiresIn != null ? stored.jwtRefreshExpiresIn : stored.refreshExpiresIn,
    ),
  };
}

/** 设置页的访问令牌；未配置时退回 JWT_EXPIRES_IN（不含 SSO_ACCESS_TOKEN_TTL） */
function resolveJwtExpiresIn() {
  return memory.expiresIn || config.jwt.expiresIn || config.api.security.jwtExpiresIn || '24h';
}

/**
 * 用户登录（/auth/login、刷新、OIDC）实际签发的访问令牌有效期。
 * 设置页有值时高于 SSO_ACCESS_TOKEN_TTL 和 JWT_EXPIRES_IN。
 */
function resolveLoginAccessExpiresIn() {
  if (memory.expiresIn) return memory.expiresIn;
  return config.api?.sso?.accessTokenTtl || config.jwt.expiresIn || '24h';
}

/** 刷新令牌有效期。设置页有值时高于 JWT_REFRESH_EXPIRES_IN。 */
function resolveRefreshExpiresIn() {
  return memory.refreshExpiresIn || config.jwt.refreshExpiresIn || '7d';
}

function envLoginAccessExpiresIn() {
  return config.api?.sso?.accessTokenTtl || config.jwt.expiresIn || '24h';
}

function envRefreshExpiresIn() {
  return config.jwt.refreshExpiresIn || '7d';
}

function publicSettings() {
  return {
    jwtExpiresIn: resolveLoginAccessExpiresIn(),
    jwtRefreshExpiresIn: resolveRefreshExpiresIn(),
    jwtExpiresInIsCustom: Boolean(memory.expiresIn),
    jwtRefreshExpiresInIsCustom: Boolean(memory.refreshExpiresIn),
    defaultJwtExpiresIn: envLoginAccessExpiresIn(),
    defaultJwtRefreshExpiresIn: envRefreshExpiresIn(),
  };
}

module.exports = {
  normalizeDuration,
  readStoredDuration,
  applyAuthTokenSettings,
  resolveJwtExpiresIn,
  resolveLoginAccessExpiresIn,
  resolveRefreshExpiresIn,
  durationToSeconds,
  durationToMs,
  publicSettings,
  envLoginAccessExpiresIn,
  envRefreshExpiresIn,
};
