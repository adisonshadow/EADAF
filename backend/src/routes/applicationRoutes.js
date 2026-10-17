const Router = require('koa-router');
const ApplicationController = require('../controllers/applicationController');
const auth = require('../middlewares/auth');
const { operationAudit } = require('../middlewares/operationAudit');
const router = new Router({
  prefix: '/api/v1/applications'
});

const applicationResourceId = (ctx) => ctx.params.id;
/**
 * @swagger
 * /api/v1/applications:
 *   post:
 *     tags:
 *       - Applications
 *     summary: 创建应用 [需要认证]
 *     description: 创建一个新的应用；成功时写入操作日志（CREATE，密钥已脱敏）。
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - code
 *             properties:
 *               application_id:
 *                 type: string
 *                 format: uuid
 *                 description: 应用ID（可选；不传时系统自动生成 UUID）
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               name:
 *                 type: string
 *                 description: 应用全称
 *                 example: "人力资源管理系统"
 *               code:
 *                 type: string
 *                 description: 缩写简称
 *                 example: "hrms"
 *               logo_url:
 *                 type: string
 *                 description: 应用 Logo URL（可选）
 *                 example: "/images/EADAF-logo.png"
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, DISABLED]
 *                 description: 应用状态
 *                 example: "ACTIVE"
 *               sso_enabled:
 *                 type: boolean
 *                 description: 是否启用SSO
 *                 example: true
 *               sso_config:
 *                 $ref: '#/components/schemas/SSOConfig'
 *               api_enabled:
 *                 type: boolean
 *                 description: 是否启用API服务
 *                 example: true
 *               api_connect_config:
 *                 $ref: '#/components/schemas/APIConnectConfig'
 *               api_data_scope:
 *                 $ref: '#/components/schemas/APIDataScope'
 *               builtin_api_scope:
 *                 type: object
 *                 description: '可访问内置API { permissionCodes: string[] }'
 *               outbound_webhook_scope:
 *                 type: object
 *                 description: '可关联的提交外部API { domainCodes: string[], webhookCodes: string[] }'
 *                 properties:
 *                   domainCodes:
 *                     type: array
 *                     items:
 *                       type: string
 *                   webhookCodes:
 *                     type: array
 *                     items:
 *                       type: string
 *               bizdata_scope_codes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 业务数据 Scope 编码列表（与 bizdata 实体 code 路径前缀对应）
 *               description:
 *                 type: string
 *                 description: 应用描述
 *                 example: "公司人力资源管理系统"
 *     responses:
 *       200:
 *         description: 创建成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "创建成功"
 *                 data:
 *                   $ref: '#/components/schemas/Application'
 *       400:
 *         description: 请求参数错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 服务器错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/',
  auth,
  operationAudit({
    domain: 'application',
    operationType: 'CREATE',
    resourceType: 'application',
    resourceId: (ctx) => ctx.body?.data?.application_id,
    summaryKeys: ['name', 'code'],
  }),
  ApplicationController.create,
);

/**
 * @swagger
 * /api/v1/applications:
 *   get:
 *     tags:
 *       - Applications
 *     summary: 获取应用列表 [需要认证] 
 *     description: 获取应用列表，支持分页和筛选。当 size 参数为 -1 时，返回所有记录不分页。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: 页码（当 size 不为 -1 时有效）
 *       - name: size
 *         in: query
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: -1
 *           maximum: 100
 *         description: 每页数量，设置为 -1 时返回所有记录不分页
 *       - name: name
 *         in: query
 *         schema:
 *           type: string
 *         description: 应用全称（支持模糊匹配）
 *       - name: code
 *         in: query
 *         schema:
 *           type: string
 *         description: 缩写简称（支持模糊匹配）
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [ACTIVE, DISABLED]
 *         description: 应用状态
 *     responses:
 *       200:
 *         description: 获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       description: 总记录数（当 size 为 -1 时等于 items 的长度）
 *                       example: 100
 *                     page:
 *                       type: integer
 *                       description: 当前页码（当 size 为 -1 时固定为 1）
 *                       example: 1
 *                     size:
 *                       type: integer
 *                       description: 每页数量（当 size 为 -1 时等于总记录数）
 *                       example: 10
 *                     items:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Application'
 *       401:
 *         description: 未授权
 *       500:
 *         description: 服务器错误
 */
