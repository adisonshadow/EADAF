const Router = require('koa-router');
const authController = require('../controllers/authController');
const auth = require('../middlewares/auth');
const optionalAuth = require('../middlewares/optionalAuth');
const { operationAudit } = require('../middlewares/operationAudit');
const { skipLoginAudit } = require('../services/operationAudit/skipLoginAudit');

const router = new Router({ prefix: '/api/v1/auth' });

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     tags:
 *       - Auth
 *     summary: 用户登录
 *     description: |
 *       用户登录接口，支持多种登录模式：
 *       
 *       1. **开发者登录模式**：在开发环境下设置 dev=true 可跳过验证码和登录限制检查
 *       2. **普通登录模式**：
 *          - 2.1 首次登录：输入 username、password，返回需要验证码
 *          - 2.2 验证码验证：输入 username、password、captcha_data 完成登录
 *       3. **SSO登录模式**：如果包含 application_id 则进入 SSO 模式，返回包含 SSO 信息
 *
 *       登录成功时写入操作日志（LOGIN）；失败、以及首次请求返回的验证码挑战（HTTP 202）不记入操作日志。
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: 用户名
 *                 example: admin
 *               password:
 *                 type: string
 *                 description: 密码
 *                 example: 123456
 *               dev:
 *                 type: boolean
 *                 description: |
 *                   开发者登录模式标志
 *                   - 仅在开发环境（NODE_ENV=development）下生效
 *                   - 设置为 true 时跳过验证码验证和登录限制检查
 *                   - 适用于开发测试场景
 *                 example: true
 *                 default: false
 *               application_id:
 *                 type: string
 *                 format: uuid
 *                 description: |
 *                   应用ID，用于SSO登录模式
 *                   - 如果提供且应用启用了SSO，将返回该应用的SSO配置信息
 *                   - 系统将使用应用统一密钥（client_secret / app_secret，兼容旧 salt）作为JWT签名密钥
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               login_app_id:
 *                 type: string
 *                 format: uuid
 *                 description: |
 *                   登录页所属应用ID，仅用于判定「人类验证」（sso_config.login_verify_enabled）
 *                   - 授权码流程（/oauth/authorize）的登录页没有 application_id（那会用应用密钥签发令牌），
 *                     用它说明这一页属于哪个应用；不影响令牌签发与 SSO 响应
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               captcha_data:
 *                 type: object
 *                 description: |
 *                   验证码数据，用于普通登录模式的验证码验证步骤
 *                   - 在首次登录返回需要验证码后，需要提供此参数完成验证
 *                 properties:
 *                   captcha_id:
 *                     type: string
 *                     format: uuid
 *                     description: 验证码ID，从验证码接口获取
 *                     example: "550e8400-e29b-41d4-a716-446655440000"
 *               sid:
 *                 type: string
 *                 format: uuid
 *                 description: |
 *                   浏览器会话 ID（可选）。带上它时本次登录并入同一会话 —— 管理台与各业务
 *                   应用的 SSO 登录都带同一个 sid，登出时撤销该会话即"该设备所有应用一起退出"。
 *                   不传则新建会话。响应里会回传最终使用的 sid。
 *                 example: "3f2504e0-4f89-11d3-9a0c-0305e82c3301"
 *     responses:
 *       200:
 *         description: 登录成功
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
 *                     token:
 *                       type: string
 *                       description: 访问令牌，用于后续API调用认证
 *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                     sid:
 *                       type: string
 *                       format: uuid
 *                       description: 本次登录所属的会话 ID（下次登录/登出带上它）
 *                     refresh_token:
 *                       type: string
 *                       description: 刷新令牌，用于获取新的访问令牌
 *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                     expires_in:
 *                       type: string
 *                       description: 访问令牌过期时间
 *                       example: "2h"
 *                     user_id:
 *                       type: string
 *                       format: uuid
 *                       description: 用户ID
 *                       example: "550e8400-e29b-41d4-a716-446655440000"
 *                     sso:
 *                       type: object
 *                       description: |
 *                         SSO配置信息
 *                         - 仅当提供application_id且应用启用了SSO时返回
 *                         - 包含应用的SSO配置和相关信息
 *                       properties:
 *                         application_id:
 *                           type: string
 *                           format: uuid
 *                           description: 应用ID
 *                           example: "550e8400-e29b-41d4-a716-446655440000"
 *                         application_name:
 *                           type: string
 *                           description: 应用名称
 *                           example: "人力资源管理系统"
 *                         application_code:
 *                           type: string
 *                           description: 应用编码
 *                           example: "hrms"
 *                         sso_config:
 *                           type: object
 *                           description: 应用的SSO配置信息（回调用字段；签名密钥不下发完整 app_secret）
 *                           properties:
 *                             redirect_uri:
 *                               type: string
 *                               description: |
 *                                 SSO回调地址（应为业务 BFF）。
 *                                 若配置了跟随本系统域名/IP，此处已按当前请求 Host 解析为完整 URL。
 *                               example: "https://app.example.com/auth/callback"
 *                             redirect_uri_use_system_host:
 *                               type: boolean
 *                               description: 是否跟随本系统访问域名/IP（管理端配置；登录响应中 redirect_uri 已解析）
 *                               example: false
 *                             client_secret:
 *                               type: string
 *                               description: 历史字段；验签请使用应用统一密钥（密钥管理生成的 app_secret / client_secret）
 *                               example: "app-unified-secret"
 *                             salt:
 *                               type: string
 *                               description: 旧版签名盐（仅兼容历史数据，新接入勿依赖）
 *                               example: "legacy-sso-salt"
       *                             redirect_mode:
       *                               type: string
       *                               enum: [POST_REDIRECT, HEADER_REDIRECT]
       *                               description: |
       *                                 SSO跳转模式
       *                                 - POST_REDIRECT: POST跳转（默认）
       *                                 - HEADER_REDIRECT: 302重定向+URL参数
       *                               example: "POST_REDIRECT"
       *                             login_page:
       *                               type: object
       *                               description: SSO 登录页样式（主题、侧边栏素材、大字号）
 *       202:
 *         description: |
 *           需要验证码（普通登录模式步骤2.1）
 *           - 首次登录时，如果系统启用了验证码功能，会返回此状态
 *           - 客户端需要获取验证码并重新提交登录请求
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 202
 *                 message:
 *                   type: string
 *                   example: 需要验证码
 *                 data:
 *                   type: object
 *                   properties:
 *                     need_captcha:
 *                       type: boolean
 *                       description: 标识需要验证码
 *                       example: true
 *       400:
 *         description: |
 *           参数错误或验证码无效
 *           - 用户名或密码为空
 *           - 验证码无效或未验证
 *           - 用户已被删除
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
 *                   example: 验证码无效或未验证
 *                 data:
 *                   type: null
 *                   example: null
 *       401:
 *         description: 用户名或密码错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 401
 *                 message:
 *                   type: string
 *                   example: 用户名或密码错误
 *                 data:
 *                   type: null
 *                   example: null
 *       403:
 *         description: 用户已被禁用
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 403
 *                 message:
 *                   type: string
 *                   example: 用户已被禁用
 *                 data:
 *                   type: null
 *                   example: null
 *       429:
 *         description: |
 *           登录失败次数过多（普通登录模式限制）
 *           - 一小时内登录失败超过5次
 *           - 开发者登录模式不受此限制
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 429
 *                 message:
 *                   type: string
 *                   example: 登录失败次数过多，请一小时后重试
 *                 data:
 *                   type: object
 *                   properties:
 *                     next_attempt_time:
 *                       type: string
 *                       format: date-time
 *                       description: 下次可尝试登录的时间
 *                       example: "2024-03-21T11:00:00.000Z"
 *       500:
 *         description: 服务器内部错误
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
 *                   example: 服务器内部错误
 *                 data:
 *                   type: null
 *                   example: null
 */
