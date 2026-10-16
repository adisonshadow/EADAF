const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const config = require('../config');
const { resolveSsoSigningSecret, hasSsoSigningSecret } = require('../utils/ssoSecret');
const { resolveSsoRedirectUri, requestHostInfo, isPlatformDevMode, isAllowedPostLogoutRedirect } = require('../utils/ssoRedirectUri');
const ssoSession = require('../utils/ssoSession');
const refreshRotation = require('../services/sso/refreshRotation');

const { isLoginVerifyRequired } = require('../utils/ssoLoginVerify');
const logger = require('../utils/logger');
const User = require('../models/user');
const Role = require('../models/role');
const Captcha = require('../models/captcha');
const LoginAttempt = require('../models/loginAttempt');
const RefreshToken = require('../models/refreshToken');
const { CustomValidationError, UnauthorizedError, ValidationError: _ValidationError, AuthenticationError: _AuthenticationError } = require('../utils/errors');
const Application = require('../models/application');

let _emitHookEvent = null;
/** 延迟加载钩子事件分发器（避免加载顺序依赖；失败静默） */
function emitHookEvent(type, payload) {
  try {
    if (_emitHookEvent === null) {
      try {
        _emitHookEvent = require('../services/automation/eventDispatcher').emit;
      } catch {
        _emitHookEvent = false;
      }
    }
    if (_emitHookEvent) _emitHookEvent(type, payload);
  } catch (e) {
    logger.warn('认证事件分发失败（不影响登录/登出）', { type, error: e.message });
  }
}
 
class AuthController {
  /**
   * 用户登录 
   */
  static async login(ctx) {
    const { username, password, captcha_data, application_id, dev } = ctx.request.body;
    const captcha_id = captcha_data?.captcha_id;

    try {
      logger.debug('User login attempt', { username, application_id, dev });
      
      if (!username || !password) {
        const error = new CustomValidationError('用户名和密码不能为空');
        error.status = 400;
        throw error;
      }

      // 开发环境下的 dev 模式，跳过验证码和登录限制检查
      const isDevMode = dev && process.env.NODE_ENV === 'development';

      // 该应用是否需要「人类验证」（滑块）：应用可在 sso_config.login_verify_enabled 上关闭，
      // 未设置时跟随平台全局开关。只免掉滑块，密码校验与失败次数限制照旧。
      const loginVerifyRequired = await isLoginVerifyRequired(application_id);

      if (!isDevMode) {
        // 检查是否需要验证码
        if (config.api.loginVerify.enabled && loginVerifyRequired) {
          // 如果没有提供验证码ID，返回需要验证码的响应
          if (!captcha_id) {
            ctx.status = 202;
            ctx.body = {
              code: 202,
              message: '需要验证码',
              data: {
                need_captcha: true
              }
            };
            return;
          }

          // 验证验证码
          const captcha = await Captcha.findOne({
            where: {
              captcha_id,
              status: 'USED',
              verified_at: {
                [Op.not]: null
              }
            }
          });

          if (!captcha) {
            ctx.status = 400;
            ctx.body = {
              code: 400,
              message: '验证码无效或未验证',
              data: null
            };
            return;
          }

          // 验证通过后删除验证码记录
          await captcha.destroy();
          logger.debug('Captcha record deleted after successful verification', { captcha_id });
        }

        // 检查登录限制
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        // 先查找用户
        const user = await User.findOne({
          where: { username },
          attributes: ['user_id', 'username', 'password_hash', 'status', 'deleted_at'],
          paranoid: false  // 包括已删除的记录
        });

        // 如果用户存在，检查登录限制
        if (user) {
          const recentAttempts = await LoginAttempt.count({
            where: {
              user_id: user.user_id,
              attempt_time: {
                [Op.gte]: oneHourAgo
              },
              success: false
            }
          });

          if (recentAttempts >= 5) {
            const nextAttemptTime = new Date(Date.now() + 60 * 60 * 1000);
            ctx.status = 429;
            ctx.body = {
              code: 429,
              message: '登录失败次数过多，请一小时后重试',
              data: {
                next_attempt_time: nextAttemptTime.toISOString()
              }
            };
            return;
          }
        }

        // 仅在用户存在时记录登录尝试（user_id 非空约束；未知用户名不落库）
        if (user) {
          await LoginAttempt.create({
            user_id: user.user_id,
            ip_address: ctx.ip,
            user_agent: ctx.headers['user-agent'],
            success: false
          });
        }
      }

      // 查找用户
      const user = await User.findOne({
        where: { username },
        attributes: ['user_id', 'username', 'password_hash', 'status', 'deleted_at'],
        paranoid: false  // 包括已删除的记录
      });

      if (!user) {
        const error = new UnauthorizedError('用户名或密码错误');
        error.status = 400;
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: error.message,
          data: null
        };
        return;
      }

      // 检查用户是否被软删除
      if (user.deleted_at) {
        const error = new UnauthorizedError('用户已经被删除');
        error.status = 400;
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: error.message,
          data: null
        };
        return;
      }

