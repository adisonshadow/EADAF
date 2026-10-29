const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const helmet = require('helmet');
const config = require('./config');
const logger = require('./utils/logger');
const errorHandler = require('./middlewares/errorHandler');
const traceId = require('./middlewares/traceId');
const routes = require('./routes');
const { koaSwagger } = require('koa2-swagger-ui');
const swaggerJSDoc = require('swagger-jsdoc');
const healthRoutes = require('./routes/healthRoutes');
const collectionIngestRoutes = require('./routes/collectionIngestRoutes');
const { createTusKoaMiddleware } = require('./services/storage/tusKoaMiddleware');
const { TUS_EXPOSE_HEADERS } = require('./services/storage/tusServer');
const {
  probeDependencies,
  printStartupReport,
  reportDependencyError,
} = require('./utils/dependencyDiagnostics');

// Swagger 配置
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'EADAF Platform API Documentation',
    version: '1.0.0',
    description: '用户认证和授权系统 API 文档',
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: '开发服务器',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  security: [
    {
      bearerAuth: [],
    },
  ],
};

const options = {
  swaggerDefinition,
  apis: ['./src/routes/*.js'], // API 路由文件的路径
};

// 生成 Swagger 文档
let swaggerSpec;
try {
  swaggerSpec = swaggerJSDoc(options);
  logger.info('✅ Successfully generated Swagger document');
} catch (error) {
  logger.error('❌ Failed to generate Swagger document', { error: error.message });
  process.exit(1);
}

// 创建应用实例
const app = new Koa();

// 错误处理中间件（放在最前面）
app.use(errorHandler);
app.use(traceId);

// HTTP 安全头（Swagger UI 依赖 CDN 脚本 + 内联初始化，需放宽 CSP）
app.use(async (ctx, next) => {
  const isSwagger = ctx.path === '/swagger' || ctx.path.startsWith('/swagger/');
  await new Promise((resolve, reject) => {
    helmet({
      // 管理端与 API 常分端口 / 分域名，避免 CORP 拦住图片预览、tus 等跨源资源
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: isSwagger
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: [
                "'self'",
                "'unsafe-inline'",
                'https://cdnjs.cloudflare.com',
              ],
              styleSrc: [
                "'self'",
                "'unsafe-inline'",
                'https:',
                'https://cdnjs.cloudflare.com',
                'https://fonts.googleapis.com',
              ],
              fontSrc: ["'self'", 'https:', 'data:', 'https://fonts.gstatic.com'],
              imgSrc: ["'self'", 'data:', 'https:'],
              connectSrc: ["'self'"],
            },
          }
        : undefined,
    })(ctx.req, ctx.res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  await next();
});

// 中间件配置
function isIpOrLocalHostname(hostname) {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '::1') return true;
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(h);
}

function resolveCorsOrigin(ctx) {
  const requestOrigin = ctx.get('Origin');
  const allowed = config.api.cors.origin || [];
  const allowAll = !allowed.length || allowed.includes('*');
  if (allowAll) {
    return requestOrigin || '*';
  }
  if (requestOrigin && allowed.includes(requestOrigin)) {
    return requestOrigin;
  }
  // 白名单未写 * 时：仍放行 IP / localhost（局域网或公网 IP 直连）
  if (requestOrigin) {
    try {
      const host = new URL(requestOrigin).hostname;
      if (isIpOrLocalHostname(host)) return requestOrigin;
    } catch {
      return false;
    }
  }
  return false;
}

app.use(cors({
  origin: resolveCorsOrigin,
  credentials: true,
  allowMethods: config.api.cors.methods.length
    ? config.api.cors.methods
    : ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: config.api.cors.allowedHeaders,
  exposeHeaders: TUS_EXPOSE_HEADERS,
  maxAge: config.api.cors.maxAge,
  // Chrome 从公网站点访问局域网 HTTP API 时的 Private Network Access 预检
  privateNetworkAccess: true,
}));

// 采集 API 须在 bodyParser 之前注册，以保留原始 body
app.use(collectionIngestRoutes.routes());
app.use(collectionIngestRoutes.allowedMethods({ throw: true }));

// tus 须在 bodyParser 之前，PATCH 体直接流式写盘
app.use(createTusKoaMiddleware());

app.use(bodyParser());

// Swagger UI 配置
try {
  app.use(
    koaSwagger({
      routePrefix: '/swagger',
      swaggerOptions: {
        url: '/swagger.json',
      },
    }),
  );
  logger.info('✅ Successfully configured Swagger UI');
} catch (error) {
  logger.error('❌ Failed to configure Swagger UI', { error: error.message });
  process.exit(1);
}

// 添加 OpenAPI JSON 路由
app.use(async (ctx, next) => {
  if (ctx.path === '/swagger.json') {
    ctx.type = 'application/json';
    ctx.body = {
      ...swaggerSpec,
      servers: [
        {
          url: `${ctx.protocol}://${ctx.host}`,
          description: '当前访问地址',
        },
      ],
    };
    return;
  }
  await next();
});

// 头像菜单每 30 秒轮询系统健康。成功请求不写访问日志，避免 app-*.log 被这条请求写满。
const QUIET_REQUEST_LOG_PATHS = new Set(['/api/v1/admin/system-health']);