router.post(
  '/login',
  operationAudit({
    domain: 'auth',
    operationType: 'LOGIN',
    resourceType: 'user',
    skip: skipLoginAudit,
  }),
  authController.login,
);

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     tags:
 *       - Auth
 *     summary: 刷新访问令牌 [需要认证]
 *     description: 使用刷新令牌获取新的访问令牌，支持第三方系统通过app参数刷新token
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refresh_token
 *             properties:
 *               refresh_token:
 *                 type: string
 *                 description: 刷新令牌
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *               app:
 *                 type: string
 *                 format: uuid
 *                 description: 应用ID，用于第三方系统刷新token（可选）
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *     responses:
 *       200:
 *         description: 刷新成功
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
 *                     token:
 *                       type: string
 *                       description: 新的访问令牌
 *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                     refresh_token:
 *                       type: string
 *                       description: 新的刷新令牌
 *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                     expires_in:
 *                       type: string
 *                       description: 令牌过期时间
 *                       example: "2h"
 *       400:
 *         description: 请求参数错误或无效的应用ID
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
 *                   example: 刷新令牌不能为空
 *                 data:
 *                   type: null
 *                   example: null
 *       401:
 *         description: 刷新令牌无效
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 401
 *                 message:
 *                   type: string
 *                   example: 刷新令牌无效或已过期
 *                 data:
 *                   type: null
 *                   example: null
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
 *                   example: 服务器内部错误
 *                 data:
 *                   type: null
 *                   example: null
 */
