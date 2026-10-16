/**
 * 自检：`node --import tsx src/utils/eadafAppParam.verify.ts`
 *
 * 锁住「SSO 用户 JWT 必须带 ?app=」这条不变量：
 * 漏带 → EADAF 用平台密钥验签 → 401 → 业务应用掉登录。
 */
import assert from 'node:assert/strict';
import { withEadafAppParam } from './eadafAppParam';

const APP = '1e71c653-630f-4006-b6df-081172b15752';
const OTHER = '10000000-0001-4000-8000-000000000006';

// 1) 无 query：补 ?app=
assert.equal(
  withEadafAppParam('/api/v1/ai/capabilities', APP),
  `/api/v1/ai/capabilities?app=${APP}`,
);

// 2) 已有 query：追加 &app=
assert.equal(
  withEadafAppParam('/api/v1/ai/skills?slugs=aibase-chat-framework', APP),
  `/api/v1/ai/skills?slugs=aibase-chat-framework&app=${APP}`,
);

// 3) 不改写已有 query（原样保留编码）
assert.equal(
  withEadafAppParam('/api/v1/ai/skills?slugs=a%2Cb&x=1', APP),
  `/api/v1/ai/skills?slugs=a%2Cb&x=1&app=${APP}`,
);

// 4) POST 端点（chat/completions）同样补参
assert.equal(
  withEadafAppParam('/api/v1/ai/chat/completions', APP),
  `/api/v1/ai/chat/completions?app=${APP}`,
);

// 5) 没配 applicationId：原样返回（平台会话 token 不需要 app）
assert.equal(withEadafAppParam('/api/v1/ai/capabilities'), '/api/v1/ai/capabilities');
assert.equal(withEadafAppParam('/api/v1/ai/capabilities', ''), '/api/v1/ai/capabilities');
assert.equal(withEadafAppParam('/api/v1/ai/capabilities', '   '), '/api/v1/ai/capabilities');

// 6) 调用方已显式指定 app：不覆盖
assert.equal(withEadafAppParam(`/api/v1/ai/capabilities?app=${OTHER}`, APP), `/api/v1/ai/capabilities?app=${OTHER}`);
assert.equal(withEadafAppParam(`/api/v1/ai/capabilities?x=1&app=${OTHER}`, APP), `/api/v1/ai/capabilities?x=1&app=${OTHER}`);

// 7) 带 hash 的 URL：参数进 query，不落到 hash 后面
assert.equal(
  withEadafAppParam('/api/v1/ai/capabilities#section', APP),
  `/api/v1/ai/capabilities?app=${APP}#section`,
);

// 8) 幂等：补过一次再补不会重复
const once = withEadafAppParam('/api/v1/ai/capabilities', APP);
assert.equal(withEadafAppParam(once, APP), once);

console.log('eadafAppParam.verify.ts ok：EADAF 请求会带上 ?app=<application_id>');
