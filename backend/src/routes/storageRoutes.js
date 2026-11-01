const os = require('os');
const path = require('path');
const Router = require('koa-router');
const fs = require('fs');
const koaBody = require('koa-body').default;
const StorageController = require('../controllers/storageController');
const auth = require('../middlewares/auth');
const authWithBuiltinApiGuard = require('../middlewares/withBuiltinApiGuard');

const { operationAudit } = require('../middlewares/operationAudit');const { authRequired, authOptional } = require('../middlewares/storageAuth');
const fileStorageSettings = require('../services/storage/fileStorageSettings');
const router = new Router({ prefix: '/api/v1/storage' });

const storageRoot = path.join(os.tmpdir(), 'eadaf-storage-upload');
if (!fs.existsSync(storageRoot)) {
  fs.mkdirSync(storageRoot, { recursive: true });
}

/**
 * 传输层只兜一个「三档里最大的」上限，具体是图片/文档/视频由
 * storageService 按类别校验——这样设置页改上限后无需重启即可生效。
 */
const formidableOptions = {
  uploadDir: storageRoot,
  keepExtensions: true,
  maxFileSize: 100 * 1024 * 1024,
};
fileStorageSettings.bindMultipartOptions(formidableOptions);

const uploadMiddleware = koaBody({
  multipart: true,
  formidable: formidableOptions,
});

/**
 * @swagger
 * /api/v1/storage/buckets:
 *   get:
 *     tags: [Storage]
 *     summary: 获取 Bucket 列表 [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: size
 *         schema: { type: integer }
 *       - in: query
 *         name: keyword
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 获取成功，data 为分页 { items, total, page, size }
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeStorageBucketList'
 *   post:
 *     tags: [Storage]
 *     summary: 创建 Bucket [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, name]
 *             properties:
 *               code: { type: string }
 *               name: { type: string }
 *               description: { type: string }
 *               applicationId: { type: string, format: uuid }
 *               accessMode: { type: string, enum: [public, authenticated] }
 *               accessRestrictions: { type: object }
 *     responses:
 *       201:
 *         description: 创建成功，data 为 StorageBucket
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeStorageBucket'
 */
router.get('/buckets', authWithBuiltinApiGuard, StorageController.listBuckets);
router.post('/buckets', authWithBuiltinApiGuard, operationAudit({
  domain: 'storage',
  operationType: 'CREATE',
  resourceType: 'bucket',
  resourceId: (ctx) => ctx.body?.data?.id,
  summaryKeys: ['name', 'code'],
}), StorageController.createBucket);

/**
 * @swagger
 * /api/v1/storage/buckets/{id}:
 *   get:
 *     tags: [Storage]
 *     summary: 获取 Bucket 详情 [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: 获取成功，data 为 StorageBucket
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeStorageBucket'
 *   put:
 *     tags: [Storage]
 *     summary: 更新 Bucket [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               applicationId: { type: string, format: uuid, nullable: true }
 *               accessMode: { type: string, enum: [public, authenticated] }
 *               accessRestrictions: { type: object }
 *               status: { type: string, enum: [ACTIVE, DISABLED] }
 *     responses:
 *       200:
 *         description: 更新成功，data 为 StorageBucket
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeStorageBucket'
 *   delete:
 *     tags: [Storage]
 *     summary: 删除 Bucket [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: 删除成功，data 为 null
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeNull'
 */
router.get('/buckets/:id', authWithBuiltinApiGuard, StorageController.getBucket);
router.put('/buckets/:id', authWithBuiltinApiGuard, operationAudit({
  domain: 'storage',
  operationType: 'UPDATE',
  resourceType: 'bucket',
  resourceId: (ctx) => ctx.params.id,
  summaryKeys: ['name', 'code'],
}), StorageController.updateBucket);
router.delete('/buckets/:id', authWithBuiltinApiGuard, operationAudit({
  domain: 'storage',
  operationType: 'DELETE',
  resourceType: 'bucket',
  resourceId: (ctx) => ctx.params.id,
}), StorageController.deleteBucket);

/**
 * @swagger
 * /api/v1/storage/objects:
 *   get:
 *     tags: [Storage]
 *     summary: 文件浏览器列表 [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: size
 *         schema: { type: integer }
 *       - in: query
 *         name: keyword
 *         schema: { type: string }
 *       - in: query
 *         name: bucketId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: applicationId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: mimeType
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 获取成功，data 为分页文件列表
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeStorageObjectList'
 */
