const Router = require('koa-router');
const koaBody = require('koa-body').default;
const os = require('os');
const path = require('path');
const fs = require('fs');
const PlatformTransferController = require('../controllers/platformTransferController');
const authWithBuiltinApiGuard = require('../middlewares/withBuiltinApiGuard');
const { operationAudit } = require('../middlewares/operationAudit');
const { isTransferUploadName } = require('../services/appTransfer/transferZip');

const router = new Router({ prefix: '/api/v1/system/platform-transfer' });

const uploadDir = path.join(os.tmpdir(), 'eadaf-platform-transfer');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const MAX_TRANSFER_UPLOAD = 5 * 1024 * 1024 * 1024;
const uploadMiddleware = koaBody({
  multipart: true,
  formidable: {
    uploadDir,
    keepExtensions: true,
    maxFileSize: MAX_TRANSFER_UPLOAD,
    filter: ({ originalFilename }) => isTransferUploadName(originalFilename),
  },
});

/**
 * @swagger
 * /api/v1/system/platform-transfer/export:
 *   post:
 *     tags: [System]
 *     summary: 导出 EADAF 平台 zip 包(Skill/Tool、AI 目录、数据标准、系统开关、UAC 权限目录;可选桶和文件;含明文密钥,高危) [需要认证]
 *     description: 不含业务实体/API/行数据/用户。内置应用 EADAF 的平台能力跨实例同步,与应用数据导出/导入分开。勾选 includeFiles 时携带 EADAF/系统桶及其对象,不含业务应用桶。
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               includeFiles: { type: boolean, default: false, description: '是否导出 EADAF / 系统桶及其对象文件(不含业务应用桶)' }
 *     responses:
 *       200:
 *         description: 返回 eadaf-platform-export zip 附件(Content-Disposition;body 为 octet-stream)
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *               description: zip 包,内含 manifest.json / payload.json,勾选 includeFiles 时另含 files/
 *       400:
 *         description: 导出失败
 */
router.post('/export', authWithBuiltinApiGuard, operationAudit({
  domain: 'system',
  operationType: 'EXPORT',
  resourceType: 'system_platform_transfer',
  resourceId: () => 'export',
}), PlatformTransferController.exportPlatform);

/**
 * @swagger
 * /api/v1/system/platform-transfer/preview:
 *   post:
 *     tags: [System]
 *     summary: 预览 EADAF 平台导出包(节条数/冲突,不写数据) [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary, description: 'eadaf-platform-export .zip 包(仍接受旧版单 .json)' }
 *     responses:
 *       200:
 *         description: 预览摘要
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopePlatformTransferPreview'
 *       400:
 *         description: 文件格式不正确 / 误传应用导出文件
 */
router.post('/preview', authWithBuiltinApiGuard, operationAudit({
  domain: 'system',
  operationType: 'READ',
  resourceType: 'system_platform_transfer',
  resourceId: () => 'preview',
}), uploadMiddleware, PlatformTransferController.previewImport);

/**
 * @swagger
 * /api/v1/system/platform-transfer/import:
 *   post:
 *     tags: [System]
 *     summary: 按策略导入 EADAF 平台导出包(写操作,不可自动撤销;各节失败互不硬终止) [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary, description: 'eadaf-platform-export .zip 包(仍接受旧版单 .json)' }
 *               strategy: { type: string, enum: [overwrite, skip, abort], default: overwrite, description: '冲突策略:覆盖更新 / 跳过已存在 / 有冲突即中止(不写任何数据)' }
 *     responses:
 *       200:
 *         description: 导入结果(分节计数/errors/notes)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopePlatformTransferImport'
 *       400:
 *         description: 文件或策略不合法 / 误传应用导出文件
 */
router.post('/import', authWithBuiltinApiGuard, operationAudit({
  domain: 'system',
  operationType: 'IMPORT',
  resourceType: 'system_platform_transfer',
  resourceId: () => 'import',
}), uploadMiddleware, PlatformTransferController.importPlatform);

module.exports = router;
