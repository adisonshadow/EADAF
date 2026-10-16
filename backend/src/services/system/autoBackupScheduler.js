const cron = require('node-cron');
const logger = require('../../utils/logger');
const { reportDependencyError } = require('../../utils/dependencyDiagnostics');

/**
 * 自动备份调度器：按 system_features 里的 autoBackupEnabled / autoBackupCron
 * 注册 node-cron 定时任务，复用 runBackup（与「立即备份」同一执行链路）。
 *
 * - 启动时由 app.js 调 startAutoBackupScheduler() 恢复调度
 * - 配置变更后由 systemService.updateSystemFeatures() 调 applyAutoBackupSchedule() 重排
 * - 惰性 require systemService（仅在执行时加载），避免模块级循环依赖
 */

let scheduledJob = null;
let running = false;

function stopAutoBackupJob() {
  if (scheduledJob) {
    scheduledJob.stop();
    scheduledJob = null;
  }
}

async function runAutoBackup() {
  if (running) {
    logger.info('Auto backup skipped, previous run still in progress');
    return;
  }
  running = true;
  try {
    const { runBackup } = require('./systemService');
    const result = await runBackup();
    logger.info('Auto backup completed', {
      latestBackup: result?.latestBackup?.name || null,
    });
  } catch (error) {
    logger.error('Auto backup failed', { message: error.message });
  } finally {
    running = false;
  }
}

function applyAutoBackupSchedule(features) {
  stopAutoBackupJob();

  if (!features?.autoBackupEnabled) {
    logger.info('Auto backup scheduler disabled');
    return;
  }

  const expr = String(features.autoBackupCron || '').trim();
  if (!expr || !cron.validate(expr)) {
    logger.warn('Auto backup scheduler not started: invalid cron expression', { expr });
    return;
  }

  scheduledJob = cron.schedule(expr, () => {
    runAutoBackup().catch((error) => {
      logger.error('Auto backup run unexpected error', { message: error.message });
    });
  });
  logger.info('Auto backup scheduler started', { cron: expr });
}

function startAutoBackupScheduler() {
  const { getSystemFeatures } = require('./systemService');
  getSystemFeatures()
    .then((features) => applyAutoBackupSchedule(features))
    .catch((error) => {
      reportDependencyError('Auto backup scheduler init deferred', error);
    });
}

module.exports = {
  applyAutoBackupSchedule,
  startAutoBackupScheduler,
  stopAutoBackupJob,
};
