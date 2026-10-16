const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const cron = require('node-cron');
const logger = require('../../utils/logger');
const { reportDependencyError } = require('../../utils/dependencyDiagnostics');
const { getTusServer } = require('./tusServer');
const { getTusDir } = require('./storageService');
const {
  listExpiredActive,
  listTerminalForCleanup,
  updateSession,
  deleteRedis,
} = require('./tusProgressStore');

let scheduledJob = null;
let running = false;

async function removeTusFiles(uploadId) {
  const dir = getTusDir();
  const candidates = [
    path.join(dir, uploadId),
    path.join(dir, `${uploadId}.json`),
    path.join(dir, `${uploadId}.info`),
  ];
  for (const filePath of candidates) {
    try {
      await fsp.unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.warn('tus 临时文件删除失败', { filePath, message: error.message });
      }
    }
  }
}

async function cleanupExpiredSessions() {
  const expired = await listExpiredActive();
  for (const session of expired) {
    await removeTusFiles(session.uploadId);
    await updateSession(session.uploadId, { status: 'expired', errorMessage: '上传会话已过期' });
    await deleteRedis(session.uploadId);
  }
  return expired.length;
}

async function cleanupCompletedTempFiles() {
  const done = await listTerminalForCleanup();
  let removed = 0;
  for (const session of done) {
    const dir = getTusDir();
    const dataPath = path.join(dir, session.uploadId);
    if (fs.existsSync(dataPath)) {
      await removeTusFiles(session.uploadId);
      removed += 1;
    }
  }
  return removed;
}

async function cleanupOrphanTempFiles() {
  const dir = getTusDir();
  if (!fs.existsSync(dir)) return 0;
  const { getSession } = require('./tusProgressStore');
  const expirationMs = require('../../config').storage.tus.expirationMs;
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  let removed = 0;
  const now = Date.now();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.endsWith('.json') || entry.name.endsWith('.info')) continue;
    const uploadId = entry.name;
    const session = await getSession(uploadId);
    if (session) continue;
    const fullPath = path.join(dir, entry.name);
    const stats = await fsp.stat(fullPath);
    if (now - stats.mtimeMs < expirationMs) continue;
    await removeTusFiles(uploadId);
    removed += 1;
  }
  return removed;
}

async function runTusCleanup() {
  if (running) return;
  running = true;
  try {
    let datastoreExpired = 0;
    try {
      datastoreExpired = await (await getTusServer()).cleanUpExpiredUploads();
    } catch (error) {
      logger.warn('tus FileStore 过期清理失败', { message: error.message });
    }
    const expiredSessions = await cleanupExpiredSessions();
    const leftover = await cleanupCompletedTempFiles();
    const orphans = await cleanupOrphanTempFiles();
    if (datastoreExpired || expiredSessions || leftover || orphans) {
      logger.info('tus 临时文件清理完成', {
        datastoreExpired,
        expiredSessions,
        leftover,
        orphans,
      });
    }
  } catch (error) {
    reportDependencyError('tus 清理任务失败', error);
  } finally {
    running = false;
  }
}

function startTusCleanupScheduler() {
  if (scheduledJob) return;
  scheduledJob = cron.schedule('*/15 * * * *', () => {
    runTusCleanup().catch((error) => {
      reportDependencyError('tus 清理调度异常', error);
    });
  });
  logger.info('tus 过期清理调度已启动', { cron: '*/15 * * * *' });
  runTusCleanup().catch((error) => {
    reportDependencyError('tus 启动清理推迟', error);
  });
}

module.exports = {
  startTusCleanupScheduler,
  runTusCleanup,
  removeTusFiles,
};