// 添加请求日志
app.use(async (ctx, next) => {
  const start = Date.now();
  try {
    await next();
    if (QUIET_REQUEST_LOG_PATHS.has(ctx.path)) return;
    const ms = Date.now() - start;
    logger.info('Request completed', {
      method: ctx.method,
      url: ctx.url,
      status: ctx.status,
      duration: `${ms}ms`
    });
  } catch (error) {
    const ms = Date.now() - start;
    logger.error('Request error', {
      method: ctx.method,
      url: ctx.url,
      status: ctx.status,
      duration: `${ms}ms`,
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
});

// 路由配置（throw: true → 405/501 进入 errorHandler，返回 JSON 信封而非纯文本）
app.use(routes.routes());
app.use(routes.allowedMethods({ throw: true }));

// 注册路由
app.use(healthRoutes.routes());

// 检查服务器是否已启动
let server = null;

// 如果不是测试环境，则启动服务器
function listLanIPv4() {
  const os = require('os');
  const ips = [];
  const nets = os.networkInterfaces();
  Object.values(nets).forEach((list) => {
    (list || []).forEach((net) => {
      const family = net.family === 4 || net.family === 'IPv4';
      if (family && !net.internal) ips.push(net.address);
    });
  });
  return ips;
}

/**
 * 启动自检：先把「运行环境 / env / 依赖连接 / 库结构 / 系统桶」一次说清，再监听端口。
 * 任何一项不通过都不阻塞启动（行为与原来的依赖自检一致），但结论要准：
 * 连接失败说连接，表/schema 缺失说结构，不要互相冒充。
 */
async function bootstrap() {
  const dependencies = await probeDependencies();

  // 表清单与系统桶都以模型为准，先注册模型，再跑自检
  require('./models');

  // 库结构自愈：模型有、库里缺的列自动补上（只加不删）。
  // 这类漂移一旦发生，整张表相关的接口会一起 500（如 AI 请求日志缺 turn_id），
  // 所以不等使用者去手工执行迁移脚本；失败只告警，不影响启动。
  const postgres = dependencies.find((dep) => dep.key === 'postgres');
  if (postgres && postgres.reachable) {
    try {
      const { alignSchema } = require('./utils/schemaAlignment');
      await alignSchema({ modelsMap: require('./models') });
    } catch (error) {
      logger.warn('库结构自愈失败（服务继续启动）', { error: error.message });
    }
  }

  const { runStartupChecks } = require('./utils/startupSelfCheck');
  const checks = await runStartupChecks({ dependencies });
  printStartupReport(dependencies, { extra: checks });

  if (postgres && postgres.reachable) {
    try {
      const { applyStoredLogRotation } = require('./services/system/systemService');
      await applyStoredLogRotation();
    } catch (error) {
      logger.warn('日志滚动配置未应用（继续使用环境变量默认值）', { error: error.message });
    }
  }

  // 系统内置 Storage Bucket 已在自检里确保（失败会作为自检项报出来）
  const { ensureBucket } = require('./services/storage/objectStore');
  ensureBucket().catch((error) => {
    reportDependencyError('初始化 MinIO 存储桶失败', error, { fallbackKey: 'minio' });
  });

  const PORT = config.api.port || 3000;
  const HOST = config.api.host || '0.0.0.0';
  server = app.listen(PORT, HOST, () => {
    logger.info(`🚀 ✅✅✅✅ API Server started on ${HOST}:${PORT}`);
    logger.info(`📊 Environment: ${process.env.NODE_ENV}`);
    logger.info(`🔗 Health check: http://127.0.0.1:${PORT}/api/v1/health`);
    listLanIPv4().forEach((ip) => {
      logger.info(`🌐 LAN/WAN: http://${ip}:${PORT}/api/v1/health`);
    });
    logger.info(`📚 Swagger UI: http://127.0.0.1:${PORT}/swagger`);
    logger.info(`📄 Swagger JSON: http://127.0.0.1:${PORT}/swagger.json`);

    const { connectRedis } = require('./utils/redisClient');
    const { startMetricScheduler } = require('./services/metrics/metricScheduler');
    const { startAutoBackupScheduler } = require('./services/system/autoBackupScheduler');
    const { startTusCleanupScheduler } = require('./services/storage/tusCleanupScheduler');
    const { recoverPendingFinalizes } = require('./services/storage/finalizeTusUpload');
    const { attachApiServiceWebSocket } = require('./services/apiService/apiServiceWebSocket');
    const { startHookScheduler } = require('./services/automation/hookScheduler');
    attachApiServiceWebSocket(server);
    startAutoBackupScheduler();
    startTusCleanupScheduler();
    recoverPendingFinalizes().catch((error) => {
      reportDependencyError('tus finalize 启动回收推迟', error);
    });
    connectRedis()
      .then(() => {
        startMetricScheduler();
        startHookScheduler();
      })
      .catch((error) => {
        logger.warn('Metrics module init deferred', { message: error.message });
        startMetricScheduler();
        startHookScheduler();
      });
  });

  server.on('error', (error) => {
    logger.error('❌ Server error', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    process.exit(1);
  });
}

if (process.env.NODE_ENV !== 'test') {
  bootstrap().catch((error) => {
    logger.error('服务器启动失败', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  });
} else {
  // 在测试环境中，创建一个服务器实例并导出
  const PORT = config.api.port || 3000;
  const HOST = config.api.host || '0.0.0.0';
  try {
    server = app.listen(PORT, HOST);
    if (!server) {
      logger.error('❌ Failed to start server');
      process.exit(1);
    }
  } catch (error) {
    logger.error('❌ Failed to start server', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
  server.on('error', (error) => {
    logger.error('❌ Server error', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    process.exit(1);
  });
}

// 添加错误处理（server.on('error') 在各启动分支里紧贴 app.listen 注册）

// 添加未捕获的异常处理
process.on('uncaughtException', (error) => {
  logger.error('❌ Uncaught exception', {
    name: error.name,
    message: error.message,
    stack: error.stack
  });
  process.exit(1);
});

// 添加未处理的 Promise 拒绝处理
process.on('unhandledRejection', (reason, promise) => {
  logger.error('❌ Unhandled promise rejection', {
    reason: reason,
    promise: promise
  });
  process.exit(1);
});

module.exports = app;