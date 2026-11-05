const Router = require('koa-router');
const AiServiceController = require('../controllers/aiServiceController');
const AiCapabilityController = require('../controllers/aiCapabilityController');
const SkillController = require('../controllers/skillController');
const auth = require('../middlewares/auth');
const authWithBuiltinApiGuard = require('../middlewares/withBuiltinApiGuard');

const router = new Router({
  prefix: '/api/v1/ai'
});

/**
 * @swagger
 * components:
 *   schemas:
 *     ModelInfo:
 *       type: object
 *       properties:
 *         slug:
 *           type: string
 *           example: deepseek-chat
 *         displayName:
 *           type: string
 *           example: DeepSeek Chat
 *         capabilities:
 *           type: array
 *           items:
 *             type: string
 *         inputTags:
 *           type: array
 *           items:
 *             type: string
 *         outputTags:
 *           type: array
 *           items:
 *             type: string
 *         defaultParams:
 *           type: object
 *         providerId:
 *           type: string
 *           format: uuid
 *           description: 所属服务商。浏览器保存 API Key 时，前端用它在本机取出密钥
 *         apiKeyStorage:
 *           type: string
 *           enum: [database, browser]
 *           description: browser 表示该服务商的 API Key 不在数据库，调用时由 body.providerApiKey 带上
 *     AIBaseErrorResponse:
 *       type: object
 *       properties:
 *         error:
 *           type: object
 *           properties:
 *             code:
 *               type: string
 *               example: MODEL_NOT_FOUND
 *             message:
 *               type: string
 *             traceId:
 *               type: string
 *               format: uuid
 */

/**
 * @swagger
 * /api/v1/ai/models:
 *   get:
 *     tags:
 *       - AI-Service
 *     summary: 获取可用 AI 模型列表 [需要认证]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 获取成功，body.data 为可用模型列表（无 code/message 外壳）
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeAiPublicModels'
 */
router.get('/models', authWithBuiltinApiGuard, AiServiceController.listModels);

/**
 * @swagger
 * /api/v1/ai/chat/completions:
 *   post:
 *     tags:
 *       - AI-Service
 *     summary: OpenAI 兼容对话接口 [需要认证]
 *     description: 通过 slug 或 modelId 路由到已注册模型，支持流式 SSE
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Eadaf-Provider-Api-Key
 *         schema:
 *           type: string
 *         description: 可选。与 body.providerApiKey 二选一，仅 apiKeyStorage=browser 时生效，服务端不落库
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [messages]
 *             properties:
 *               slug:
 *                 type: string
 *                 example: deepseek-chat
 *               modelId:
 *                 type: string
 *                 format: uuid
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *               stream:
 *                 type: boolean
 *                 default: false
 *               temperature:
 *                 type: number
 *               max_tokens:
 *                 type: integer
 *               tools:
 *                 type: array
 *                 items:
 *                   type: object
 *               providerApiKey:
 *                 type: string
 *                 description: 仅当模型所属服务商 apiKeyStorage=browser 时使用。密钥只存在调用方浏览器，服务端不落库、不写给上游；database 模式忽略
 *     responses:
 *       200:
 *         description: 对话成功（非流式返回 OpenAI JSON，流式返回 text/event-stream）
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OpenAIChatCompletion'
 *           text/event-stream:
 *             schema:
 *               type: string
 *               description: SSE 流式 chunk
 *       400:
 *         description: 请求无效或能力不匹配
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AIBaseErrorResponse'
 *       404:
 *         description: 模型不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AIBaseErrorResponse'
 */
router.post('/chat/completions', authWithBuiltinApiGuard, AiServiceController.chatCompletions);

/**
 * @swagger
 * /api/v1/ai/capabilities:
 *   get:
 *     tags: [AI-Service]
 *     summary: 获取 AIBase 能力清单 [需要认证]
 *     description: 返回 scopes、skills、tools 等能力元数据。skills 仅在传入 applicationId 时返回（全局 + 绑定该应用的专用 Skill）；传入 applicationId 时若应用配置了顶层 Skill，则在 topLevelSkill 字段返回
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: scopeSlug
 *         schema: { type: string }
 *         description: 预留参数，当前 Skill 过滤以 applicationId 为准
 *       - in: query
 *         name: applicationId
 *         schema: { type: string, format: uuid }
 *         description: 应用系统 ID；传入后返回全局 Skill 与绑定该应用的专用 Skill
 *     responses:
 *       200:
 *         description: 获取成功，body.data 含 scopes/skills/tools/topLevelSkill
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeAiCapabilities'
 */