      if (user.status !== 'ACTIVE') {
        const error = new UnauthorizedError('用户已被禁用');
        error.status = 403;
        ctx.status = 403;
        ctx.body = {
          code: 403,
          message: error.message,
          data: null
        };
        return;
      }

      // 验证密码
      const isValid = await bcrypt.compare(password, user.password_hash);
      logger.debug('Password validation', { isValid });

      // 如果不是 dev 模式，更新登录尝试的成功状态
      if (!isDevMode && isValid) {
        await LoginAttempt.update(
          { success: true },
          {
            where: {
              user_id: user.user_id,
              ip_address: ctx.ip,
              success: false
            },
            order: [['created_at', 'DESC']],
            limit: 1
          }
        );
      }

      if (!isValid) {
        const error = new UnauthorizedError('用户名或密码错误');
        error.status = 401;
        ctx.status = 401;
        ctx.body = {
          code: 401,
          message: error.message,
          data: null
        };
        return;
      }

      logger.debug('User logged in successfully', { username, isDevMode });

      // 如果提供了 application_id，获取应用的 SSO 配置
      let jwtSecret = config.api.security.jwtSecret;
      let application = null;
      // 用应用密钥签发时把 application_id 写进令牌：验签端据此选密钥，
      // 请求就不必再依赖 URL 上的 ?app=（漏带会 401，业务应用表现为「一调后端就掉登录」）
      let tokenAppId = null;
      
      if (application_id) {
        application = await Application.findOne({
          where: {
            application_id,
            status: 'ACTIVE',
            sso_enabled: true
          }
        });

        if (application) {
          const signingSecret = resolveSsoSigningSecret(application);
          if (signingSecret) {
            jwtSecret = signingSecret;
            tokenAppId = application.application_id;
            logger.debug('Using SSO app secret as JWT secret', { application_id });
          }
        }
      }

      // 会话（sid）：同一浏览器复用同一个 sid —— 管理台与各业务应用的 SSO 登录都由
      // 管理台前端发起，它把 localStorage 里的 eadaf_sid 带进来，因此"该设备上所有应用"
      // 共用一个会话，登出时撤销它即可级联（见 docs/SSO会话与登出方案计划.md）
      const sid = await ssoSession.reuseOrCreateSession({
        requestedSid: ctx.request.body.sid,
        userId: user.user_id,
        applicationId: tokenAppId,
        platform: !tokenAppId,
        req: ctx,
      });

      // 生成访问令牌（带 sid：中间件每次请求校验会话是否已撤销）
      const token = jwt.sign(
        {
          user_id: user.user_id,
          username: user.username,
          ...(tokenAppId ? { application_id: tokenAppId } : {}),
          ...(sid ? { sid } : {}),
        },
        jwtSecret,
        { expiresIn: config.api.sso.accessTokenTtl }
      );
      
      // 生成刷新令牌（不透明随机串：JWT 同秒会签出同一串，且带声明会超 255 列宽；
      // sid/应用的映射放 Redis，见 utils/ssoSession）
      const refreshToken = ssoSession.newRefreshToken();

      // 保存刷新令牌到数据库
      await RefreshToken.create({
        user_id: user.user_id,
        token: refreshToken,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7天后过期
        status: 'ACTIVE'
      });

