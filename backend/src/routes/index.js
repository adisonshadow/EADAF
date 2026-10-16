const Router = require('koa-router');
const roleRoutes = require('./roleRoutes');
const userRoutes = require('./userRoutes');
const authRoutes = require('./authRoutes');
const permissionRoutes = require('./permissionRoutes');
const departmentRoutes = require('./departmentRoutes');
const captchaRoutes = require('./captchaRoutes');
const applicationRoutes = require('./applicationRoutes');
const applicationSsoRoutes = require('./applicationSsoRoutes');
const applicationPublicRoutes = require('./applicationPublicRoutes');
const adminProviderRoutes = require('./adminProviderRoutes');
const adminAiModelRoutes = require('./adminAiModelRoutes');
const adminScopeRoutes = require('./adminScopeRoutes');
const adminToolRoutes = require('./adminToolRoutes');
const adminSkillRoutes = require('./adminSkillRoutes');
const adminAiRequestLogRoutes = require('./adminAiRequestLogRoutes');
const adminOperationLogRoutes = require('./adminOperationLogRoutes');
const aiRoutes = require('./aiRoutes');
const businessDataRoutes = require('./businessDataRoutes');
const storageRoutes = require('./storageRoutes');
const apiServiceAdminRoutes = require('./apiServiceAdminRoutes');
const apiServiceDataRoutes = require('./apiServiceDataRoutes');
const apiServiceStreamRoutes = require('./apiServiceStreamRoutes');
const collectionPipelineAdminRoutes = require('./collectionPipelineAdminRoutes');
const builtinApiRoutes = require('./builtinApiRoutes');
const outboundWebhookRoutes = require('./outboundWebhookRoutes');
const exceptionResponseRoutes = require('./exceptionResponseRoutes');
const systemRoutes = require('./systemRoutes');
const appTransferRoutes = require('./appTransferRoutes');
const platformTransferRoutes = require('./platformTransferRoutes');
const appDeploymentRoutes = require('./appDeploymentRoutes');
const oauthRoutes = require('./oauthRoutes');
const OAuthController = require('../controllers/oauthController');
const automationHookRoutes = require('./automationHookRoutes');

