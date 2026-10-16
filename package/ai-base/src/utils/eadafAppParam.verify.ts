/**
 * 自检：`node --import tsx src/utils/eadafAppParam.verify.ts`
 *
 * 锁住两条不变量：
 *   1. SSO 用户 JWT（自带 application_id）调 EADAF 要带 `?app=`，否则平台密钥验签 → 401；
 *   2. **平台会话令牌不能被塞 `?app=`** —— EADAF 控制台的 AI 归属应用是内置应用
 *      （未启用 SSO），塞进去会被判成「无效的第三方应用认证」。
 */
import assert from 'node:assert/strict';
import {
  readTokenApplicationId,
  withEadafAppParam,
  withEadafAppParamForToken,
} from './eadafAppParam';

const APP = '1e71c653-630f-4006-b6df-081172b15752';
const OTHER = '10000000-0001-4000-8000-000000000006';

/** 造个假 JWT（自检不关心签名，只关心负载） */
const fakeJwt = (payload: Record<string, unknown>) => {
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.signature`;
};

const ssoToken = fakeJwt({ user_id: 'u1', username: 'admin', application_id: APP });
const platformToken = fakeJwt({ user_id: 'u1', username: 'admin' });
const applicationToken = fakeJwt({ application_id: APP, type: 'application' });

/* ------------------------- 1. 低层：URL 补参 ------------------------- */

assert.equal(
  withEadafAppParam('/api/v1/ai/capabilities', APP),
  `/api/v1/ai/capabilities?app=${APP}`,
);
assert.equal(
  withEadafAppParam('/api/v1/ai/skills?slugs=aibase-chat-framework', APP),
  `/api/v1/ai/skills?slugs=aibase-chat-framework&app=${APP}`,
);
assert.equal(
  withEadafAppParam('/api/v1/ai/skills?slugs=a%2Cb&x=1', APP),
  `/api/v1/ai/skills?slugs=a%2Cb&x=1&app=${APP}`,
);
assert.equal(withEadafAppParam('/api/v1/ai/chat/completions', APP), `/api/v1/ai/chat/completions?app=${APP}`);
assert.equal(withEadafAppParam('/api/v1/ai/capabilities'), '/api/v1/ai/capabilities');
assert.equal(withEadafAppParam('/api/v1/ai/capabilities', ''), '/api/v1/ai/capabilities');
assert.equal(withEadafAppParam('/api/v1/ai/capabilities', '   '), '/api/v1/ai/capabilities');
assert.equal(
  withEadafAppParam(`/api/v1/ai/capabilities?app=${OTHER}`, APP),
  `/api/v1/ai/capabilities?app=${OTHER}`,
);
assert.equal(
  withEadafAppParam('/api/v1/ai/capabilities#section', APP),
  `/api/v1/ai/capabilities?app=${APP}#section`,
);
const once = withEadafAppParam('/api/v1/ai/capabilities', APP);
assert.equal(withEadafAppParam(once, APP), once, '补参要幂等');

/* ------------------- 2. 从令牌读 application_id ------------------- */

assert.equal(readTokenApplicationId(ssoToken), APP);
assert.equal(readTokenApplicationId(applicationToken), APP, '应用 Token 同样自述 application_id');
assert.equal(readTokenApplicationId(platformToken), '', '平台会话令牌没有 application_id');
assert.equal(readTokenApplicationId('not-a-jwt'), '');
assert.equal(readTokenApplicationId(''), '');
assert.equal(readTokenApplicationId(null), '');
assert.equal(readTokenApplicationId(undefined), '');

/* ------------------- 3. 按令牌补参（真实调用路径） ------------------- */

assert.equal(
  withEadafAppParamForToken('/api/v1/ai/models', ssoToken),
  `/api/v1/ai/models?app=${APP}`,
  'SSO 用户 JWT 必须补 ?app=',
);
assert.equal(
  withEadafAppParamForToken('/api/v1/ai/capabilities?applicationId=' + OTHER, ssoToken),
  `/api/v1/ai/capabilities?applicationId=${OTHER}&app=${APP}`,
  'applicationId= 是 AI 归属参数，不能被当成 ?app=，也不能挡住真正的 ?app=',
);
assert.equal(
  withEadafAppParamForToken('/api/v1/ai/models', platformToken),
  '/api/v1/ai/models',
  '平台会话令牌（EADAF 控制台）不得补 ?app=，否则 401 无效的第三方应用认证',
);
assert.equal(withEadafAppParamForToken('/api/v1/ai/models', null), '/api/v1/ai/models');
assert.equal(withEadafAppParamForToken('/api/v1/ai/models', 'garbage'), '/api/v1/ai/models');

/* ---------- 4. 老令牌兜底：显式配置 ssoApplicationId（业务应用才配） ---------- */

assert.equal(
  withEadafAppParamForToken('/api/v1/ai/models', platformToken, APP),
  `/api/v1/ai/models?app=${APP}`,
  '老令牌（无声明）+ 显式 ssoApplicationId → 补 ?app=',
);
assert.equal(
  withEadafAppParamForToken('/api/v1/ai/models', ssoToken, OTHER),
  `/api/v1/ai/models?app=${APP}`,
  '令牌自述优先于显式配置',
);
assert.equal(
  withEadafAppParamForToken('/api/v1/ai/models', 'garbage', ''),
  '/api/v1/ai/models',
  '既没声明也没配置 → 不补（控制台场景，避免误塞内置应用）',
);

console.log('eadafAppParam.verify.ts ok：只有应用签发的令牌（或显式配置）才补 ?app=<application_id>');
