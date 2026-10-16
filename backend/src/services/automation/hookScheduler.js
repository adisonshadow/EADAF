/**
 * 钩子调度器：cron 触发源动态注册（DB 配置驱动，metricScheduler 模式）+ Run 保留清理。
 * - 启动/refresh 时读 enabled 的 schedule.cron 钩子，逐个 cron.schedule
 * - 到点经 Redis 锁防多实例并发（Redis 不可用降级放行）
 * - 每日清理：删除 30 天前 Run；每钩子仅保留最近 1000 条
 */
const cron = require('node-cron');
const { Op } = require('sequelize');
const logger = require('../../utils/logger');
const { reportDependencyError } = require('../../utils/dependencyDiagnostics');
const { AutomationHook, AutomationHookRun } = require('../../models');
const { getRedisClient } = require('../../utils/redisClient');
const { emit } = require('./eventDispatcher');

const RUN_RETENTION_DAYS = 30;
const RUN_RETENTION_PER_HOOK = 1000;

const LOCK_PREFIX = 'eadaf:automation:';
const RUN_LOCK_TTL = 300; // 秒

const scheduledJobs = [];
let cleanupJob = null;

function clearJobs() {
  scheduledJobs.forEach((job) => job.stop());
  scheduledJobs.length = 0;
}

async function acquireCronLock(hookId) {
  const client = await getRedisClient();
  if (!client) return true; // Redis 不可用降级放行（单实例假设）
  const key = `${LOCK_PREFIX}lock:cron:${hookId}`;
  const result = await client.set(key, '1', { NX: true, EX: RUN_LOCK_TTL });
  return result === 'OK';
}

async function releaseCronLock(hookId) {
  try {
    const client = await getRedisClient();
    if (client) await client.del(`${LOCK_PREFIX}lock:cron:${hookId}`);
  } catch { /* 释放失败等 TTL 过期 */ }
}

/** 到点触发：emit schedule.cron（payload.cron 用于扇出匹配同一表达式的钩子） */
async function fireCronHook(hook, fireAt) {
  const locked = await acquireCronLock(hook.id);
  if (!locked) {
    logger.info('钩子 cron 触发跳过（锁被占用）', { hookId: hook.id });
    return;
  }
  try {
    await emit('schedule.cron', {
      cron: hook.eventFilter?.cron || '',
      fire_at: fireAt.toISOString(),
      hook_id: hook.id,
    }, { source: 'schedule' });
  } finally {
    await releaseCronLock(hook.id);
  }
}

async function registerCronJobs() {
  clearJobs();
  const rows = await AutomationHook.findAll({
    where: { status: 'enabled', event_type: 'schedule.cron' },
  });
  let registered = 0;
  for (const row of rows) {
    const expression = String(row.event_filter?.cron || '').trim();
    if (!expression || !cron.validate(expression)) {
      logger.warn('钩子 cron 表达式无效，跳过注册', { hookId: row.id, expression });
      continue;
    }
    const hookId = row.id;
    const hookFilter = row.event_filter;
    const job = cron.schedule(expression, () => {
      const fireAt = new Date();
      fireCronHook({ id: hookId, eventFilter: hookFilter }, fireAt)
        .catch((err) => logger.error('钩子 cron 触发失败', { hookId, error: err.message }));
    });
    scheduledJobs.push(job);
    registered += 1;
  }
  logger.info('钩子调度器已注册', { jobs: registered });
}

/** 每日清理：30 天前 + 每钩子最近 1000 条 */
async function cleanupHookRuns() {
  const cutoff = new Date(Date.now() - RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const expired = await AutomationHookRun.destroy({
    where: { started_at: { [Op.lt]: cutoff } },
  });

  // 每钩子保留最近 N 条：小表场景逐钩子删除，避免窗口函数方言差异
  const hookIds = await AutomationHookRun.findAll({
    attributes: ['hook_id'],
    group: ['hook_id'],
  }).then((rows) => rows.map((r) => r.hook_id));

  let trimmed = 0;
  for (const hookId of hookIds) {
    const kept = await AutomationHookRun.findAll({
      where: { hook_id: hookId },
      order: [['started_at', 'DESC']],
      limit: RUN_RETENTION_PER_HOOK,
      attributes: ['id'],
    });
    if (kept.length < RUN_RETENTION_PER_HOOK) continue;
    const keepIds = kept.map((r) => r.id);
    trimmed += await AutomationHookRun.destroy({
      where: {
        hook_id: hookId,
        id: { [Op.notIn]: keepIds },
      },
    });
  }

  if (expired || trimmed) {
    logger.info('钩子运行记录清理完成', { expired, trimmed });
  }
}

async function startHookScheduler() {
  try {
    await registerCronJobs();
  } catch (error) {
    reportDependencyError('钩子调度器启动失败', error);
  }
  if (!cleanupJob) {
    cleanupJob = cron.schedule('0 3 * * *', () => {
      cleanupHookRuns().catch((err) => logger.warn('钩子运行记录清理失败', { error: err.message }));
    });
  }
}

/** CRUD/启停后重排（惰性 require 防循环依赖；hookService 调用） */
function refreshHookScheduler() {
  try {
    registerCronJobs().catch((err) => logger.warn('钩子调度器刷新失败', { error: err.message }));
  } catch { /* 调度器未加载时忽略 */ }
}

function stopHookScheduler() {
  clearJobs();
  if (cleanupJob) {
    cleanupJob.stop();
    cleanupJob = null;
  }
}

module.exports = {
  startHookScheduler,
  refreshHookScheduler,
  stopHookScheduler,
  registerCronJobs,
  cleanupHookRuns,
};