const router = new Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     SSOConfig:
 *       type: object
 *       required:
 *         - protocol
 *         - redirect_uri
 *       properties:
 *         protocol:
 *           type: string
 *           enum: [OIDC]
 *           description: SSO使用的协议
 *           example: "OIDC"
 *         redirect_uri:
 *           type: string
 *           description: |
 *             SSO回调地址（应为业务 BFF，勿填纯前端页）。
 *             当 redirect_uri_use_system_host=true 时，存端口路径（如 :13303/auth/callback）或本机路径（如 /auth/callback），
 *             登录/跳转时按当前访问 Host 拼出完整 URL。
 *           example: "https://hrms.example.com/auth/callback"
 *         redirect_uri_use_system_host:
 *           type: boolean
 *           default: false
 *           description: |
 *             是否跟随本系统访问域名/IP。
 *             为 true 时 redirect_uri 仅填后缀，运行时用当前请求的 Host 拼完整回调地址（便于客户 IP 常变）。
 *           example: false
 *         redirect_uri_dev_enabled:
 *           type: boolean
 *           default: false
 *           description: |
 *             是否启用「DEV 专用重定向」。
 *             为 true 且平台跑在开发模式（后端 NODE_ENV=development，npm run dev / pm2dev）时，
 *             登录跳转改用 redirect_uri_dev；部署环境仍用 redirect_uri。
 *             用于开发机与部署环境回调地址不同（尤其端口）的场景。
 *           example: false
 *         redirect_uri_dev:
 *           type: string
 *           description: |
 *             DEV 专用 SSO 回调地址（redirect_uri_dev_enabled=true 时生效，必填）。
 *             未填时回落到 redirect_uri。也可只填端口路径，配合 redirect_uri_dev_use_system_host。
 *           example: "http://localhost:13303/auth/callback"
 *         redirect_uri_dev_use_system_host:
 *           type: boolean
 *           default: false
 *           description: |
 *             DEV 专用回调地址是否跟随本系统访问域名/IP（语义同 redirect_uri_use_system_host）。
 *           example: false
 *         salt:
 *           type: string
 *           description: 旧版SSO签名盐（仅兼容历史数据；新接入使用密钥管理生成的统一密钥）
 *           example: "legacy-sso-salt"
 *         secret:
 *           type: string
 *           description: 基于 currentTimestamp 与应用统一密钥，使用 bcrypt 生成的Hash值（回调校验用）
 *           example: "$2a$10$xxxxx"
 *         currentTimestamp:
 *           type: integer
 *           description: 当前时间戳， 用于生成secret
 *           example: 17198592000
 *         redirect_mode:
 *           type: string
 *           enum: [POST_REDIRECT, HEADER_REDIRECT]
 *           default: POST_REDIRECT
 *           description: |
 *             SSO跳转模式
 *             - POST_REDIRECT: POST跳转（默认）
 *             - HEADER_REDIRECT: 302重定向+URL参数
 *           example: "POST_REDIRECT"
 *         base_url:
 *           type: string
 *           format: uri
 *           description: SSO系统的基础URL
 *           example: "https://your-sso-system.com"
 *         client_id:
 *           type: string
 *           description: OIDC客户端ID
 *           example: "your-client-id"
 *         client_secret:
 *           type: string
 *           description: 应用统一密钥（与 api_connect_config.app_secret 同步，用于SSO JWT签名）
 *           example: "your-client-secret"
 *         issuer:
 *           type: string
 *           format: uri
 *           description: OIDC发行者URL
 *           example: "https://sso.example.com"
 *         frontend_url:
 *           type: string
 *           format: uri
 *           description: 前端应用URL
 *           example: "https://your-app.com"
 *         login_page:
 *           type: object
 *           description: SSO 登录页样式（启用 SSO 后可配置）
 *           properties:
 *             theme:
 *               type: string
 *               enum: [light, dark, system]
 *               default: light
 *               description: 登录页主题。light 浅色、dark 深色、system 跟随系统
 *               example: light
 *             aside_kind:
 *               type: string
 *               enum: [lottie, image]
 *               default: lottie
 *               description: 左侧侧边栏素材类型。lottie 为 Lottie JSON 动画，image 为图片（含 SVG）
 *               example: lottie
 *             aside_lottie:
 *               type: string
 *               nullable: true
 *               description: 侧边栏 Lottie 文件（存储对象 ID 或 URL）
 *             aside_image:
 *               type: string
 *               nullable: true
 *               description: 侧边栏图片（存储对象 ID 或 URL，支持 SVG）
 *             large_text:
 *               type: boolean
 *               default: false
 *               description: 使用更大的文字，适合 Pad 显示
 *               example: false
 *             subtitle:
 *               type: string
 *               nullable: true
 *               maxLength: 80
 *               description: 登录页副标题，显示在应用名称下方；不填则不显示，不会使用应用描述
 *               example: "请使用统一身份认证登录"
 *         additional_params:
 *           type: object
 *           description: 其他SSO协议特定的参数
 *           additionalProperties: true
 *           example: {
 *             "client_id": "hrms-client",
 *             "client_secret": "your-client-secret",
 *             "issuer": "https://sso.example.com"
 *           }
 *     APIConnectConfig:
 *       type: object
 *       properties:
 *         app_secret:
 *           type: string
 *           description: 应用统一密钥（密钥管理生成；用于换取应用Token，并作为SSO JWT签名密钥）
 *           example: "a1b2c3d4e5f6..."
 *         salt:
 *           type: string
 *           description: 历史字段（可选，已不再作为签发依据）
 *           example: "random-salt-456"
 *     APIDataScope:
 *       type: object
 *       description: API数据权限范围配置
 *       additionalProperties:
 *         type: string
 *         enum: [all, department, self]
 *         description: 数据权限范围
 *       example:
 *         user:read: "department"
 *         user:write: "self"
 *         department:read: "all"
 *     Application:
 *       type: object
 *       properties:
 *         application_id:
 *           type: string
 *           format: uuid
 *           description: 应用ID
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *         name:
 *           type: string
 *           description: 应用全称
 *           example: "人力资源管理系统"
 *         code:
 *           type: string
 *           description: 缩写简称
 *           example: "hrms"
 *         logo_url:
 *           type: string
 *           nullable: true
 *           description: 应用 Logo URL（可选）
 *           example: "/images/logo.svg"
 *         status:
 *           type: string
 *           enum: [ACTIVE, DISABLED]
 *           description: 应用状态
 *           example: "ACTIVE"
 *         sso_enabled:
 *           type: boolean
 *           description: 是否启用SSO
 *           example: true
 *         sso_config:
 *           $ref: '#/components/schemas/SSOConfig'
 *         api_enabled:
 *           type: boolean
 *           description: 是否启用API服务
 *           example: true
 *         api_connect_config:
 *           $ref: '#/components/schemas/APIConnectConfig'
 *         api_data_scope:
 *           $ref: '#/components/schemas/APIDataScope'
 *         description:
 *           type: string
 *           description: 应用描述
 *           example: "公司人力资源管理系统"
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: 创建时间
 *           example: "2024-03-21T10:00:00.000Z"
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: 更新时间
 *           example: "2024-03-21T10:00:00.000Z"
 *         deleted_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: 删除时间
 *           example: null
 *     User:
 *       type: object
 *       properties:
 *         user_id:
 *           type: string
 *           format: uuid
 *         username:
 *           type: string
 *         email:
 *           type: string
 *           format: email
 *         phone:
 *           type: string
 *         status:
 *           type: string
 *           enum: [ACTIVE, DISABLED]
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     Role:
 *       type: object
 *       properties:
 *         role_id:
 *           type: string
 *           format: uuid
 *         role_name:
 *           type: string
 *         code:
 *           type: string
 *         description:
 *           type: string
 *         status:
 *           type: string
 *           enum: [ACTIVE, ARCHIVED]
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     Permission:
 *       type: object
 *       properties:
 *         permission_id:
 *           type: string
 *           format: uuid
 *           description: 权限ID
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *         name:
 *           type: string
 *           description: 权限名称
 *           example: "用户管理"
 *         code:
 *           type: string
 *           description: 权限编码
 *           example: "user:manage"
 *         description:
 *           type: string
 *           description: 权限描述
 *           example: "允许对用户进行增删改查操作"
 *         resource_type:
 *           type: string
 *           description: 资源类型
 *           enum: [MENU, BUTTON, API]
 *           example: "MENU"
 *         actions:
 *           type: array
 *           description: 操作类型列表
 *           items:
 *             type: string
 *             enum: [create, read, update, delete]
 *           example: ["create", "read", "update", "delete"]
 *         parent_id:
 *           type: string
 *           format: uuid
 *           description: 父权限ID
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *         status:
 *           type: string
 *           enum: [ACTIVE, DISABLED]
 *           description: 权限状态
 *           example: "ACTIVE"
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: 创建时间
 *           example: "2024-03-21T10:00:00.000Z"
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: 更新时间
 *           example: "2024-03-21T10:00:00.000Z"
 *     Department:
 *       type: object
 *       properties:
 *         department_id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         code:
 *           type: string
 *         parent_id:
 *           type: string
 *           format: uuid
 *         status:
 *           type: string
 *           enum: [ACTIVE, DISABLED]
 *         description:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     File:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         filename:
 *           type: string
 *         originalname:
 *           type: string
 *         mimetype:
 *           type: string
 *         size:
 *           type: integer
 *         path:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     Captcha:
 *       type: object
 *       properties:
 *         captcha_id:
 *           type: string
 *           format: uuid
 *         target_position:
 *           type: object
 *           properties:
 *             x:
 *               type: number
 *             y:
 *               type: number
 *         image:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         expires_at:
 *           type: string
 *           format: date-time
 *     Error:
 *       type: object
 *       properties:
 *         code:
 *           type: integer
 *         message:
 *           type: string
 *         data:
 *           type: object
 *           nullable: true
 */