      // 会话 ↔ 刷新令牌双向可达：刷新/登出时不必依赖（可能已过期的）access token
      await ssoSession.bindRefreshToken(refreshToken, {
        sid,
        userId: user.user_id,
        applicationId: tokenAppId,
      });

      // 准备返回数据
      const fullUser = await User.findByPk(user.user_id, {
        attributes: ['user_id', 'must_change_password', 'email'],
      });

      const responseData = {
        token: token,
        refresh_token: refreshToken,
        // expires_in 按 OAuth 约定给秒数（不是 '15m' 这种人类可读串）
        expires_in: ssoSession.parseDurationToSeconds(config.api.sso.accessTokenTtl, 900),
        user_id: user.user_id,
        must_change_password: !!fullUser?.must_change_password,
        // 会话 ID：调用方（管理台前端）保存下来，下次登录/登出带上，实现"同设备共用一个会话"
        ...(sid ? { sid } : {}),
      };

      // 如果找到了应用，添加SSO配置到响应中
      if (application && application.sso_config) {
        // 获取跳转模式，默认为POST_REDIRECT（POST跳转）
        const redirectMode = application.sso_config.redirect_mode !== undefined
          ? application.sso_config.redirect_mode
          : config.api.sso.redirectMode.default;
        // 平台跑在开发模式且应用配了 DEV 重定向时，这里返回的就是开发用的地址
        const resolvedRedirectUri = resolveSsoRedirectUri(
          application.sso_config,
          requestHostInfo(ctx),
          { isDevMode: isPlatformDevMode() },
        );

        responseData.sso = {
          application_id: application.application_id,
          application_name: application.name,
          application_code: application.code,
          sso_config: {
            ...application.sso_config,
            // 显式回传本次登录是否要求人类验证，登录页据此决定弹不弹滑块
            login_verify_enabled: loginVerifyRequired,
            redirect_mode: redirectMode,
            redirect_uri: resolvedRedirectUri,
          }
        };

        // 如果是HEADER_REDIRECT模式，在响应中标记需要302重定向
        if (redirectMode === 'HEADER_REDIRECT') {
          responseData.sso.redirect_mode = 'HEADER_REDIRECT';
          responseData.sso.redirect_uri = resolvedRedirectUri;
          // 注意：JWT信息已经在token和refresh_token字段中返回，前端可以直接使用
        }
      }

      // 登录成功钩子事件（fire-and-forget，不阻塞响应）
      emitHookEvent('auth.user.login', {
        user_id: user.user_id,
        username: user.username,
        ip: ctx.ip,
        user_agent: ctx.headers['user-agent'] || null,
        login_at: new Date().toISOString(),
        application_id: application?.application_id || application_id || null,
      });

      // 登录时尚无 ctx.state.user，由控制器提供操作者
      ctx.state.auditContext = {
        resource_id: user.user_id,
        resource_name: user.username,
        target_user_id: user.user_id,
        operator: {
          operator_type: 'USER',
          operator_id: user.user_id,
          operator_name: user.username,
        },
      };

