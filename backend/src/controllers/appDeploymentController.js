const { PassThrough } = require('stream');
const appDeploymentService = require('../services/appDeployment/appDeploymentService');
const packJobService = require('../services/appDeployment/packJobService');
const { formatApiError } = require('../utils/formatApiError');
const logger = require('../utils/logger');

function sendError(ctx, error) {
  const formatted = formatApiError(error);
  if (error && error.data && !formatted.data) formatted.data = error.data;
  logger.error(formatted.message, { errorType: error?.name, stack: error?.stack });
  ctx.status = formatted.status;
  ctx.body = { code: formatted.code, message: formatted.message, data: formatted.data };
}

function notFound(message) {
  return Object.assign(new Error(message), { status: 404 });
}

class AppDeploymentController {
  /** GET /status：DEV 模式、默认版本、bash/pnpm、脚本与输出目录 */
  static async getStatus(ctx) {
    try {
      ctx.body = { code: 200, message: '获取成功', data: appDeploymentService.getStatus() };
    } catch (error) {
      sendError(ctx, error);
    }
  }

  /** POST /app/inspect：校验应用目录并回读 eadaf.app.yaml + 应用 package.json 版本 */
  static async inspectApp(ctx) {
    try {
      const data = await appDeploymentService.inspectAppDir(ctx.request.body?.appDir);
      ctx.body = { code: 200, message: '校验通过', data };
    } catch (error) {
      sendError(ctx, error);
    }
  }

  /** POST /platform/pack：开始打 EADAF 平台包（等价 pnpm pack:eadaf） */
  static async startPlatformPack(ctx) {
    try {
      const job = appDeploymentService.startPlatformPack(ctx.request.body || {});
      ctx.body = { code: 200, message: '打包任务已启动', data: job };
    } catch (error) {
      sendError(ctx, error);
    }
  }

  /** POST /app/pack：开始打业务应用包（等价 pnpm pack:app） */
  static async startAppPack(ctx) {
    try {
      const job = await appDeploymentService.startAppPack(ctx.request.body || {});
      ctx.body = { code: 200, message: '打包任务已启动', data: job };
    } catch (error) {
      sendError(ctx, error);
    }
  }

  /** GET /jobs：最近的打包任务（新→旧） */
  static async listJobs(ctx) {
    try {
      ctx.body = { code: 200, message: '获取成功', data: { items: packJobService.listJobs() } };
    } catch (error) {
      sendError(ctx, error);
    }
  }

  /** GET /jobs/:jobId：单个打包任务（含产物目录） */
  static async getJob(ctx) {
    try {
      const job = packJobService.getJob(ctx.params.jobId);
      if (!job) throw notFound('打包任务不存在或已过期');
      ctx.body = { code: 200, message: '获取成功', data: job };
    } catch (error) {
      sendError(ctx, error);
    }
  }

  /** GET /jobs/:jobId/log?fromSeq=N：轮询式取日志（SSE 不可用时的兜底） */
  static async getJobLog(ctx) {
    try {
      const fromSeq = Number(ctx.query.fromSeq || 0) || 0;
      const data = packJobService.readLog(ctx.params.jobId, fromSeq);
      if (!data) throw notFound('打包任务不存在或已过期');
      ctx.body = { code: 200, message: '获取成功', data };
    } catch (error) {
      sendError(ctx, error);
    }
  }

  /** POST /jobs/:jobId/cancel：取消打包（结束整棵构建进程树） */
  static async cancelJob(ctx) {
    try {
      const job = packJobService.cancelJob(ctx.params.jobId);
      ctx.body = { code: 200, message: '已请求取消', data: job };
    } catch (error) {
      sendError(ctx, error);
    }
  }

  /**
   * GET /jobs/:jobId/stream?fromSeq=N：SSE 实时日志。
   * 事件负载统一为 `data: {"type":"snapshot"|"log"|"job"|"end", ...}`，
   * 连接时先补发 fromSeq 之后的日志，因此刷新页面不丢输出。
   */
  static async streamJob(ctx) {
    const jobId = ctx.params.jobId;
    const snapshot = packJobService.getJob(jobId);
    if (!snapshot) {
      sendError(ctx, notFound('打包任务不存在或已过期'));
      return;
    }
    const fromSeq = Number(ctx.query.fromSeq || 0) || 0;

    ctx.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    ctx.status = 200;

    // 与 AI 对话 SSE（aiServiceController）同一套写法：只设 ctx.body 为流，
    // 由 Koa 在中间件链结束后 pipe 到 res。
    // 注意：**不要**设 ctx.respond = false —— 那会让 Koa 跳过 respond()，
    // 流永远不会被 pipe，客户端只能一直等（表现为「控制台一直暂无输出」）。
    const stream = new PassThrough();
    ctx.body = stream;

    let closed = false;
    const write = (payload) => {
      if (closed) return;
      try {
        stream.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch (error) {
        logger.debug('SSE 打包日志写入失败', { jobId, message: error.message });
      }
    };

    const heartbeat = setInterval(() => {
      if (closed) return;
      try {
        stream.write(': ping\n\n');
      } catch {
        /* 客户端已断开 */
      }
    }, 15000);

    let unsubscribe = null;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
      try {
        stream.end();
      } catch {
        /* 忽略 */
      }
    };

    const history = packJobService.readLog(jobId, fromSeq);
    write({ type: 'snapshot', job: history ? history.job : snapshot, lines: history ? history.lines : [] });

    if (!history || history.job.status !== 'running') {
      write({ type: 'end', job: history ? history.job : snapshot });
      cleanup();
      return;
    }

    unsubscribe = packJobService.subscribe(jobId, (payload) => {
      write(payload);
      if (payload.type === 'end') cleanup();
    });

    ctx.req.on('close', cleanup);
    ctx.req.on('error', cleanup);
  }
}

module.exports = AppDeploymentController;
