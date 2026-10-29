const Router = require('koa-router');
const OperationLogController = require('../controllers/operationLogController');
const authWithBuiltinApiGuard = require('../middlewares/withBuiltinApiGuard');

const router = new Router({ prefix: '/api/v1/admin/operation-logs' });

/**
 * @swagger
 * /api/v1/admin/operation-logs:
 *   get:
 *     tags: [Admin-Operation-Logs]
 *     summary: 获取操作日志列表 [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: size
 *         schema: { type: integer }
 *       - in: query
 *         name: domain
 *         schema: { type: string }
 *       - in: query
 *         name: operationType
 *         schema: { type: string }
 *       - in: query
 *         name: resourceType
 *         schema: { type: string }
 *       - in: query
 *         name: resourceId
 *         schema: { type: string }
 *       - in: query
 *         name: operatorId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: operatorName
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [SUCCESS, FAILED, PENDING] }
 *       - in: query
 *         name: startTime
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: endTime
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: traceId
 *         schema: { type: string }
 *       - in: query
 *         name: keyword
 *         schema: { type: string }
 *       - in: query
 *         name: operatorThreeMemberRoles
 *         schema: { type: string, example: system_admin,security_admin }
 *         description: 按写入时的三员身份过滤，逗号分隔
 *     responses:
 *       200:
 *         description: 获取成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeOperationLogList'
 */
router.get('/', authWithBuiltinApiGuard, OperationLogController.list);

/**
 * @swagger
 * /api/v1/admin/operation-logs/{log_id}:
 *   get:
 *     tags: [Admin-Operation-Logs]
 *     summary: 获取操作日志详情 [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: log_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: 获取成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeOperationLog'
 */
router.get('/:log_id', authWithBuiltinApiGuard, OperationLogController.getById);

module.exports = router;