// 注册各个模块的路由
router.use(authRoutes.routes());
router.use(userRoutes.routes());
router.use(roleRoutes.routes());
router.use(permissionRoutes.routes());
router.use(departmentRoutes.routes());
router.use(captchaRoutes.routes());
router.use(applicationRoutes.routes());
router.use(applicationSsoRoutes.routes());
router.use(applicationPublicRoutes.routes());
router.use(adminProviderRoutes.routes());
router.use(adminAiModelRoutes.routes());
router.use(adminScopeRoutes.routes());
router.use(adminToolRoutes.routes());
router.use(adminSkillRoutes.routes());
router.use(adminAiRequestLogRoutes.routes());
router.use(adminOperationLogRoutes.routes());
router.use(aiRoutes.routes());
router.use(businessDataRoutes.routes());
router.use(storageRoutes.routes());
router.use(apiServiceAdminRoutes.routes());
router.use(apiServiceDataRoutes.routes());
router.use(apiServiceStreamRoutes.routes());
router.use(collectionPipelineAdminRoutes.routes());
router.use(builtinApiRoutes.routes());
router.use(outboundWebhookRoutes.routes());
router.use(exceptionResponseRoutes.routes());
router.use(systemRoutes.routes());
router.use(appTransferRoutes.routes());
router.use(platformTransferRoutes.routes());
router.use(oauthRoutes.routes());

// OIDC 发现与 JWKS：按约定挂在根路径（不带 /api/v1 前缀），公开只读
router.get('/.well-known/jwks.json', OAuthController.jwks);
router.get('/.well-known/openid-configuration', OAuthController.discovery);

router.use(appDeploymentRoutes.routes());
router.use(automationHookRoutes.routes());

module.exports = router; 