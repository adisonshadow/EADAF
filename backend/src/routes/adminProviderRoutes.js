const Router = require('koa-router');
const ProviderController = require('../controllers/providerController');
const auth = require('../middlewares/auth');
const authWithBuiltinApiGuard = require('../middlewares/withBuiltinApiGuard');

const { operationAudit } = require('../middlewares/operationAudit');
const router = new Router({
  prefix: '/api/v1/admin/providers'
});

/**
 * @swagger
 * components:
 *   schemas:
 *     AdminProvider:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *           example: DeepSeek
 *         slug:
 *           type: string
 *           example: deepseek
 *         baseUrl:
 *           type: string
 *           example: https://api.deepseek.com
 *         apiKeySet:
 *           type: boolean
 *           example: true
 *           description: 数据库中是否已配置 API Key（browser 模式恒为 false）
 *         apiKeyStorage:
 *           type: string
 *           enum: [database, browser]
 *           example: database
 *           description: API Key 存放位置。browser 时密钥不写入数据库
 *         adapterType:
 *           type: string
 *           example: openai_compatible
 *         isActive:
 *           type: boolean
 *           example: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/v1/admin/providers:
 *   get:
 *     tags:
 *       - Admin-Providers
 *     summary: 获取服务商列表 [需要认证]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: size
 *         schema:
 *           type: integer
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: 获取成功，data 为分页 { items, total, page, size }
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeAdminProviderList'
 *   post:
 *     tags:
 *       - Admin-Providers
 *     summary: 创建服务商 [需要认证]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, baseUrl]
 *             properties:
 *               name:
 *                 type: string
 *               slug:
 *                 type: string
 *               baseUrl:
 *                 type: string
 *               apiKey:
 *                 type: string
 *                 description: apiKeyStorage=browser 时忽略，不会入库
 *               apiKeyStorage:
 *                 type: string
 *                 enum: [database, browser]
 *                 description: browser 表示只由浏览器保存 API Key，服务端不落库。需系统设置允许
 *               adapterType:
 *                 type: string
 *                 example: openai_compatible
 *     responses:
 *       200:
 *         description: 创建成功，data 为 AdminProvider（不含明文 apiKey）
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeAdminProvider'
 */
router.get('/', authWithBuiltinApiGuard, ProviderController.list);
router.post('/', authWithBuiltinApiGuard, operationAudit({
  domain: 'ai',
  operationType: 'CREATE',
  resourceType: 'ai_provider',
  resourceId: (ctx) => ctx.body?.data?.id,
  summaryKeys: ['name', 'code', 'baseUrl'],
}), ProviderController.create);

/**
 * @swagger
 * /api/v1/admin/providers/{id}:
 *   get:
 *     tags:
 *       - Admin-Providers
 *     summary: 获取服务商详情 [需要认证]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: 获取成功，data 为 AdminProvider
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeAdminProvider'
 *   patch:
 *     tags:
 *       - Admin-Providers
 *     summary: 更新服务商 [需要认证]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               slug:
 *                 type: string
 *               baseUrl:
 *                 type: string
 *               apiKey:
 *                 type: string
 *                 description: apiKeyStorage=browser 时忽略，不会入库
 *               apiKeyStorage:
 *                 type: string
 *                 enum: [database, browser]
 *                 description: 改为 browser 时清空库中的密钥；改回 database 时用本次 apiKey 写入
 *               adapterType:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: 更新成功，data 为 AdminProvider
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeAdminProvider'
 *   delete:
 *     tags:
 *       - Admin-Providers
 *     summary: 删除服务商（软删除） [需要认证]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: 删除成功，data 为 null
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeNull'
 */
router.get('/:id', authWithBuiltinApiGuard, ProviderController.getById);
router.patch('/:id', authWithBuiltinApiGuard, operationAudit({
  domain: 'ai',
  operationType: 'UPDATE',
  resourceType: 'ai_provider',
  resourceId: (ctx) => ctx.params.id,
  summaryKeys: ['name', 'code', 'baseUrl'],
}), ProviderController.update);
router.delete('/:id', authWithBuiltinApiGuard, operationAudit({
  domain: 'ai',
  operationType: 'DELETE',
  resourceType: 'ai_provider',
  resourceId: (ctx) => ctx.params.id,
}), ProviderController.delete);

module.exports = router;