router.get('/', auth, ApplicationController.list);

/**
 * @swagger
 * /api/v1/applications/{id}:
 *   get:
 *     tags:
 *       - Applications
 *     summary: 获取应用详情 [需要认证]
 *     description: 根据ID获取应用详情
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 应用ID
 *     responses:
 *       200:
 *         description: 获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "获取成功"
 *                 data:
 *                   $ref: '#/components/schemas/Application'
 *       404:
 *         description: 应用不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 服务器错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', auth, ApplicationController.getById);

/**
 * @swagger
 * /api/v1/applications/{id}:
 *   put:
 *     tags:
 *       - Applications
 *     summary: 更新应用 [需要认证]
 *     description: 更新应用信息
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 应用ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: 应用全称
 *                 example: "人力资源管理系统"
 *               code:
 *                 type: string
 *                 description: 缩写简称
 *                 example: "hrms"
 *               logo_url:
 *                 type: string
 *                 description: 应用 Logo URL（可选）
 *                 example: "/images/EADAF-logo.png"
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, DISABLED]
 *                 description: 应用状态
 *                 example: "ACTIVE"
 *               sso_enabled:
 *                 type: boolean
 *                 description: 是否启用SSO
 *                 example: true
 *               sso_config:
 *                 $ref: '#/components/schemas/SSOConfig'
 *               api_enabled:
 *                 type: boolean
 *                 description: 是否启用API服务
 *                 example: true
 *               api_connect_config:
 *                 $ref: '#/components/schemas/APIConnectConfig'
 *               api_data_scope:
 *                 $ref: '#/components/schemas/APIDataScope'
 *               builtin_api_scope:
 *                 type: object
 *                 description: '可访问内置API { permissionCodes: string[] }'
 *               outbound_webhook_scope:
 *                 type: object
 *                 description: '可关联的提交外部API { domainCodes: string[], webhookCodes: string[] }'
 *                 properties:
 *                   domainCodes:
 *                     type: array
 *                     items:
 *                       type: string
 *                   webhookCodes:
 *                     type: array
 *                     items:
 *                       type: string
 *               bizdata_scope_codes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 业务数据 Scope 编码列表（与 bizdata 实体 code 路径前缀对应）
 *               description:
 *                 type: string
 *                 description: 应用描述
 *                 example: "公司人力资源管理系统"
 *     responses:
 *       200:
 *         description: 更新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "更新成功"
 *                 data:
 *                   $ref: '#/components/schemas/Application'
 *       404:
 *         description: 应用不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 服务器错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put(
  '/:id',
  auth,
  operationAudit({
    domain: 'application',
    operationType: 'UPDATE',
    resourceType: 'application',
    resourceId: applicationResourceId,
    summaryKeys: ['name', 'code', 'status', 'sso_enabled'],
  }),
  ApplicationController.update,
);

/**
 * @swagger
 * /api/v1/applications/{id}/delete-preview:
 *   get:
 *     tags:
 *       - Applications
 *     summary: 应用删除预览 [需要认证]
 *     description: |
 *       返回应用基本信息、按 bizdata_scope_codes / api_data_scope 命中的业务数据计数，
 *       以及归属该应用（来源应用）的 Bucket 清单与对象数量，供删除确认页展示。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 应用ID
 *     responses:
 *       200:
 *         description: 预览成功；data.cascade.counts 含 entities/apiServices/pipelines/metrics/materializations 等
 *       403:
 *         description: 系统内置应用不可删除
 *       404:
 *         description: 应用不存在
 */
router.get(
  '/:id/delete-preview',
  auth,
  ApplicationController.deletePreview,
);