router.get('/capabilities', authWithBuiltinApiGuard, AiCapabilityController.getCapabilities);

/**
 * @swagger
 * /api/v1/ai/scopes/{slug}/tools:
 *   get:
 *     tags: [AI-Service]
 *     summary: 获取 Scope 下 Tool 列表 [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 获取成功，body.data.scope 与 tools（含 openaiTool）
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeAiScopeTools'
 */
router.get('/scopes/:slug/tools', authWithBuiltinApiGuard, AiCapabilityController.getScopeTools);

/**
 * @swagger
 * /api/v1/ai/skills:
 *   get:
 *     tags: [AI-Service]
 *     summary: 批量获取 Skill 详情（含 Tool 列表） [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: slugs
 *         required: true
 *         schema: { type: string }
 *         description: 逗号分隔的 slug 列表，单次最多 50 个
 *     responses:
 *       200:
 *         description: 获取成功，body.data 为 Skill 数组（含 tools / openaiTools）
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeAiPublicSkillList'
 *       304:
 *         description: 未修改（命中 If-None-Match）
 */
// 注意：必须放在 /skills/:slug 之前，避免该动态路由拦截批量请求
router.get('/skills', authWithBuiltinApiGuard, SkillController.getPublicBySlugs);

/**
 * @swagger
 * /api/v1/ai/skills/{slug}:
 *   get:
 *     tags: [AI-Service]
 *     summary: 获取 Skill 详情（含 Tool 列表） [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 获取成功，body.data 为单个 Skill（含 tools / openaiTools）
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeAiPublicSkill'
 *       304:
 *         description: 未修改（命中 If-None-Match）
 */
router.get('/skills/:slug', authWithBuiltinApiGuard, SkillController.getPublicBySlug);

/**
 * @swagger
 * /api/v1/ai/tools/invoke:
 *   post:
 *     tags: [AI-Service]
 *     summary: 执行 Server Tool [需要认证]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [functionName]
 *             properties:
 *               functionName: { type: string, description: 'Tool functionName；请求头可带 X-AIBase-TurnId 关联 turn 审计' }
 *               arguments: { type: object }
 *     responses:
 *       200:
 *         description: 执行成功，body.data 为 Tool 返回值
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeAiToolInvoke'
 */
router.post('/tools/invoke', authWithBuiltinApiGuard, AiCapabilityController.invokeTool);

/**
 * @swagger
 * /api/v1/ai/http-request:
 *   post:
 *     tags: [AI-Service]
 *     summary: 公共 HTTP 请求（类 curl）[需要认证]
 *     description: |
 *       与 Tool `http_request` 同一实现。
 *       相对路径或受信主机自动注入当前用户 JWT；外部 URL 不带用户 JWT。
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url]
 *             properties:
 *               method: { type: string, example: GET }
 *               url: { type: string, example: /api/v1/ai/models }
 *               headers: { type: object }
 *               body: {}
 *               timeoutMs: { type: integer, example: 15000 }
 *     responses:
 *       200:
 *         description: 请求完成（含目标 HTTP status），body.data 见 AiHttpRequestResult
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeAiHttpRequest'
 *       400:
 *         description: 参数错误或缺少用户 token
 */
router.post('/http-request', authWithBuiltinApiGuard, AiCapabilityController.httpRequest);

/**
 * @swagger
 * /api/v1/ai/tool-invoke-logs:
 *   post:
 *     tags: [AI-Service]
 *     summary: 记录 Client Tool 失败/未验证调用日志 [需要认证]
 *     description: |
 *       供前端 Client Tool 失败/未验证时落盘。默认关闭（AI_TOOL_INVOKE_LOG_ENABLED=false 时直接 200 且不写文件）。
 *       前端需显式 AI_TOOL_LOG_ENABLED=true 才会 POST，避免开发态代理 502 刷屏。
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               args: { type: object }
 *               envelope: { type: object }
 *               error: { type: string }
 *               durationMs: { type: integer }
 *               conversationKey: { type: string }
 *               turnId: { type: string }
 *               round: { type: integer }
 *               result: { description: 可截断的结果预览 }
 *     responses:
 *       200:
 *         description: 记录成功或日志未启用，data.logged 表示是否落盘
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EnvelopeAiToolInvokeLog'
 */
router.post('/tool-invoke-logs', authWithBuiltinApiGuard, AiCapabilityController.logClientToolInvoke);

module.exports = router;
