const Router = require('koa-router');
const SystemHealthController = require('../controllers/systemHealthController');
const authWithBuiltinApiGuard = require('../middlewares/withBuiltinApiGuard');

const router = new Router({ prefix: '/api/v1/admin/system-health' });

/**
 * @swagger
 * /api/v1/admin/system-health:
 *   get:
 *     tags: [Admin-System-Health]
 *     summary: 系统健康报告 [需要认证]
 *     description: |
 *       只读汇总运行环境、关键配置、依赖端口、库结构、系统存储桶、业务数据库连接和 AI 模型。
 *       不连接业务库做实时探测，默认缓存约 15 秒。refresh=1 时跳过缓存。
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: refresh
 *         schema: { type: string, enum: ['1'] }
 *         description: 传 1 时忽略服务端缓存，立即重新采集
 *     responses:
 *       200:
 *         description: 获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 200 }
 *                 message: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [ok, warning, error]
 *                       description: 取最严重的一档
 *                     errorCount: { type: integer, example: 0 }
 *                     warningCount: { type: integer, example: 1 }
 *                     checkedAt: { type: string, format: date-time }
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           key: { type: string, example: bizdataConnections }
 *                           label: { type: string, example: 业务数据库连接 }
 *                           status:
 *                             type: string
 *                             enum: [ok, warning, error, skip]
 *                           summary: { type: string }
 *                           hint: { type: string, nullable: true }
 *                           href: { type: string, nullable: true }
 *       401:
 *         description: 未登录
 *       500:
 *         description: 采集失败
 */
router.get('/', authWithBuiltinApiGuard, SystemHealthController.get);

module.exports = router;
