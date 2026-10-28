const Router = require('koa-router');
const koaBody = require('koa-body').default;
const os = require('os');
const path = require('path');
const fs = require('fs');
const SystemController = require('../controllers/systemController');
const auth = require('../middlewares/auth');
const authWithBuiltinApiGuard = require('../middlewares/withBuiltinApiGuard');

const { operationAudit } = require('../middlewares/operationAudit');
const router = new Router({ prefix: '/api/v1/system' });

// 恢复备份的文件上传中间件：.dump 格式、单文件、上限 1GB，落在系统临时目录
const restoreUploadDir = path.join(os.tmpdir(), 'eadaf-db-restore');
if (!fs.existsSync(restoreUploadDir)) {
  fs.mkdirSync(restoreUploadDir, { recursive: true });
}
const restoreUploadMiddleware = koaBody({
  multipart: true,
  formidable: {
    uploadDir: restoreUploadDir,
    keepExtensions: true,
    maxFileSize: 1024 * 1024 * 1024,
    filter: ({ originalFilename }) => {
      const name = String(originalFilename || '').toLowerCase();
      return name.endsWith('.dump');
    },
  },
});

/**
 * @swagger
 * /api/v1/system/features:
 *   get:
 *     tags: [System]
 *     summary: 获取系统功能开关 [需要认证]
 *     description: 返回功能开关。data.version 为当前平台版本（仓库根 package.json），只读，不随 PUT 写入。
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 获取成功，data 为系统功能开关；含只读字段 version（当前平台版本）
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeSystemFeatures'
 *   put:
 *     tags: [System]
 *     summary: 更新系统功能开关 [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               metadataEnabled: { type: boolean }
 *               apiServiceAllowWriteOperations: { type: boolean, description: 'API 测试中是否允许执行写操作（仅测试页，含自定义 SQL）' }
 *               apiServiceTestAutoRollback: { type: boolean, description: 'API 测试中写操作是否自动回滚（仅测试页；false 时测试数据落库）' }
 *               autoBackupEnabled: { type: boolean, description: '是否启用自动备份' }
 *               autoBackupCron: { type: string, description: '自动备份 cron，如 0 2 * * *' }
 *               backupDir: { type: string, description: '数据库备份目录（绝对路径，保存前会创建并验证可写；传空串恢复默认目录）' }
 *     responses:
 *       200:
 *         description: 更新成功，data 为更新后的功能开关
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeSystemFeatures'
 */
// 运行时可配（公开只读：前端启动时读取，用于同一产物跨环境部署）
router.get('/runtime-config', SystemController.getRuntimeConfig);

router.get('/features', authWithBuiltinApiGuard, SystemController.getFeatures);
router.put('/features', authWithBuiltinApiGuard, operationAudit({
  domain: 'system',
  operationType: 'UPDATE',
  resourceType: 'system_features',
  resourceId: () => 'features',
  summaryKeys: ['features'],
}), SystemController.updateFeatures);

/**
 * @swagger
 * /api/v1/system/backups:
 *   get:
 *     tags: [System]
 *     summary: 获取数据库备份文件列表 [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 获取成功，data.backupDir 与 data.items[]（name/path/size/createdAt）
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeSystemBackupList'
 */
router.get('/backups', authWithBuiltinApiGuard, SystemController.listBackups);

/**
 * @swagger
 * /api/v1/system/backups/run:
 *   post:
 *     tags: [System]
 *     summary: 立即执行数据库备份 [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 备份已触发，data.latestBackup 为最新 dump 文件
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeSystemBackupRun'
 */
router.post('/backups/run', authWithBuiltinApiGuard, operationAudit({
  domain: 'system',
  operationType: 'EXECUTE',
  resourceType: 'system_backup',
  resourceId: () => 'run',
}), SystemController.runBackup);

/**
 * @swagger
 * /api/v1/system/backups/restore:
 *   post:
 *     tags: [System]
 *     summary: 上传 .dump 备份文件并恢复数据库（覆盖现有数据，高危操作） [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary, description: '.dump 备份文件' }
 *     responses:
 *       200:
 *         description: 恢复完成，data 含 stdout/stderr
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeSystemBackupRestore'
 */
router.post(
  '/backups/restore',
  authWithBuiltinApiGuard,
  operationAudit({
    domain: 'system',
    operationType: 'EXECUTE',
    resourceType: 'system_backup',
    resourceId: () => 'restore',
  }),
  restoreUploadMiddleware,
  SystemController.restoreBackup,
);

module.exports = router;