router.get('/objects', authWithBuiltinApiGuard, StorageController.listObjects);

/**
 * @swagger
 * /api/v1/storage/objects/upload:
 *   post:
 *     tags: [Storage]
 *     summary: 上传文件到 Bucket [需要认证，支持用户或应用 JWT]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, bucketCode]
 *             properties:
 *               file: { type: string, format: binary }
 *               bucketCode: { type: string }
 *               applicationId: { type: string, format: uuid }
 *     responses:
 *       201:
 *         description: 上传成功，data 为 StorageObject
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeStorageObject'
 */
router.post('/objects/upload', authRequired, uploadMiddleware, StorageController.uploadObject);

/**
 * @swagger
 * /api/v1/storage/objects/dedup-check:
 *   post:
 *     tags: [Storage]
 *     summary: 按 Bucket + MD5 预检重复文件 [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bucketCode, md5]
 *             properties:
 *               bucketCode: { type: string }
 *               md5: { type: string, description: 32 位 hex }
 *     responses:
 *       200:
 *         description: 查询成功，duplicate=true 时 data.object 为已有文件
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeStorageDedup'
 */
router.post('/objects/dedup-check', authRequired, StorageController.dedupCheck);

/**
 * @swagger
 * /api/v1/storage/tus:
 *   options:
 *     tags: [Storage]
 *     summary: tus 能力发现（Tus-Resumable / Tus-Max-Size）
 *     responses:
 *       204:
 *         description: 返回 tus 扩展头（Tus-Resumable / Tus-Version / Tus-Max-Size / Tus-Extension）
 *         headers:
 *           Tus-Resumable:
 *             schema: { type: string, example: '1.0.0' }
 *           Tus-Max-Size:
 *             schema: { type: integer }
 *   post:
 *     tags: [Storage]
 *     summary: 创建 tus 上传会话（超大文件断点续传）[需要认证]
 *     description: |
 *       tus 1.0 协议。Upload-Metadata 必填 bucketCode、filename；可选 contentType、md5、applicationId。
 *       PATCH 先写入临时目录，完成后对象进入 MinIO，再 GET /tus/{id}/result 取 StorageObject。
 *       轻量接口 POST /objects/upload 上限 100MB；本通道可传小文件，上限见 Tus-Max-Size（默认 5GB）。
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: header
 *         name: Tus-Resumable
 *         required: true
 *         schema: { type: string, example: '1.0.0' }
 *       - in: header
 *         name: Upload-Length
 *         required: true
 *         schema: { type: integer }
 *       - in: header
 *         name: Upload-Metadata
 *         schema: { type: string }
 *     responses:
 *       201:
 *         description: 已创建，Location 为会话 URL；无 JSON body
 *         headers:
 *           Location:
 *             schema: { type: string }
 *             description: tus 会话 URL，如 /api/v1/storage/tus/{id}
 *           Tus-Resumable:
 *             schema: { type: string, example: '1.0.0' }
 *           Upload-Offset:
 *             schema: { type: integer, example: 0 }
 *
 * /api/v1/storage/tus/{id}:
 *   head:
 *     tags: [Storage]
 *     summary: 查询 tus 已上传 offset（续传）[需要认证]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Upload-Offset 为已写入字节；无 JSON body
 *         headers:
 *           Upload-Offset:
 *             schema: { type: integer }
 *           Tus-Resumable:
 *             schema: { type: string, example: '1.0.0' }
 *   patch:
 *     tags: [Storage]
 *     summary: 向 tus 会话追加数据（流式写盘）[需要认证]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: header
 *         name: Upload-Offset
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/offset+octet-stream:
 *           schema: { type: string, format: binary }
 *     responses:
 *       204:
 *         description: 追加成功；Upload-Offset 为新偏移
 *         headers:
 *           Upload-Offset:
 *             schema: { type: integer }
 *   delete:
 *     tags: [Storage]
 *     summary: 终止未完成的 tus 上传 [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: 已终止
 *
 * /api/v1/storage/tus/{id}/result:
 *   get:
 *     tags: [Storage]
 *     summary: 查询 tus 完成后的 StorageObject（可轮询）[需要认证]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: completed / duplicate，data.object 为文件记录
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeStorageTusResult'
 *       202:
 *         description: uploading / pending_finalize / finalizing，data 含 offset
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeStorageTusResult'
 */
