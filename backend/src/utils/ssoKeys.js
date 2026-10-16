/**
 * EADAF 平台签名密钥（RS256）—— 用户访问令牌 / ID Token 由**平台**统一签发。
 *
 * 为什么需要：Phase 2 起令牌由平台签发（`iss`/`aud`/`kid`），应用侧用 JWKS 公钥验签，
 * 不再需要把应用密钥当"令牌签名密钥"分发到每个应用（那是"漏带 ?app= 就 401"的根源）。
 *
 * 密钥来源（按优先级）：
 *   1. 环境变量 `SSO_JWT_PRIVATE_KEY`（PEM；`\n` 可写成字面量）+ 可选 `SSO_JWT_PUBLIC_KEY`；
 *   2. 文件 `<SSO_JWT_KEY_DIR|backend/data/keys>/sso-signing-private.pem`（+ `-public.pem`）；
 *   3. 都没有 → 自动生成并落盘（重启不失效）。生产建议用环境变量固定，避免容器重建换密钥。
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const KEY_DIR = process.env.SSO_JWT_KEY_DIR
  || path.join(__dirname, '..', '..', 'data', 'keys');
const PRIVATE_KEY_PATH = path.join(KEY_DIR, 'sso-signing-private.pem');
const PUBLIC_KEY_PATH = path.join(KEY_DIR, 'sso-signing-public.pem');

/** 环境变量里的 PEM 常写成一行 + `\n` 转义 */
function normalizePem(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.includes('\\n') ? text.replace(/\\n/g, '\n') : text;
}

function derivePublicKey(privateKey) {
  return crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
}

function loadOrCreateKeys() {
  const privateKeyFromEnv = normalizePem(process.env.SSO_JWT_PRIVATE_KEY);
  if (privateKeyFromEnv) {
    const publicKeyFromEnv = normalizePem(process.env.SSO_JWT_PUBLIC_KEY);
    return {
      privateKey: privateKeyFromEnv,
      publicKey: publicKeyFromEnv || derivePublicKey(privateKeyFromEnv),
      source: 'env',
    };
  }

  if (fs.existsSync(PRIVATE_KEY_PATH)) {
    const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
    const publicKey = fs.existsSync(PUBLIC_KEY_PATH)
      ? fs.readFileSync(PUBLIC_KEY_PATH, 'utf8')
      : derivePublicKey(privateKey);
    return { privateKey, publicKey, source: 'file' };
  }

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  try {
    fs.mkdirSync(KEY_DIR, { recursive: true });
    fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 });
    fs.writeFileSync(PUBLIC_KEY_PATH, publicKey, { mode: 0o644 });
    logger.warn('SSO 平台签名密钥不存在，已自动生成并落盘；生产建议用 SSO_JWT_PRIVATE_KEY 固定', {
      dir: KEY_DIR,
    });
  } catch (error) {
    logger.warn('SSO 平台签名密钥落盘失败（本次仅内存使用，重启后会换密钥）', {
      error: error.message,
    });
  }

  return { privateKey, publicKey, source: 'generated' };
}

let cached = null;

function getKeys() {
  if (!cached) cached = loadOrCreateKeys();
  return cached;
}

function getPrivateKey() {
  return getKeys().privateKey;
}

function getPublicKey() {
  return getKeys().publicKey;
}

/** `kid`：公钥 SPKI DER 的 SHA-256 前 16 个 base64url 字符 —— 随密钥变化且稳定 */
function getKeyId() {
  const keys = getKeys();
  if (!keys.kid) {
    const der = crypto.createPublicKey(keys.publicKey).export({ type: 'spki', format: 'der' });
    keys.kid = crypto.createHash('sha256').update(der).digest('base64url').slice(0, 16);
  }
  return keys.kid;
}

/** JWKS（公开，供应用 BFF 本地验签） */
function getJwks() {
  const jwk = crypto.createPublicKey(getPublicKey()).export({ format: 'jwk' });
  return {
    keys: [
      {
        kty: jwk.kty,
        use: 'sig',
        alg: 'RS256',
        kid: getKeyId(),
        n: jwk.n,
        e: jwk.e,
      },
    ],
  };
}

module.exports = {
  getPrivateKey,
  getPublicKey,
  getKeyId,
  getJwks,
  getKeys,
  KEY_DIR,
};
