const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { envFileCandidates } = require('./envFiles');

const env = process.env.NODE_ENV || 'development';

// 按优先级从低到高加载 .env → .env.{NODE_ENV} → .env.{NODE_ENV}.local。
//
// dotenv 默认不覆盖已存在的 process.env，那样先加载的文件会"锁死"后面的覆盖，
// 所以这里用 override:true 让文件之间能相互覆盖；同时先把进程里已有的真实
// 环境变量（CI / pm2 / docker -e / 命令行）快照下来，加载完再恢复，
// 保证"真实环境变量 > .env.{NODE_ENV}.local > .env.{NODE_ENV} > .env"。
const externalEnv = { ...process.env };
for (const file of envFileCandidates({ backendRoot: path.join(__dirname, '../..'), nodeEnv: env })) {
  if (fs.existsSync(file)) dotenv.config({ path: file, override: true });
}
Object.assign(process.env, externalEnv);

function parseBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  return value === 'true' || value === '1';
}

function parseInt(value, defaultValue) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

function parseList(value, defaultValue = []) {
  if (!value) {
    return defaultValue;
  }
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

const defaultUploadTypes = {
  image: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    maxSize: 5242880,
    needAuth: false
  },
  video: {
    mimeTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
    extensions: ['.mp4', '.webm', '.mov'],
    maxSize: 104857600,
    needAuth: true
  },
  document: {
    mimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    extensions: ['.pdf', '.doc', '.docx'],
    maxSize: 10485760,
    needAuth: true
  }
};

const postgresql = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT, 25432),
  database: process.env.POSTGRES_DATABASE || 'eadaf_db',
  user: process.env.POSTGRES_USER || 'my_name',
  password: process.env.POSTGRES_PASSWORD || '123456',
  schema: process.env.POSTGRES_SCHEMA || 'uac',
  max_connections: parseInt(process.env.POSTGRES_MAX_CONNECTIONS, 20),
  idle_timeout: parseInt(process.env.POSTGRES_IDLE_TIMEOUT, 30000),
  connection_timeout: parseInt(process.env.POSTGRES_CONNECTION_TIMEOUT, 2000),
  ssl: parseBool(process.env.POSTGRES_SSL, false)
};

const api = {
  port: parseInt(process.env.API_PORT, 29526),
  /** 默认 0.0.0.0：局域网 / 公网可访问；仅本机请设 127.0.0.1（localhost 视为 0.0.0.0，兼容旧 .env） */
  host: (() => {
    const raw = String(process.env.API_HOST || '0.0.0.0').trim();
    if (!raw || raw === 'localhost') return '0.0.0.0';
    return raw;
  })(),
  cors: {
    origin: parseList(process.env.CORS_ORIGIN, ['*']),
    methods: parseList(process.env.CORS_METHODS, ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    allowedHeaders: parseList(process.env.CORS_ALLOWED_HEADERS, ['Content-Type', 'Authorization']),
    credentials: parseBool(process.env.CORS_CREDENTIALS, true),
    maxAge: parseInt(process.env.CORS_MAX_AGE, 86400)
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 900000),
    max: parseInt(process.env.RATE_LIMIT_MAX, 100)
  },
  security: {
    jwtSecret: process.env.JWT_SECRET || 'my-jwt-secret-key',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10)
  },
  loginVerify: {
    enabled: parseBool(process.env.LOGIN_VERIFY_ENABLED, true),
    expiresIn: parseInt(process.env.LOGIN_VERIFY_EXPIRES_IN, 300)
  },
  sso: {
    redirectMode: {
      default: process.env.SSO_REDIRECT_MODE || 'POST_REDIRECT'
    },
    /**
     * 访问令牌有效期（Phase 1 起可收紧到 15m）。
     *
     * 不设时沿用 JWT_EXPIRES_IN（默认 24h）—— 还没实现静默刷新的老接入方不会突然被踢；
     * 新接入方与示例环境把 SSO_ACCESS_TOKEN_TTL 设为 15m 即可收紧。
     * 「登出立即失效」不依赖这个值：中间件按 sid 查撤销集，撤销即生效。
     */
    accessTokenTtl: process.env.SSO_ACCESS_TOKEN_TTL || process.env.JWT_EXPIRES_IN || '24h'
  }
};

const upload = {
  types: defaultUploadTypes,
  defaultType: process.env.UPLOAD_DEFAULT_TYPE || 'image'
};

const logging = {
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.LOG_FORMAT || 'json',
  file: process.env.LOG_FILE || 'logs/app.log',
  rotation: {
    maxSize: process.env.LOG_ROTATION_MAX_SIZE || '20m',
    maxFiles: process.env.LOG_ROTATION_MAX_FILES || '14d',
    zippedArchive: parseBool(process.env.LOG_ROTATION_ZIPPED, true),
    errorMaxFiles: process.env.LOG_ERROR_MAX_FILES || '30d',
    exceptionsMaxFiles: process.env.LOG_EXCEPTIONS_MAX_FILES || '30d',
    rejectionsMaxFiles: process.env.LOG_REJECTIONS_MAX_FILES || '30d'
  }
};

const redis = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT, 26379),
  password: process.env.REDIS_PASSWORD || ''
};

const ai = {
  encryptionKey: process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  upstreamTimeoutMs: parseInt(process.env.AI_UPSTREAM_TIMEOUT_MS, 60000)
};

const systemApplication = {
  applicationId: process.env.SYSTEM_APPLICATION_ID || '10000000-0000-4000-8000-000000000002',
  appSecret: process.env.SYSTEM_APPLICATION_SECRET || '',
};

const backendRoot = path.join(__dirname, '../..');
const cropCacheDirRaw = process.env.IMG_CROP_CACHE_DIR || 'img_crop_cache';
const cropCacheDir = path.isAbsolute(cropCacheDirRaw)
  ? cropCacheDirRaw
  : path.join(backendRoot, cropCacheDirRaw);

const storage = {
  root: process.env.STORAGE_ROOT || 'upload_test',
  cropCacheDir,
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || '',
    accessKey: process.env.MINIO_ACCESS_KEY || '',
    secretKey: process.env.MINIO_SECRET_KEY || '',
    bucket: process.env.MINIO_BUCKET || 'eadaf',
    region: process.env.MINIO_REGION || 'us-east-1',
  },
  systemBucket: {
    code: process.env.SYSTEM_STORAGE_BUCKET_CODE || 'eadaf-system',
    name: process.env.SYSTEM_STORAGE_BUCKET_NAME || 'EADAF系统资源',
    description:
      process.env.SYSTEM_STORAGE_BUCKET_DESCRIPTION
      || 'EADAF业务系统自用资源（用户头像、应用 Logo 等），公开访问，不可编辑或删除',
  },
  tus: {
    maxSize: parseInt(process.env.STORAGE_TUS_MAX_SIZE, 5 * 1024 * 1024 * 1024),
    expirationMs: parseInt(process.env.STORAGE_TUS_EXPIRATION_MS, 24 * 60 * 60 * 1000),
    dirName: process.env.STORAGE_TUS_DIR_NAME || '.tus',
  },
};

module.exports = {
  env,
  postgresql,
  api,
  upload,
  logging,
  redis,
  ai,
  systemApplication,
  storage,
  jwt: {
    secret: env === 'test' ? process.env.TEST_JWT_SECRET : api.security.jwtSecret,
    refreshSecret: env === 'test' ? process.env.TEST_JWT_REFRESH_SECRET : api.security.jwtSecret,
    expiresIn: api.security.jwtExpiresIn,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  }
};
