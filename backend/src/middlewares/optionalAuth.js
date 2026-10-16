const auth = require('./auth');

/**
 * 可选认证：带了有效令牌就注入 `ctx.state.user`（同 auth 中间件的全部校验，
 * 含会话撤销检查）；令牌缺失或无效则**放行**，不返回 401。
 *
 * 用途：登出 / 退出所有设备这类接口 —— 令牌过期时也必须能完成登出，
 * 但令牌有效时要能确认"当前是谁"（撤销哪个用户、哪个会话）。
 */
module.exports = async (ctx, next) => {
  if (!ctx.headers.authorization) return next();

  // 先记录响应现场：auth 失败时会写 401，这里要还原后继续走
  const beforeStatus = ctx.status;
  const beforeBody = ctx.body;

  let authenticated = false;
  await auth(ctx, async () => {
    authenticated = true;
  });

  if (authenticated) return next();

  ctx.status = beforeStatus;
  ctx.body = beforeBody;
  return next();
};
