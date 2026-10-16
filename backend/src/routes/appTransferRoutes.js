const Router = require('koa-router');
const koaBody = require('koa-body').default;
const os = require('os');
const path = require('path');
const fs = require('fs');
const AppTransferController = require('../controllers/appTransferController');
const authWithBuiltinApiGuard = require('../middlewares/withBuiltinApiGuard');
const { operationAudit } = require('../middlewares/operationAudit');
const { isTransferUploadName } = require('../services/appTransfer/transferZip');

const router = new Router({ prefix: '/api/v1/system/app-transfer' });

const uploadDir = path.join(os.tmpdir(), 'eadaf-app-transfer');
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
 * /api/v1/system/app-transfer/export:
 *   post:
 *     tags: [System]
 *     summary: 按应用导出 zip 迁移包(manifest.json + payload.json + 可选 files/,含明文密钥,高危)。实体/管道/指标优先 bizdata_scope_codes,为空时回退 api_data_scope.domainCodes [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [applicationId]
 *             properties:
 *               applicationId: { type: string, format: uuid, description: '应用 ID(内置应用 EADAF 拒绝导出)' }
 *               dataMode: { type: string, enum: [structure_and_data, data_only], default: structure_and_data, description: 'data_only 时导入端不落结构,仅对目标已有同版本实体写数' }
 *               includeEadaf: { type: boolean, default: false, description: '是否携带用户/部门/授权等 EADAF 数据(不勾选仅携带被引用的角色与权限,含存储桶 access_restrictions.role_ids)' }
 *               includeFiles: { type: boolean, default: false, description: '是否携带存储对象文件(该应用桶内对象 + 归属本应用的对象,以及这些对象引用的共享桶如 fpcu;不勾选仅桶元数据)' }
 *               safeMode: { type: boolean, default: false, description: '写入导出包的安全模式标记(供预览)。导入默认开启安全模式退回已发布;导入请求可传 safeMode 覆盖' }
 *     responses:
 *       200:
 *         description: 返回 eadaf-app-export zip 附件(Content-Disposition;body 为 octet-stream)
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *               description: zip 包,内含 manifest.json / payload.json,勾选 includeFiles 时另含 files/
 *       400:
 *         description: 参数错误 / EADAF 拒绝导出
 */
router.post('/export', authWithBuiltinApiGuard, operationAudit({
  domain: 'system',
  operationType: 'EXPORT',
  resourceType: 'system_app_transfer',
  resourceId: () => 'export',
}), AppTransferController.exportApp);

/**
 * @swagger
 * /api/v1/system/app-transfer/preview:
 *   post:
 *     tags: [System]
 *     summary: 预览应用导出包(节条数/冲突/连接匹配与将创建/物化库表摘要/缺失引用/文件计数,不写数据) [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary, description: 'eadaf-app-export .zip 包(仍接受旧版单 .json)' }
 *     responses:
 *       200:
 *         description: 预览摘要
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeAppTransferPreview'
 *       400:
 *         description: 文件格式不正确 / EADAF 拒绝导入 / 误传平台导出文件
 */
router.post('/preview', authWithBuiltinApiGuard, operationAudit({
  domain: 'system',
  operationType: 'READ',
  resourceType: 'system_app_transfer',
  resourceId: () => 'preview',
}), uploadMiddleware, AppTransferController.previewImport);

/**
 * @swagger
 * /api/v1/system/app-transfer/import:
 *   post:
 *     tags: [System]
 *     summary: 按策略导入应用导出包(写操作,不可自动撤销;连接未匹配时用目标凭证创建本地连接;物化 run.created_by 记操作者 UUID) [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary, description: 'eadaf-app-export .zip 包(仍接受旧版单 .json)' }
 *               strategy: { type: string, enum: [overwrite, skip, abort], default: overwrite, description: '冲突策略:覆盖更新 / 跳过已存在 / 有冲突即中止(不写任何数据)' }
 *               safeMode: { type: boolean, default: true, description: '安全模式。默认开启:覆盖导入把已发布 API/采集管道/出站 Webhook 退回未发布。显式 false 才保持源发布状态(可覆盖包内标记)' }
 *     responses:
 *       200:
 *         description: 导入结果(分节计数/errors/notes)。新建应用保持源 application_id;仅 overwrite 且目标同 code 但 ID 不同时才对齐为源 ID,skip 沿用目标 ID。默认安全模式退回已发布 API/管道/Webhook,导入请求 safeMode=false 可保持发布。行数据 json/jsonb 列会先序列化再写入。钩子 action_config.apiServiceId / event_filter.apiServiceIds 与存储桶 access_restrictions.role_ids 按 idMap 改写(未映射完时不落空过滤/空角色以免放宽访问)。物化与行数据失败不终止后续 API 等元数据节;源行含空值时会放开目标列 NOT NULL 再写入,避免整表回滚;对象引用的桶在目标不存在时会按 code 自动创建(public)。未勾选 includeEadaf / includeFiles 写入 notes 而非 errors。不含平台 AI 目录/全局 Skill
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeAppTransferImport'
 *       400:
 *         description: 文件或策略不合法
 */
router.post('/import', authWithBuiltinApiGuard, operationAudit({
  domain: 'system',
  operationType: 'IMPORT',
  resourceType: 'system_app_transfer',
  resourceId: () => 'import',
}), uploadMiddleware, AppTransferController.importApp);

module.exports = router;
