const cron = require('node-cron');
const { Op } = require('sequelize');
const { BizdataMetric } = require('../../models');
const metricService = require('./metricService');
const metricExecutor = require('./metricExecutor');
const metricRedis = require('./metricRedis');
const logger = require('../../utils/logger');
const { reportDependencyError } = require('../../utils/dependencyDiagnostics');

const scheduledJobs = [];

function clearJobs() {
  scheduledJobs.forEach((job) => job.stop());
  scheduledJobs.length = 0;
}

function resolveCronExpression(metric) {
  if (metric.scheduleType === 'cron') {
    const expr = metric.scheduleConfig?.expression || metric.scheduleConfig?.cron;
    return expr ? String(expr).trim() : null;
  }
  if (metric.scheduleType === 'hourly') {
    return '0 * * * *';
  }
  if (metric.scheduleType === 'daily') {
    const cfg = metric.scheduleConfig || {};
    const hour = Number(cfg.hour ?? 2);
    const minute = Number(cfg.minute ?? 0);
    return `${minute} ${hour} * * *`;
  }
  return null;
}

async function runMetric(metricId, code) {
  const locked = await metricRedis.acquireRunLock(metricId);
  if (!locked) {
    logger.info('Metrics cron skipped, metric busy', { metricId, code });
    return;
  }

  try {
    await metricExecutor.execute(metricId, { triggeredBy: 'scheduler' });
  } catch (error) {
    logger.warn('Metrics cron metric failed', {
      metricId,
      code,
      message: error.message,
    });
  }
}

async function registerCronJobs() {
  clearJobs();

  const rows = await BizdataMetric.findAll({
    where: {
      status: 'enabled',
      schedule_type: { [Op.in]: ['cron', 'hourly', 'daily'] },
    },
  });

  let registered = 0;
  for (const row of rows) {
    const metric = metricService.formatMetric(row);
    const expression = resolveCronExpression(metric);
    if (!expression) continue;

    if (!cron.validate(expression)) {
      logger.warn('Metrics cron invalid expression', {
        metricId: metric.id,
        code: metric.code,
        expression,
      });
      continue;
    }

    const job = cron.schedule(expression, () => {
      runMetric(metric.id, metric.code).catch((err) => {
        logger.error('Metrics cron job error', { message: err.message, code: metric.code });
      });
    });
    scheduledJobs.push(job);
    registered += 1;
  }

  logger.info('Metrics scheduler registered', { jobs: registered });
}

async function startMetricScheduler() {
  try {
    await registerCronJobs();
  } catch (error) {
    reportDependencyError('Failed to start metrics scheduler', error);
  }
}

module.exports = {
  startMetricScheduler,
  registerCronJobs,
  resolveCronExpression,
};
