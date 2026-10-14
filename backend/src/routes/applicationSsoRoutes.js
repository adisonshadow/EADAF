const Router = require('koa-router');
const ApplicationController = require('../controllers/applicationController');

const router = new Router({
  prefix: '/api/v1/applications-sso'
});

/**
 * @swagger
 * /api/v1/applications-sso/system-branding:
 *   get:
 *     tags:
 *       - Applications SSO
 *     summary: 获取系统应用品牌信息
 *     description: 获取 EADAF 系统内置应用的 Logo、名称、描述等公开品牌信息，无需登录
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
 *                     application_id:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                       description: 应用全称
 *                     code:
 *                       type: string
 *                       description: 应用编码
 *                     logo_url:
 *                       type: string
 *                       nullable: true
 *                       description: 应用 Logo URL
 *                     description:
 *                       type: string
 *                       nullable: true
 *                       description: 应用描述/标语
 *       404:
 *         description: 系统应用不存在
 *       500:
 *         description: 服务器错误
 */
router.get('/system-branding', ApplicationController.getSystemBranding);

/**
 * @swagger
 * /api/v1/applications-sso/{id}:
 *   get:
 *     tags:
 *       - Applications SSO
 *     summary: 获取SSO应用信息
 *     description: 获取指定应用的SSO配置信息，用于SSO登录流程
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
 *                     application_id:
 *                       type: string
 *                       format: uuid
 *                       description: 应用ID
 *                       example: "7913b18c-e3f2-4d40-8b6b-b0239c98fef6"
 *                     name:
 *                       type: string
 *                       description: 应用名称
 *                       example: "业务数据设计系统"
 *                     code:
 *                       type: string
 *                       description: 应用编码
 *                       example: "bdc"
 *                     logo_url:
 *                       type: string
 *                       nullable: true
 *                       description: 应用 Logo URL
 *                     status:
 *                       type: string
 *                       enum: [ACTIVE, DISABLED]
 *                       description: 应用状态
 *                       example: "ACTIVE"
 *                     sso_enabled:
 *                       type: boolean
 *                       description: 是否启用SSO
 *                       example: true
 *                     sso_config:
 *                       type: object
 *                       properties:
 *                         currentTimestamp:
 *                           type: string
 *                           description: 当前时间戳
 *                           example: "1703123456789"
 *                         secret:
 *                           type: string
 *                           description: 使用bcrypt加密的时间戳
 *                           example: "$2a$10$xxxxxx"
 *                         protocol:
 *                           type: string
 *                           enum: [OIDC]
 *                           description: SSO协议
 *                           example: "OIDC"
 *                         redirect_uri:
 *                           type: string
 *                           description: |
 *                             SSO回调地址。若启用跟随本系统域名/IP，此处已按当前请求 Host 解析为完整 URL。
 *                           example: "http://localhost:3300/sso-callback"
 *                         redirect_uri_use_system_host:
 *                           type: boolean
 *                           description: 是否跟随本系统访问域名/IP
 *                           example: false
       *                         redirect_mode:
       *                           type: string
       *                           enum: [POST_REDIRECT, HEADER_REDIRECT]
       *                           description: |
       *                             SSO跳转模式
       *                             - POST_REDIRECT: POST跳转（默认）
       *                             - HEADER_REDIRECT: 302重定向+URL参数
       *                           example: "POST_REDIRECT"
       *                         base_url:
       *                           type: string
       *                           format: uri
       *                           description: SSO系统的基础URL
       *                           example: "https://your-sso-system.com"
       *                         client_id:
       *                           type: string
       *                           description: OIDC客户端ID
       *                           example: "your-client-id"
       *                         client_secret:
       *                           type: string
       *                           description: OIDC客户端密钥
       *                           example: "your-client-secret"
       *                         issuer:
       *                           type: string
       *                           format: uri
       *                           description: OIDC发行者URL
       *                           example: "https://sso.example.com"
       *                         frontend_url:
       *                           type: string
       *                           format: uri
       *                           description: 前端应用URL
       *                           example: "https://your-app.com"
       *                         login_page:
       *                           type: object
       *                           description: SSO 登录页样式（主题、侧边栏素材、大字号）
       *                           properties:
       *                             theme:
       *                               type: string
       *                               enum: [light, dark, system]
       *                               description: 登录页主题。light 浅色、dark 深色、system 跟随系统
       *                             aside_kind:
       *                               type: string
       *                               enum: [lottie, image]
       *                               description: 左侧侧边栏素材类型
       *                             aside_lottie:
       *                               type: string
       *                               nullable: true
       *                               description: 侧边栏 Lottie 文件（存储对象 ID 或 URL）
       *                             aside_image:
       *                               type: string
       *                               nullable: true
       *                               description: 侧边栏图片（存储对象 ID 或 URL，支持 SVG）
       *                             large_text:
       *                               type: boolean
       *                               description: 使用更大的文字，适合 Pad 显示
       *                             subtitle:
       *                               type: string
       *                               nullable: true
       *                               maxLength: 80
       *                               description: 登录页副标题；不填则不显示
       *                         login_verify_enabled:
       *                           type: boolean
       *                           description: |
       *                             登录时是否要求「人类验证」（滑动验证）。
       *                             false = 该应用登录直接进行、不弹滑块（内部应用场景）；
       *                             未配置时跟随平台全局开关 LOGIN_VERIFY_ENABLED。
       *                             关闭只免掉滑块，密码校验与登录失败次数限制不受影响。
       *                           example: false
 *                     description:
 *                       type: string
 *                       nullable: true
 *                       description: 应用描述
 *                       example: null
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       description: 创建时间
 *                       example: "2025-06-15T14:24:25.599Z"
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       description: 更新时间
 *                       example: "2025-06-25T16:13:32.447Z"
 *       400:
 *         description: 请求参数错误或SSO未启用
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 400
 *                 message:
 *                   type: string
 *                   example: "该应用未启用SSO"
 *                 data:
 *                   type: null
 *       404:
 *         description: 应用不存在
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 404
 *                 message:
 *                   type: string
 *                   example: "应用端不存在"
 *                 data:
 *                   type: null
 *       500:
 *         description: 服务器错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 500
 *                 message:
 *                   type: string
 *                   example: "获取SSO应用信息失败"
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 */
router.get('/:id', ApplicationController.getSsoInfo);

module.exports = router;