      // 登录成功
      ctx.status = 200;
      ctx.body = {
        code: 200,
        message: 'success',
        data: responseData
      };
    } catch (error) {
      logger.error('Error during login', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      
      // 确保错误对象有正确的属性
      if (!error.status) {
        error.status = 500;
      }
      
      throw error;
    }
  }
  /**
   * 刷新令牌
   */
  static async refreshToken(ctx) {
    const { refresh_token, app } = ctx.request.body;

    try {
      logger.debug('Refreshing token', { refresh_token, app });

      if (!refresh_token) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: '刷新令牌不能为空',
          data: null
        };
        return;
      }

      // 会话/应用信息：优先 Redis（刷新令牌 → sid + 应用），再回退 body 的 app。
      // 路由已不再要求有效 access token（访问令牌过期也能刷新），所以不能用 ctx.state 兜底。
      const boundInfo = await ssoSession.resolveRefreshToken(refresh_token);
      const sid = boundInfo?.sid || null;
      const refreshAppId = app || boundInfo?.application_id || null;

      // 会话已被撤销（登出/重放）：不再签发任何令牌
      if (sid && await ssoSession.isSessionRevoked(sid)) {
        ctx.status = 401;
        ctx.body = {
          code: 401,
          message: '会话已退出，请重新登录',
          error_code: 'SESSION_REVOKED',
          data: null
        };
        return;
      }

      let jwtSecret = config.api.security.jwtSecret;
      let tokenAppId = null;

      if (refreshAppId) {
        // 验证application_id并获取SSO签名密钥
        const application = await Application.findOne({
          where: {
            application_id: refreshAppId,
            status: 'ACTIVE',
            sso_enabled: true
          }
        });

        if (!application || !hasSsoSigningSecret(application)) {
          ctx.status = 400;
          ctx.body = {
            code: 400,
            message: '无效的应用ID或SSO配置',
            data: null
          };
          return;
        }

        jwtSecret = resolveSsoSigningSecret(application);
        tokenAppId = application.application_id;
        logger.debug('Using SSO app secret for token refresh', { application_id: refreshAppId });
      }

      // 轮换 + 重放检测统一在 services/sso/refreshRotation 里（与 /oauth/token 共用一份实现）
      const rotation = await refreshRotation.rotateRefreshToken({
        presentedToken: refresh_token,
        applicationIdHint: refreshAppId,
      });

      if (!rotation.ok) {
        ctx.status = rotation.status;
        ctx.body = {
          code: rotation.status,
          message: rotation.message,
          error_code: rotation.error_code,
          data: null
        };
        return;
      }

      const { user, sid: sessionId, newRefreshToken } = rotation;

      // 老流程用**应用密钥/HMAC** 签访问令牌（老应用本地验签的兼容窗口）；
      // 新流程（/oauth/token）用平台私钥 RS256 签，应用侧走 JWKS。
      const token = jwt.sign(
        {
          user_id: user.user_id,
          username: user.username,
          ...(tokenAppId ? { application_id: tokenAppId } : {}),
          ...(sessionId ? { sid: sessionId } : {}),
        },
        jwtSecret,
        { expiresIn: config.api.sso.accessTokenTtl }
      );

      ctx.status = 200;
      ctx.body = {
        code: 200,
        message: 'success',
        data: {
          token,
          refresh_token: newRefreshToken,
          // expires_in 按 OAuth 约定给秒数（不是 '15m' 这种人类可读串）
          expires_in: ssoSession.parseDurationToSeconds(config.api.sso.accessTokenTtl, 900),
          ...(sessionId ? { sid: sessionId } : {}),
        }
      };
    } catch (error) {
      logger.error('Error refreshing token', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });

      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '服务器内部错误',
        data: null
      };
    }
  }

  /**
   * 用户登出（撤销会话）
   *
   * 不再要求有效的 access token（令牌过期时也必须能登出），主体由刷新令牌/会话 ID 证明：
   *   - `refresh_token`：撤销这条刷新令牌 + 它所属会话；
   *   - `sid`：撤销该会话（管理台前端 localStorage 里的 eadaf_sid，覆盖该设备上所有应用）；
   *   - `all: true`：再撤销该用户的全部会话（退出所有设备）。
   */
  static async logout(ctx) {
    try {
      const { refresh_token, sid: bodySid, all } = ctx.request.body || {};

      let sid = bodySid || null;
      let userId = ctx.state?.user?.user_id || null;
      let username = ctx.state?.user?.username || null;

      // 有效令牌里也带 sid：没显式传 sid 时用它（该设备上的会话）
      if (!sid && ctx.state?.user?.sid) sid = ctx.state.user.sid;

      if (refresh_token) {
        // 使刷新令牌失效
        const tokenRecord = await RefreshToken.findOne({ where: { token: refresh_token } });
        if (tokenRecord) {
          userId = userId || tokenRecord.user_id;
          if (!sid) {
            const bound = await ssoSession.resolveRefreshToken(refresh_token);
            sid = bound?.sid || null;
          }
          await tokenRecord.update({ status: 'REVOKED' });
        }
      }

      // `all` 必须知道是谁：否则会"看起来成功、其实什么都没撤"
      if (all && !userId) {
        ctx.status = 401;
        ctx.body = {
          code: 401,
          message: '无法确认身份：退出所有设备需要携带有效令牌或刷新令牌',
          error_code: 'AUTH_MISSING',
          data: null,
        };
        return;
      }

      if (sid) {
        await ssoSession.revokeSession(sid, 'logout');
        logger.debug('已撤销 SSO 会话', { sid, user_id: userId });
      }

      let revokedAll = 0;
      if (all && userId) {
        revokedAll = await ssoSession.revokeAllSessions(userId, 'logout-all');
      }

      if (!username && userId) {
        const user = await User.findByPk(userId, { attributes: ['username'] });
        username = user?.username || null;
      }

      // 登出成功钩子事件（fire-and-forget，不阻塞响应）
      emitHookEvent('auth.user.logout', {
        user_id: userId,
        username,
        ip: ctx.ip,
        logout_at: new Date().toISOString(),
      });

      ctx.state.auditContext = {
        resource_id: userId,
        resource_name: username,
        target_user_id: userId,
      };

      ctx.body = {
        code: 200,
        message: '登出成功',
        data: {
          revoked_session: !!sid,
          ...(all ? { revoked_sessions: revokedAll } : {}),
        }
      };
    } catch (error) {
      logger.error('登出失败', { error: error.message });
      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '登出失败',
        error: error.message
      };
    }
  }

  /**
   * 当前用户的活跃会话（"登录设备"）
   */
  static async listSessions(ctx) {
    try {
      const userId = ctx.state.user?.user_id;
      const currentSid = ctx.state.user?.sid || null;
      const [sessions, available] = await Promise.all([
        ssoSession.listSessions(userId),
        ssoSession.isSessionStoreAvailable(),
      ]);

      ctx.body = {
        code: 200,
        message: 'success',
        data: {
          // Redis 不可用时列表必为空：明确告诉前端是"查不到"而不是"没有会话"
          store_available: available,
          items: sessions.map((item) => ({
            sid: item.sid,
            application_id: item.application_id || null,
            platform: item.platform === '1',
            ip: item.ip || null,
            user_agent: item.user_agent || null,
            created_at: item.created_at || null,
            last_seen_at: item.last_seen_at || null,
            current: item.sid === currentSid,
          })),
        },
      };
    } catch (error) {
      logger.error('获取登录设备列表失败', { error: error.message });
      ctx.status = 500;
      ctx.body = { code: 500, message: '获取登录设备列表失败', data: null };
    }
  }

  /**
   * 撤销指定会话（只能撤自己的）
   */
  static async revokeSession(ctx) {
    try {
      const { sid } = ctx.params;
      const userId = ctx.state.user?.user_id;
      const sessions = await ssoSession.listSessions(userId);

      if (!sessions.some((item) => item.sid === sid)) {
        ctx.status = 404;
        ctx.body = { code: 404, message: '会话不存在或不属于当前用户', data: null };
        return;
      }

      await ssoSession.revokeSession(sid, 'revoked-by-user');
      ctx.body = { code: 200, message: '已撤销该会话', data: { sid } };
    } catch (error) {
      logger.error('撤销会话失败', { error: error.message });
      ctx.status = 500;
      ctx.body = { code: 500, message: '撤销会话失败', data: null };
    }
  }

  /**
   * 撤销该用户全部会话（退出所有设备；含当前这一个，前端需回登录页）
   */
  static async revokeAllSessions(ctx) {
    try {
      const userId = ctx.state.user?.user_id;
      const revoked = await ssoSession.revokeAllSessions(userId, 'revoked-by-user');
      ctx.body = { code: 200, message: '已退出所有设备', data: { revoked_sessions: revoked } };
    } catch (error) {
      logger.error('退出所有设备失败', { error: error.message });
      ctx.status = 500;
      ctx.body = { code: 500, message: '退出所有设备失败', data: null };
    }
  }

  /**
   * 单点登出中转（RP-Initiated Logout 的最小实现）
   *
   * 浏览器侧先在管理台 `/auth/logout` 页面撤销 refresh 并清掉本地令牌，
   * 再跳到这里；本接口只做「回跳目标白名单校验 + state 回传 + logged_out 标记」后 302。
   *
   * 之所以不在这里撤令牌：Phase 0 的刷新令牌还在浏览器 localStorage 里，
   * 服务端拿不到；等 Phase 1 引入服务端会话（sid）后改为服务端直接撤销。
   *
   * GET /api/v1/auth/end-session?app=<application_id>&post_logout_redirect_uri=<url>&state=<opaque>
   */
  static async endSession(ctx) {
    const { app, post_logout_redirect_uri: postLogoutRedirect, state } = ctx.query;

    try {
      let target = null;

      if (app && postLogoutRedirect) {
        const application = await Application.findOne({
          where: {
            application_id: app,
            status: 'ACTIVE',
            sso_enabled: true,
          },
        });

        if (
          application
          && isAllowedPostLogoutRedirect(application.sso_config, postLogoutRedirect, requestHostInfo(ctx))
        ) {
          target = String(postLogoutRedirect).trim();
        } else {
          // 记下来但不把用户送过去：可能是配置写错，也可能是伪造的开放重定向尝试
          logger.warn('登出回跳目标未通过白名单校验', {
            app,
            post_logout_redirect_uri: postLogoutRedirect,
            ip: ctx.ip,
          });
        }
      }

      if (!target) {
        ctx.status = 400;
        ctx.body = {
          code: 400,
          message: '登出回跳地址无效：请携带合法的 app 与 post_logout_redirect_uri（该地址需与应用的 redirect_uri / frontend_url 同源）',
          data: null,
        };
        return;
      }

      const url = new URL(target);
      url.searchParams.set('logged_out', '1');
      if (state) url.searchParams.set('state', String(state));

      logger.debug('单点登出回跳', { app, target: url.origin });

      ctx.redirect(url.toString());
    } catch (error) {
      logger.error('单点登出中转失败', { error: error.message, app });
      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '单点登出中转失败',
        error: error.message,
      };
    }
  }

  // 生成验证码
  static async getCaptcha(ctx) {
    // 生成验证码逻辑（示例）
    const captcha = await Captcha.create({
      bg_url: 'https://example.com/bg.jpg',
      puzzle_url: 'https://example.com/puzzle.jpg',
      target_x: 100,
      target_y: 100,
      expires_at: new Date(Date.now() + 5 * 60 * 1000) // 5分钟过期
    });

    ctx.body = {
      code: 200,
      message: '验证码生成成功',
      data: {
        captcha_id: captcha.captcha_id,
        bg_url: captcha.bg_url,
        puzzle_url: captcha.puzzle_url
      }
    };
  }

  /**
   * 检查用户登录状态
   */
  static async checkAuth(ctx) {
    try {
      logger.debug('Checking auth status', { user: ctx.state.user });
      
      // 从 ctx.state.user 中获取用户信息（由 auth 中间件注入）
      const user = await User.findOne({
        where: {
          user_id: ctx.state.user.user_id,
          status: 'ACTIVE'
        },
        attributes: ['user_id', 'username', 'name', 'avatar', 'gender', 'email', 'phone', 'status', 'department_id', 'must_change_password'],
        include: [
          {
            model: Role,
            as: 'Roles',
            through: { attributes: [] },
            attributes: ['role_id', 'role_name', 'code'],
            required: false,
          },
        ],
      });

      if (!user) {
        logger.warn('User not found or DISABLED', { user_id: ctx.state.user.user_id });
        ctx.status = 401;
        ctx.body = {
          code: 401,
          message: '用户不存在或已被禁用',
          data: null
        };
        return;
      }

      // 展平角色信息（role_ids / role_codes），供前端按 access_restriction 过滤菜单/按钮可见性
      const roles = (user.Roles || []).map((r) => ({
        role_id: r.role_id,
        role_name: r.role_name,
        code: r.code,
      }));
      const userData = user.toJSON();
      userData.role_ids = roles.map((r) => String(r.role_id));
      userData.role_codes = roles.map((r) => r.code).filter(Boolean);
      userData.roles = roles;

      ctx.status = 200;
      ctx.body = {
        code: 200,
        message: 'success',
        data: userData
      };
    } catch (error) {
      logger.error('Error checking auth status', {
        name: error.name,
        message: error.message,
        stack: error.stack,
        user: ctx.state.user
      });
      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '服务器内部错误',
        data: null
      };
    }
  }

}

module.exports = AuthController; 