router.get('/tus/:id/result', authRequired, StorageController.getTusResult);

/**
 * @swagger
 * /api/v1/storage/objects/{id}:
 *   delete:
 *     tags: [Storage]
 *     summary: 删除文件 [需要认证]
 *     description: 删除文件记录，并同步删除 MinIO 中的原文件及对应图片裁剪缓存。
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: 文件资源 ID（storage_objects.object_id）
 *     responses:
 *       200:
 *         description: 删除成功，data 为 null
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeNull'
 *       404:
 *         description: 文件不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeError'
 */
router.delete('/objects/:id', authWithBuiltinApiGuard, operationAudit({
  domain: 'storage',
  operationType: 'DELETE',
  resourceType: 'object',
  resourceId: (ctx) => ctx.params.id,
}), StorageController.deleteObject);

/**
 * @swagger
 * /api/v1/storage/objects/{id}/download:
 *   get:
 *     tags: [Storage]
 *     summary: 下载文件（按 Bucket 访问策略鉴权，公开桶可匿名）
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: 原始文件流（非 JSON 外壳）
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *         headers:
 *           Content-Type:
 *             schema: { type: string }
 *           Content-Disposition:
 *             schema: { type: string }
 *             description: attachment; filename=...
 */
router.get('/objects/:id/download', authOptional, StorageController.downloadObject);

/**
 * @swagger
 * /api/v1/storage/objects/{id}/preview:
 *   get:
 *     tags: [Storage]
 *     summary: 预览文件（图片 inline，按 Bucket 访问策略鉴权）
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: 预览文件流（图片 inline，非 JSON 外壳）
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *         headers:
 *           Content-Type:
 *             schema: { type: string }
 *           Content-Disposition:
 *             schema: { type: string, example: 'inline' }
 */
router.get('/objects/:id/preview', authOptional, StorageController.previewObject);

/**
 * @swagger
 * /api/v1/storage/objects/{id}/crop:
 *   get:
 *     tags: [Storage]
 *     summary: 图片自动裁剪（按 w/h/fit 缩放并缓存，返回 webp）
 *     description: |
 *       传入文件资源 ID 与裁剪参数，服务端使用 sharp 生成 webp 并写入 MinIO 缓存。
 *       鉴权与 preview 相同：公开 Bucket 可匿名访问。
 *       两种用法：
 *       1) 同时指定 w、h：fit=cover 覆盖裁剪到精确尺寸；fit=contain（默认）按原图比例缩放到框内（不留白，输出未必等于 w×h）。
 *       2) 只指定 w 或 h：按原图比例自动计算另一边（忽略 fit）。
 *       w/h 均未传时默认 w=480；取值范围 1–4096。
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: 文件资源 ID（storage_objects.object_id）
 *       - in: query
 *         name: w
 *         schema: { type: integer, minimum: 1, maximum: 4096 }
 *         description: 目标宽度（像素）；与 h 均未传时默认 480
 *       - in: query
 *         name: h
 *         schema: { type: integer, minimum: 1, maximum: 4096 }
 *         description: 目标高度（像素）
 *       - in: query
 *         name: fit
 *         schema:
 *           type: string
 *           enum: [cover, contain]
 *           default: contain
 *         description: |
 *           仅同时指定 w、h 时生效。cover=覆盖裁剪；contain=按比例适配框内（不留白）。
 *           只传一侧尺寸时忽略本参数。
 *     responses:
 *       200:
 *         description: 裁剪后的 webp 图片流（非 JSON 外壳）
 *         content:
 *           image/webp:
 *             schema:
 *               type: string
 *               format: binary
 *         headers:
 *           Content-Type:
 *             schema: { type: string, example: image/webp }
 *           Content-Disposition:
 *             schema: { type: string, example: 'inline; filename="photo.webp"' }
 *           Cache-Control:
 *             schema: { type: string, example: 'public, max-age=31536000, immutable' }
 *       400:
 *         description: 非图片或参数非法
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeError'
 *       403:
 *         description: 无权访问
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeError'
 *       404:
 *         description: 文件不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeError'
 */
router.get('/objects/:id/crop', authOptional, StorageController.cropObject);

module.exports = router;