// 刷新：不要求有效 access token —— 访问令牌过期后必须还能刷新，
// 凭据是刷新令牌本身（轮换 + 重放检测见 authController.refreshToken）
router.post('/refresh', authController.refreshToken);

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     tags:
 *       - Auth
 *     summary: 用户登出 [需要认证]
 *     description: 用户登出接口，使当前访问令牌失效；成功时写入操作日志（LOGOUT）。
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refresh_token:
 *                 type: string
 *                 description: 刷新令牌
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *               sid:
 *                 type: string
 *                 format: uuid
 *                 description: 会话 ID；撤销它 = 该设备上所有应用一起退出（管理台前端 localStorage 的 eadaf_sid）
 *               all:
 *                 type: boolean
 *                 description: 为 true 时同时撤销该用户的**全部**会话（退出所有设备）。需要能确认身份（有效令牌或刷新令牌）
 *     responses:
 *       200:
 *         description: 登出成功
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
 *                   example: 登出成功
 *                 data:
 *                   type: null
 *                   example: null
 *       401:
 *         description: 未登录
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 401
 *                 message:
 *                   type: string
 *                   example: 未授权
 *                 data:
 *                   type: null
 *                   example: null
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
 *                   example: 服务器内部错误
 *                 data:
 *                   type: null
 *                   example: null
 */
// 登出：不要求有效 access token（令牌过期时也必须能登出），凭据是刷新令牌 / 会话 ID；
// optionalAuth 只在令牌有效时补上"当前是谁"，用于 `all: true` 退出所有设备
router.post(
  '/logout',
  optionalAuth,
  operationAudit({
    domain: 'auth',
    operationType: 'LOGOUT',
    resourceType: 'user',
    resourceId: (ctx) => ctx.state.auditContext?.resource_id || ctx.state.user?.user_id,
  }),
  authController.logout,
);

/**
 * @swagger
 * /api/v1/auth/sessions:
 *   get:
 *     tags: [Auth]
 *     summary: 当前用户的活跃会话（登录设备）[需要认证]
 *     description: |
 *       列出该用户由 Redis 记录的 SSO 会话。`store_available=false` 表示会话存储（Redis）
 *       不可用，此时列表必为空 —— 是"查不到"，不是"没有会话"。
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 会话列表
 *   delete:
 *     tags: [Auth]
 *     summary: 退出所有设备（撤销全部会话）[需要认证]
 *     description: 会连当前会话一起撤销，前端应随后回登录页。
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 已退出所有设备
 * /api/v1/auth/sessions/{sid}:
 *   delete:
 *     tags: [Auth]
 *     summary: 撤销指定会话 [需要认证]
 *     description: 只能撤销属于当前用户的会话（否则 404）。
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sid
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: 已撤销
 *       404:
 *         description: 会话不存在或不属于当前用户
 */
// 登录设备（会话）：列出 / 撤销单个 / 撤销全部
// 撤销都要进操作日志（Phase 3 §3.3：全局登出策略与审计）
router.get('/sessions', auth, authController.listSessions);
router.delete(
  '/sessions/:sid',
  auth,
  operationAudit({
    domain: 'auth',
    operationType: 'LOGOUT',
    resourceType: 'session',
    resourceId: (ctx) => ctx.params.sid,
  }),
  authController.revokeSession,
);
router.delete(
  '/sessions',
  auth,
  operationAudit({
    domain: 'auth',
    operationType: 'LOGOUT_ALL',
    resourceType: 'user',
    resourceId: (ctx) => ctx.state.user?.user_id,
  }),
  authController.revokeAllSessions,
);

/**
 * @swagger
 * /api/v1/auth/end-session:
 *   get:
 *     tags:
 *       - Auth
 *     summary: 单点登出中转（RP-Initiated Logout）
 *     description: |
 *       业务应用登出后由浏览器跳到本接口，校验回跳地址并 302 回应用。
 *       回跳地址必须与应用配置的 `redirect_uri`（含 DEV 那套）或 `frontend_url` **同源**，
 *       否则返回 400（防开放重定向）。
 *
 *       本接口**不要求认证**，也不直接撤销令牌：Phase 0 的刷新令牌在浏览器侧，
 *       由管理台 `/auth/logout` 页面先调 `POST /api/v1/auth/logout` 撤销再跳到这里。
 *     parameters:
 *       - in: query
 *         name: app
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: 应用 ID
 *       - in: query
 *         name: post_logout_redirect_uri
 *         required: true
 *         schema: { type: string }
 *         description: 登出后回跳地址（需与应用同源）
 *       - in: query
 *         name: state
 *         required: false
 *         schema: { type: string }
 *         description: 原样回传（防 CSRF / 保留应用上下文）
 *     responses:
 *       302:
 *         description: 回跳到 post_logout_redirect_uri（附带 logged_out=1 与 state）
 *       400:
 *         description: app 或回跳地址不合法
 */
