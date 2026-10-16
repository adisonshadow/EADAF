const Router = require('koa-router');
const auth = require('../middlewares/auth');
const OAuthController = require('../controllers/oauthController');

const router = new Router({ prefix: '/api/v1/oauth' });

/**
 * @swagger
 * /api/v1/oauth/authorize:
 *   post:
 *     tags: [OAuth]
 *     summary: 登记授权码（管理台前端已登录后调用）[需要认证]
 *     description: |
 *       校验 `client_id`（应用）/`redirect_uri`（必须与应用登记的回调**完全一致**）/
 *       `response_type=code`/PKCE，登记一次性授权码（Redis，120s）。
 *       返回后由管理台前端 302 到 `redirect_uri?code=...&state=...`。
 *       本平台没有 IdP Cookie，所以授权端点由已登录的管理台前端发起（它能证明"当前是谁"）。
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [client_id, redirect_uri]
 *             properties:
 *               client_id: { type: string, format: uuid }
 *               redirect_uri: { type: string }
 *               response_type: { type: string, example: code }
 *               state: { type: string }
 *               scope: { type: string, example: 'openid profile' }
 *               nonce: { type: string }
 *               code_challenge: { type: string }
 *               code_challenge_method: { type: string, enum: [S256, plain] }
 *     responses:
 *       200:
 *         description: 已登记授权码
 *       400:
 *         description: invalid_client / invalid_request / unsupported_response_type
 *       503:
 *         description: 授权码存储（Redis）不可用
 * /api/v1/oauth/token:
 *   post:
 *     tags: [OAuth]
 *     summary: 换票（authorization_code / refresh_token）
 *     description: |
 *       BFF 服务端调用，返回标准 OAuth 扁平结构（`access_token`/`token_type`/`expires_in`/
 *       `refresh_token`/`id_token`），**不套**平台 `{code,message,data}` 信封。
 *       客户端认证支持 `client_secret_post` 与 `client_secret_basic`。
 *       `authorization_code` 需带 `code_verifier`（若授权时用了 PKCE）。
 *     responses:
 *       200:
 *         description: 令牌
 *       400:
 *         description: invalid_grant / invalid_request / unsupported_grant_type
 *       401:
 *         description: invalid_client
 */
router.post('/authorize', auth, OAuthController.authorize);
router.post('/token', OAuthController.token);

module.exports = router;
