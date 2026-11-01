const config = require('../../config');
const logger = require('../../utils/logger');
const StorageBucket = require('../../models/storage_bucket');
const { authFromTusRequest, tusError } = require('./tusAuth');
const {
  createSession,
  getSession,
  isOwner,
  updateProgress,
  updateSession,
} = require('./tusProgressStore');
const { enqueueFinalize } = require('./finalizeTusUpload');
const { getTusDir, sanitizeStorageFilename } = require('./storageService');
const { resolveUploadApplicationId, resolveUploadUserId } = require('./storageAccessService');
const fileStorageSettings = require('./fileStorageSettings');

const TUS_PATH = '/api/v1/storage/tus';

const TUS_ALLOW_HEADERS = [
  'Authorization',
  'Content-Type',
  'Accept',
  'Tus-Resumable',
  'Upload-Length',
  'Upload-Offset',
  'Upload-Metadata',
  'Upload-Defer-Length',
  'Upload-Checksum',
  'Upload-Concat',
  'Upload-Expires',
  'X-Requested-With',
];

const TUS_EXPOSE_HEADERS = [
  'Location',
  'Tus-Resumable',
  'Tus-Version',
  'Tus-Extension',
  'Tus-Max-Size',
  'Tus-Checksum-Algorithm',
  'Upload-Offset',
  'Upload-Length',
  'Upload-Metadata',
  'Upload-Expires',
  'Upload-Concat',
];

let tusServer = null;
let tusServerPromise = null;

function normalizeMd5(value) {
  if (!value) return null;
  const hex = String(value).trim().toLowerCase();
  return /^[a-f0-9]{32}$/.test(hex) ? hex : null;
}

function isTusProtocolPath(pathname) {
  if (!pathname) return false;
  const clean = pathname.split('?')[0];
  if (clean === TUS_PATH || clean === `${TUS_PATH}/`) return true;
  if (!clean.startsWith(`${TUS_PATH}/`)) return false;
  const rest = clean.slice(TUS_PATH.length + 1);
  if (!rest || rest.includes('/')) return false;
  return true;
}

async function onIncomingRequest(req, uploadId) {
  const authContext = authFromTusRequest(req);
  if (!uploadId) return;
  const session = await getSession(uploadId);
  if (!session) return;
  if (!isOwner(session, authContext)) {
    throw tusError(403, '无权访问该上传会话');
  }
}

async function onUploadCreate(req, upload) {
  const authContext = authFromTusRequest(req);
  const metadata = upload.metadata || {};
  const bucketCode = String(metadata.bucketCode || '').trim();
  if (!bucketCode) {
    throw tusError(400, 'Upload-Metadata 缺少 bucketCode');
  }
  const bucket = await StorageBucket.findOne({ where: { code: bucketCode, status: 'ACTIVE' } });
  if (!bucket) {
    throw tusError(400, 'Bucket 不存在或已停用');
  }
  const maxSize = config.storage.tus.maxSize;
  if (upload.size != null && Number(upload.size) > maxSize) {
    throw tusError(413, `文件超过上限 ${maxSize} 字节`);
  }
  // 按设置里的图片/文档/视频三档校验：建会话时就拒，避免白传几百 MB
  try {
    fileStorageSettings.assertUploadAllowed({
      mimeType: metadata.contentType || metadata.filetype,
      filename: metadata.filename || metadata.name,
      size: upload.size || 0,
    });
  } catch (error) {
    throw tusError(error.status || 400, error.message);
  }
  const filename = sanitizeStorageFilename(metadata.filename || metadata.name || 'file');
  const expectedMd5 = normalizeMd5(metadata.md5);
  await createSession({
    uploadId: upload.id,
    bucketId: bucket.bucket_id,
    filename,
    mimeType: metadata.contentType || metadata.filetype || 'application/octet-stream',
    uploadLength: upload.size || 0,
    expectedMd5,
    ownerKind: authContext.kind === 'application' ? 'application' : 'user',
    applicationId: resolveUploadApplicationId(authContext, metadata.applicationId || null),
    createdBy: resolveUploadUserId(authContext),
  });
  return { metadata: { ...metadata, filename, bucketCode } };
}

async function onUploadFinish(_req, upload) {
  await updateProgress(upload.id, {
    offset: upload.offset,
    status: 'pending_finalize',
  });
  enqueueFinalize(upload.id);
  return {};
}

async function getTusServer() {
  if (tusServer) return tusServer;
  if (tusServerPromise) return tusServerPromise;

  tusServerPromise = (async () => {
    const [{ Server, EVENTS }, { FileStore }] = await Promise.all([
      import('@tus/server'),
      import('@tus/file-store'),
    ]);
    const directory = getTusDir();
    const server = new Server({
      path: TUS_PATH,
      datastore: new FileStore({
        directory,
        expirationPeriodInMilliseconds: config.storage.tus.expirationMs,
      }),
      maxSize: config.storage.tus.maxSize,
      relativeLocation: true,
      respectForwardedHeaders: true,
      allowedHeaders: TUS_ALLOW_HEADERS,
      exposedHeaders: TUS_EXPOSE_HEADERS,
      allowedCredentials: true,
      postReceiveInterval: 1000,
      disableTerminationForFinishedUploads: true,
      onIncomingRequest,
      onUploadCreate,
      onUploadFinish,
    });

    server.on(EVENTS.POST_RECEIVE, (_req, upload) => {
      updateProgress(upload.id, { offset: upload.offset }).catch((error) => {
        logger.warn('tus 进度写入失败', { uploadId: upload.id, message: error.message });
      });
    });

    server.on(EVENTS.POST_TERMINATE, (_req, _res, id) => {
      updateSession(id, { status: 'failed', errorMessage: '客户端终止上传' }).catch((error) => {
        logger.warn('tus 终止状态写入失败', { uploadId: id, message: error.message });
      });
    });

    tusServer = server;
    logger.info('tus 上传服务已初始化', { directory, maxSize: config.storage.tus.maxSize });
    return server;
  })().catch((error) => {
    tusServerPromise = null;
    throw error;
  });

  return tusServerPromise;
}

module.exports = {
  TUS_PATH,
  TUS_ALLOW_HEADERS,
  TUS_EXPOSE_HEADERS,
  isTusProtocolPath,
  getTusServer,
};