router.get('/end-session', authController.endSession);

/**
 * @swagger
 * /api/v1/auth/captcha:
 *   get:
 *     tags:
 *       - Auth
 *     summary: 获取验证码
 *     description: 获取登录验证码图片
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
 *                   example: 验证码生成成功
 *                 data:
 *                   type: object
 *                   properties:
 *                     captcha_id:
 *                       type: string
 *                       description: 验证码ID
 *                       example: "550e8400-e29b-41d4-a716-446655440000"
 *                     bg_url:
 *                       type: string
 *                       description: 背景图片URL
 *                       example: "https://example.com/bg.jpg"
 *                     puzzle_url:
 *                       type: string
 *                       description: 拼图图片URL
 *                       example: "https://example.com/puzzle.jpg"
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
 *                   example: 服务器内部错误
 *                 data:
 *                   type: null
 *                   example: null
 */
router.get('/captcha', authController.getCaptcha);

/**
 * @swagger
 * /api/v1/auth/check:
 *   get:
 *     tags:
 *       - Auth
 *     summary: 检查用户登录状态 [需要认证]
 *     description: | 
 *       检查当前用户的登录状态，支持两种使用方式：
 *       
 *       1. **标准模式**：不传任何参数，使用默认JWT密钥验证token
 *       2. **SSO模式**：通过query参数app传递应用ID，使用应用统一密钥（client_secret / app_secret，兼容旧 salt）验证token
 *       
 *       **使用场景**：
 *       - 前端应用验证用户登录状态
 *       - 第三方系统验证SSO token有效性
 *       - 获取当前登录用户的详细信息
 *       
 *       **认证方式**：Bearer Token
 *       
 *       **响应说明**：
 *       - 200: 用户已登录，返回用户信息
 *       - 400: 无效的应用ID或SSO配置（仅SSO模式）
 *       - 401: 未登录或token无效
 *       - 500: 服务器内部错误
 *     parameters:
 *       - in: query
 *         name: app
 *         schema:
 *           type: string
 *           format: uuid
 *         required: false
 *         description: | 
 *           应用ID，用于SSO模式下的token验证
 *           
 *           **使用场景**：
 *           - 第三方系统需要验证特定应用的用户 SSO JWT
 *           - 使用应用统一密钥进行JWT验证
 *           
 *           **注意事项**：
 *           - 应用必须已启用SSO功能
 *           - 应用必须已生成统一密钥（密钥管理 / app_secret）
 *           - 不传此参数时使用默认JWT密钥验证
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 用户已登录
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
 *                     user_id:
 *                       type: string
 *                       description: 用户ID
 *                       example: "550e8400-e29b-41d4-a716-446655440000"
 *                     username:
 *                       type: string
 *                       description: 用户名
 *                       example: "admin"
 *                     name:
 *                       type: string
 *                       description: 姓名
 *                       example: "管理员"
 *                     avatar:
 *                       type: string
 *                       description: 头像URL
 *                       example: "https://example.com/avatar.jpg"
 *                     gender:
 *                       type: string
 *                       description: 性别
 *                       example: "MALE"
 *                     email:
 *                       type: string
 *                       description: 邮箱
 *                       example: "admin@example.com"
 *                     phone:
 *                       type: string
 *                       description: 手机号
 *                       example: "13800138000"
 *                     status:
 *                       type: string
 *                       description: 状态
 *                       example: "ACTIVE"
 *                     department_id:
 *                       type: string
 *                       description: 部门ID
 *                       example: "550e8400-e29b-41d4-a716-446655440000"
 *       400:
 *         description: 无效的应用ID或SSO配置
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
 *                   example: 无效的应用ID或SSO配置
 *                 data:
 *                   type: null
 *                   example: null
 *       401:
 *         description: 未登录或令牌无效
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 401
 *                 message:
 *                   type: string
 *                   example: 未提供认证令牌
 *                 data:
 *                   type: null
 *                   example: null
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
 *                   example: 服务器内部错误
 *                 data:
 *                   type: null
 *                   example: null
 */
router.get('/check', auth, authController.checkAuth);

module.exports = router; 