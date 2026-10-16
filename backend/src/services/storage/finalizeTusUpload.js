const { Worker } = require('worker_threads');
const path = require('path');
const fsp = require('fs/promises');
const { v4: uuidv4 } = require('uuid');
const StorageObject = require('../../models/storage_object');
const StorageBucket = require('../../models/storage_bucket');
const logger = require('../../utils/logger');
const {
  classifyDependencyError,
  noteDependencyDown,
} = require('../../utils/dependencyDiagnostics');
const {
  getSession,
  updateSession,
  listRecoverableFinalizes,
} = require('./tusProgressStore');
const {
  getTusDir,
  buildObjectRelativePath,
  findObjectByBucketAndMd5,
  getObjectById,
} = require('./storageService');
const objectStore = require('./objectStore');

const WORKER_PATH = path.join(__dirname, 'finalizeTusUploadWorker.js');

let worker = null;
let nextJobId = 1;
const pending = new Map();
const queue = [];
let pumping = false;

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(WORKER_PATH);
  worker.on('message', (msg) => {
    const waiter = pending.get(msg.id);
    if (!waiter) return;
    pending.delete(msg.id);
    if (msg.ok) waiter.resolve(msg.result);
    else waiter.reject(new Error(msg.error || 'finalize worker failed'));
  });
  worker.on('error', (error) => {
    logger.error('tus finalize worker error', { message: error.message });
    failAllPending(error);
    worker = null;
  });
  worker.on('exit', (code) => {
    if (code !== 0) {
      failAllPending(new Error(`finalize worker exited ${code}`));
    }
    worker = null;
  });
  return worker;
}

function failAllPending(error) {
  for (const waiter of pending.values()) waiter.reject(error);
  pending.clear();
}

function runWorker(payload) {
  const id = nextJobId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      ensureWorker().postMessage({ id, ...payload });
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
}

function enqueueFinalize(uploadId) {
  if (!uploadId) return;
  if (!queue.includes(uploadId)) queue.push(uploadId);
  void pump();
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const uploadId = queue.shift();
      try {
        await processFinalize(uploadId);
      } catch (error) {
        // 依赖（DB / MinIO）不可用时只报一次，避免按会话逐条刷同样的堆栈
        const dependencyKey = classifyDependencyError(error);
        if (dependencyKey) {
          noteDependencyDown(dependencyKey, error, { context: 'tus finalize 失败' });
        } else {
          logger.error('tus finalize 失败', { uploadId, message: error.message, stack: error.stack });
        }
        try {
          await updateSession(uploadId, { status: 'failed', errorMessage: error.message });
        } catch (updateError) {
          logger.warn('tus finalize 写失败状态出错', { uploadId, message: updateError.message });
        }
      }
    }
  } finally {
    pumping = false;
    if (queue.length) void pump();
  }
}

function normalizeMd5(value) {
  if (!value) return null;
  const hex = String(value).trim().toLowerCase();
  return /^[a-f0-9]{32}$/.test(hex) ? hex : null;
}

async function processFinalize(uploadId) {
  const session = await getSession(uploadId);
  if (!session) {
    logger.warn('tus finalize 找不到会话', { uploadId });
    return;
  }
  if (['completed', 'duplicate', 'expired'].includes(session.status)) return;

  if (session.objectId) {
    const existing = await getObjectById(session.objectId);
    if (existing) {
      await updateSession(uploadId, { status: 'completed' });
      return;
    }
  }

  await updateSession(uploadId, { status: 'finalizing' });

  const sourcePath = path.join(getTusDir(), uploadId);

  if (session.relativePath && session.contentMd5) {
    const stored = await objectStore.stat(session.relativePath);
    if (stored) {
      await persistObject(
        session,
        normalizeMd5(session.contentMd5),
        Number(stored.size || session.uploadLength || 0),
        session.objectId || undefined,
      );
      return;
    }
  }

  const { md5, size } = await runWorker({ action: 'hash', sourcePath });
  const contentMd5 = normalizeMd5(md5);
  if (!contentMd5) throw new Error('无法计算文件 MD5');

  const expected = normalizeMd5(session.expectedMd5);
  if (expected && expected !== contentMd5) {
    await updateSession(uploadId, {
      status: 'failed',
      contentMd5,
      errorMessage: 'MD5 与客户端声明不一致',
    });
    return;
  }

  const dup = await findObjectByBucketAndMd5(session.bucketId, contentMd5);
  if (dup) {
    await fsp.unlink(sourcePath).catch(() => {});
    await updateSession(uploadId, {
      status: 'duplicate',
      contentMd5,
      objectId: dup.objectId,
    });
    return;
  }

  const objectId = uuidv4();
  const bucket = await StorageBucket.findByPk(session.bucketId);
  if (!bucket) throw new Error('Bucket 不存在');
  const relativePath = buildObjectRelativePath(bucket.code, objectId, session.filename);
  await updateSession(uploadId, { relativePath, contentMd5 });
  await objectStore.putFile(relativePath, sourcePath, {
    'Content-Type': session.mimeType || 'application/octet-stream',
  });
  await fsp.unlink(sourcePath).catch(() => {});
  await persistObject({ ...session, relativePath }, contentMd5, size, objectId);
}

async function persistObject(session, contentMd5, size, objectId) {
  const id = objectId || uuidv4();
  try {
    await StorageObject.create({
      object_id: id,
      bucket_id: session.bucketId,
      name: session.filename,
      mime_type: session.mimeType || 'application/octet-stream',
      size,
      relative_path: session.relativePath,
      content_md5: contentMd5,
      application_id: session.applicationId || null,
      created_by: session.createdBy || null,
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      const dup = await findObjectByBucketAndMd5(session.bucketId, contentMd5);
      if (dup) {
        await objectStore.remove(session.relativePath).catch(() => {});
        await updateSession(session.uploadId, {
          status: 'duplicate',
          contentMd5,
          objectId: dup.objectId,
        });
        return;
      }
    }
    throw error;
  }
  await updateSession(session.uploadId, {
    status: 'completed',
    contentMd5,
    objectId: id,
    relativePath: session.relativePath,
  });
}

async function recoverPendingFinalizes() {
  const sessions = await listRecoverableFinalizes();
  for (const session of sessions) {
    enqueueFinalize(session.uploadId);
  }
  if (sessions.length) {
    logger.info('tus finalize 启动回收', { count: sessions.length });
  }
}

module.exports = {
  enqueueFinalize,
  recoverPendingFinalizes,
  processFinalize,
};