/**
 * @swagger
 * /api/v1/applications/{id}:
 *   delete:
 *     tags:
 *       - Applications
 *     summary: 删除应用 [需要认证]
 *     description: |
 *       物理删除指定应用（非软删，避免同 code tombstone 阻断再次导入）。
 *       默认同时按与导出相同的 scope 前缀规则级联删除数据模型、API、管道、指标、
 *       Webhook、Hook、枚举、Scope 文档、仅绑定本应用的专用 Skill 及其独占 Tool、物化元数据等；
 *       全局 Skill 与仍被其他 Skill 使用的 Tool 只解除绑定。可选删除物理物化表、以及归属 Bucket/文件。
 *       系统 Bucket 中仍归属该应用的文件记录不会删除，但会先摘掉 application_id，避免外键拦住删除。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 应用ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deleteBizdata:
 *                 type: boolean
 *                 default: true
 *                 description: 是否按应用 scope 级联删除业务数据（实体/API/管道/指标/Webhook/Hook/专用 Skill 及其独占 Tool 等）
 *               dropPhysicalTables:
 *                 type: boolean
 *                 default: false
 *                 description: 级联删实体时是否同时 DROP 已物化的物理表/集合（需 deleteBizdata=true）
 *               deleteBuckets:
 *                 type: boolean
 *                 default: false
 *                 description: 是否同时删除来源应用归属的 Bucket 及其下文件
 *     responses:
 *       200:
 *         description: 删除成功；data 含 cascade 摘要，以及可选的 deletedBuckets / deletedObjects / skippedSystemBuckets
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "删除成功"
 *       403:
 *         description: 系统内置应用不可删除
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 应用不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 服务器错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete(
  '/:id',
  auth,
  operationAudit({
    domain: 'application',
    operationType: 'DELETE',
    resourceType: 'application',
    resourceId: applicationResourceId,
  }),
  ApplicationController.delete,
);

/**
 * @swagger
 * /api/v1/applications/{id}/generate-secret:
 *   post:
 *     tags:
 *       - Applications
 *     summary: 生成应用统一密钥 [需要认证]
 *     description: 生成 app_secret 并同步写入 api_connect_config 与 sso_config.client_secret；成功时写入操作日志（UPDATE，密钥已脱敏）。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 应用ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: 无需传参，服务端随机生成统一密钥
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "生成成功"
 *                 data:
 *                   type: object
 *                   properties:
 *                     app_secret:
 *                       type: string
 *                       description: 应用密钥
 *                       example: "a1b2c3d4e5f6g7h8i9j0..."
 *       400:
 *         description: 请求参数错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 应用不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 服务器错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/:id/generate-secret',
  auth,
  operationAudit({
    domain: 'application',
    operationType: 'UPDATE',
    resourceType: 'application',
    resourceId: applicationResourceId,
  }),
  ApplicationController.generateSecret,
);

/**
 * @swagger
 * /api/v1/applications/{id}/top-level-skill:
 *   get:
 *     tags:
 *       - Applications
 *     summary: 获取应用顶层 Skill [需要认证]
 *     description: 获取应用的顶层 Skill 说明（Markdown，可选）
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 应用ID
 *     responses:
 *       200:
 *         description: 获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     applicationId:
 *                       type: string
 *                       format: uuid
 *                     applicationName:
 *                       type: string
 *                     contentMarkdown:
 *                       type: string
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: 应用不存在
 *   put:
 *     tags:
 *       - Applications
 *     summary: 更新应用顶层 Skill [需要认证]
 *     description: 保存或清空应用的顶层 Skill 说明（空字符串表示未配置）
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 应用ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               contentMarkdown:
 *                 type: string
 *                 description: 顶层 Skill Markdown 内容，空字符串表示清空
 *     responses:
 *       200:
 *         description: 保存成功
 *       400:
 *         description: 请求参数错误
 *       404:
 *         description: 应用不存在
 */
router.get('/:id/top-level-skill', auth, ApplicationController.getTopLevelSkill);
router.put(
  '/:id/top-level-skill',
  auth,
  operationAudit({
    domain: 'application',
    operationType: 'UPDATE',
    resourceType: 'application',
    resourceId: applicationResourceId,
  }),
  ApplicationController.updateTopLevelSkill,
);

/**
 * @swagger
 * /api/v1/applications/token:
 *   post:
 *     tags:
 *       - Applications
 *     summary: 获取应用Token [需要认证]
 *     description: 根据应用ID和app_secret获取JWT Token，用于应用API认证
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - application_id
 *               - app_secret
 *             properties:
 *               application_id:
 *                 type: string
 *                 format: uuid
 *                 description: 应用ID
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               app_secret:
 *                 type: string
 *                 description: 应用密钥
 *                 example: "a1b2c3d4e5f6g7h8i9j0..."
 *     responses:
 *       200:
 *         description: 获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "获取成功"
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                       description: JWT Token
 *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       400:
 *         description: 请求参数错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 认证失败
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 应用不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 服务器错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/token', ApplicationController.getToken);

module.exports = router; 