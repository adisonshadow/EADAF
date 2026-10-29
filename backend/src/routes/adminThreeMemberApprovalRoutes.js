const Router = require('koa-router');
const ThreeMemberApprovalController = require('../controllers/threeMemberApprovalController');
const authWithBuiltinApiGuard = require('../middlewares/withBuiltinApiGuard');

const router = new Router({ prefix: '/api/v1/admin/three-member-approvals' });

/**
 * @swagger
 * /api/v1/admin/three-member-approvals:
 *   get:
 *     tags: [Admin-Three-Member]
 *     summary: 三员待审批列表 [需要认证]
 *     description: 仅安全保密管理员。三员未开启时调用方会被拒绝。
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 待审批项
 *       403:
 *         description: 不是安全保密管理员
 */
router.get('/', authWithBuiltinApiGuard, ThreeMemberApprovalController.list);

/**
 * @swagger
 * /api/v1/admin/three-member-approvals/{id}/{decision}:
 *   post:
 *     tags: [Admin-Three-Member]
 *     summary: 批准或驳回三员审批 [需要认证]
 *     description: decision 为 approve 或 reject。不能审批自己提交的申请。批准后才执行原操作。
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: decision
 *         required: true
 *         schema: { type: string, enum: [approve, reject] }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               comment: { type: string, description: 审批意见 }
 *     responses:
 *       200:
 *         description: 已处理
 *       403:
 *         description: 无权或不能审批自己的申请
 */
router.post('/:id/:decision', authWithBuiltinApiGuard, ThreeMemberApprovalController.decide);

module.exports = router;
