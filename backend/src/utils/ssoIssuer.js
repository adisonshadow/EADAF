/**
 * 平台 issuer：优先环境变量（多域名/反代场景显式固定），否则用本次请求的 origin。
 *
 * 令牌的 `iss`、OIDC 发现文档、back-channel logout token 都要用同一个值，
 * 所以单独抽出来，避免各处各写一遍导致"iss 不一致 → 本地验签老失败"。
 */
function issuerFromContext(ctx) {
  const configured = String(process.env.SSO_ISSUER || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (!ctx?.request) return '';
  return `${ctx.request.protocol}://${ctx.request.host}`;
}

module.exports = { issuerFromContext };
