/**
 * SSO 登录是否要求「人类验证」（滑块）
 *
 * 默认沿用平台全局开关 `config.api.loginVerify.enabled`；
 * 应用可在自己的 `sso_config.login_verify_enabled` 上按需关闭。
 *
 * 为什么放在应用维度：有些是内部应用、访问者本身就是可信员工，客户明确认为
 * 登录页再滑一次没有必要。关掉的只是"人类验证"这一步，密码校验与登录失败
 * 次数限制照旧，不降低这几道防线。
 *
 * 取值语义（与前端表单的三态一致）：
 *   false  → 该应用不需要人类验证
 *   true   → 强制需要（即使平台全局关掉）
 *   未设置 → 跟随平台全局开关
 */
const Application = require('../models/application');
const config = require('../config');

function parseTriState(value) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return null;
}

/** 纯逻辑：应用级设置如何覆盖全局开关 */
function resolveLoginVerifyEnabled({ appFlag, globalFlag = true } = {}) {
  const app = parseTriState(appFlag);
  if (app !== null) return app;
  return globalFlag !== false;
}

/**
 * 查库判定该应用是否要求人类验证。
 * 不传 applicationId、应用查不到或已停用时，一律按全局开关处理。
 */
async function isLoginVerifyRequired(applicationId) {
  const globalFlag = config.api?.loginVerify?.enabled !== false;
  if (!applicationId) return globalFlag;
  try {
    const application = await Application.findOne({
      where: { application_id: applicationId, status: 'ACTIVE' },
      attributes: ['sso_config'],
    });
    if (!application || !application.sso_config) return globalFlag;
    return resolveLoginVerifyEnabled({
      appFlag: application.sso_config.login_verify_enabled,
      globalFlag,
    });
  } catch {
    // 查库异常不放开校验：按全局开关走，避免"读不到配置就免验证"
    return globalFlag;
  }
}

module.exports = { resolveLoginVerifyEnabled, isLoginVerifyRequired, parseTriState };
