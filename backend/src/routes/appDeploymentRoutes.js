const Router = require('koa-router');
const AppDeploymentController = require('../controllers/appDeploymentController');
const authWithBuiltinApiGuard = require('../middlewares/withBuiltinApiGuard');
const { operationAudit } = require('../middlewares/operationAudit');

const router = new Router({ prefix: '/api/v1/admin/app-deployment' });

/**
 * @swagger
 * /api/v1/admin/app-deployment/status:
 *   get:
 *     tags: [System]
 *     summary: 应用部署状态（DEV 模式、平台版本、bash/pnpm、脚本与默认输出目录） [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: data.devMode 为 false 时「发布平台 / 发布应用」不可用
 */
router.get('/status', authWithBuiltinApiGuard, AppDeploymentController.getStatus);

/**
 * @swagger
 * /api/v1/admin/app-deployment/app/inspect:
 *   post:
 *     tags: [System]
 *     summary: 校验业务应用目录（eadaf.app.yaml + 应用 package.json 版本） [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [appDir]
 *             properties:
 *               appDir: { type: string, description: '应用仓库根目录（含 eadaf.app.yaml）' }
 *     responses:
 *       200:
 *         description: 校验通过，返回应用名/编码/preset/版本（默认取应用 package.json，回退 eadaf.app.yaml）
 */
router.post('/app/inspect', authWithBuiltinApiGuard, AppDeploymentController.inspectApp);

/**
 * @swagger
 * /api/v1/admin/app-deployment/platform/pack:
 *   post:
 *     tags: [System]
 *     summary: 发布平台-开始打 EADAF 平台包（等价 pnpm pack:eadaf；仅 DEV 模式） [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               network: { type: string, enum: [offline, online], default: offline }
 *               runtime: { type: string, enum: [compose, k8s], default: compose }
 *               os: { type: string, enum: [centos, ubuntu, debian], default: centos }
 *               arch: { type: string, enum: [amd64, arm64], default: amd64 }
 *               kind: { type: string, enum: [install, upgrade, patch], default: install }
 *               patch: { type: array, items: { type: string, enum: [web, api] }, description: 'kind=patch 时必填' }
 *               webPort: { type: integer, default: 9527 }
 *               apiPort: { type: integer, default: 9526 }
 *               version: { type: string, description: '默认取仓库根 package.json version' }
 *               outDir: { type: string, description: '默认 <仓库>/packages/EADAF' }
 *     responses:
 *       200:
 *         description: 返回 job（用 /jobs/{id}/stream 订阅实时日志）
 *       403:
 *         description: 非 DEV 模式
 *       409:
 *         description: 已有打包任务在运行
 */
router.post(
  '/platform/pack',
  authWithBuiltinApiGuard,
  operationAudit({
    domain: 'system',
    operationType: 'EXECUTE',
    resourceType: 'system_app_deployment',
    resourceId: () => 'platform_pack',
  }),
  AppDeploymentController.startPlatformPack,
);

/**
 * @swagger
 * /api/v1/admin/app-deployment/app/pack:
 *   post:
 *     tags: [System]
 *     summary: 发布应用-开始打业务应用包（等价 pnpm pack:app；仅 DEV 模式） [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [appDir]
 *             properties:
 *               appDir: { type: string, description: '应用仓库根目录（含 eadaf.app.yaml）' }
 *               arch: { type: string, enum: [amd64, arm64], default: amd64 }
 *               kind: { type: string, enum: [install, upgrade, patch], default: install }
 *               patch: { type: array, items: { type: string, enum: [web, api] } }
 *               webPort: { type: integer }
 *               apiPort: { type: integer }
 *               version: { type: string, description: '默认取应用 package.json version' }
 *               outDir: { type: string, description: '默认 <仓库>/packages/APP' }
 *     responses:
 *       200:
 *         description: 返回 job（用 /jobs/{id}/stream 订阅实时日志）
 *       403:
 *         description: 非 DEV 模式
 *       409:
 *         description: 已有打包任务在运行
 */
router.post(
  '/app/pack',
  authWithBuiltinApiGuard,
  operationAudit({
    domain: 'system',
    operationType: 'EXECUTE',
    resourceType: 'system_app_deployment',
    resourceId: () => 'app_pack',
  }),
  AppDeploymentController.startAppPack,
);

/**
 * @swagger
 * /api/v1/admin/app-deployment/jobs:
 *   get:
 *     tags: [System]
 *     summary: 最近的应用部署（打包）任务列表 [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: data.items（新→旧，含产物目录）
 */
router.get('/jobs', authWithBuiltinApiGuard, AppDeploymentController.listJobs);

/**
 * @swagger
 * /api/v1/admin/app-deployment/jobs/{jobId}/stream:
 *   get:
 *     tags: [System]
 *     summary: 打包任务 SSE 实时日志（fromSeq 续传，刷新页面不丢输出） [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: fromSeq
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: text/event-stream，data 为 {"type":"snapshot"|"log"|"job"|"end", ...}
 */
router.get('/jobs/:jobId/stream', authWithBuiltinApiGuard, AppDeploymentController.streamJob);

/**
 * @swagger
 * /api/v1/admin/app-deployment/jobs/{jobId}/log:
 *   get:
 *     tags: [System]
 *     summary: 打包任务日志轮询接口（SSE 兜底） [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: fromSeq
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: data.job + data.lines（seq > fromSeq）
 */
router.get('/jobs/:jobId/log', authWithBuiltinApiGuard, AppDeploymentController.getJobLog);

/**
 * @swagger
 * /api/v1/admin/app-deployment/jobs/{jobId}:
 *   get:
 *     tags: [System]
 *     summary: 打包任务详情（状态/产物目录/退出码） [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: data 为任务详情
 */
router.get('/jobs/:jobId', authWithBuiltinApiGuard, AppDeploymentController.getJob);

/**
 * @swagger
 * /api/v1/admin/app-deployment/jobs/{jobId}/cancel:
 *   post:
 *     tags: [System]
 *     summary: 取消打包任务 [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: data 为任务详情
 */
router.post(
  '/jobs/:jobId/cancel',
  authWithBuiltinApiGuard,
  operationAudit({
    domain: 'system',
    operationType: 'EXECUTE',
    resourceType: 'system_app_deployment',
    resourceId: (ctx) => `cancel:${ctx.params.jobId}`,
  }),
  AppDeploymentController.cancelJob,
);

module.exports = router;
