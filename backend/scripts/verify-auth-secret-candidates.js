#!/usr/bin/env node
/**
 * 自检：`node scripts/verify-auth-secret-candidates.js`（无第三方依赖；因模型层加载会连一次库）
 *
 * 锁住「SSO 用户 JWT 与应用 Token 分别用哪把密钥验签」这条规则。
 * 过去只看 URL 上有没有 `?app=`：SSO 用户 JWT 用应用密钥签发、应用 Token 用平台密钥
 * 签发，客户端漏带 / 多带 `?app=` 都必然 401（现象：业务应用一发 EADAF 请求就掉登录）。
 */
const assert = require('node:assert/strict');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
const { buildSecretCandidates } = require('../src/middlewares/auth');

const PLATFORM = 'platform-secret';
const APP_A = { application: { application_id: 'app-a' }, secret: 'secret-a' };
const APP_B = { application: { application_id: 'app-b' }, secret: 'secret-b' };

const secretsOf = (input) => buildSecretCandidates(input).map((candidate) => candidate.secret);

// 1) SSO 用户 JWT（令牌自述 application_id）：应用密钥优先，平台密钥兜底
assert.deepEqual(
  secretsOf({ claimedApp: APP_A, platformSecret: PLATFORM }),
  ['secret-a', PLATFORM],
  'SSO 用户 JWT 应先用令牌自述的应用密钥验签',
);

// 2) 带 ?app=：显式声明的应用密钥优先
assert.deepEqual(
  secretsOf({ queryApp: APP_B, claimedApp: APP_A, platformSecret: PLATFORM }),
  ['secret-b', PLATFORM],
  '?app= 的应用密钥应优先',
);

// 3) 应用 Token（平台密钥签发，type=application）：平台密钥优先
assert.deepEqual(
  secretsOf({ claimedApp: APP_A, platformSecret: PLATFORM, isApplicationToken: true }),
  [PLATFORM, 'secret-a'],
  '应用 Token 应先用平台密钥验签',
);

// 4) 平台会话 token（无声明、无 app）：只有平台密钥
assert.deepEqual(secretsOf({ platformSecret: PLATFORM }), [PLATFORM]);

// 5) 声明解析不到应用（停用 / 未启用 SSO / 无密钥）：只留平台密钥，不产生空密钥候选
assert.deepEqual(secretsOf({ claimedApp: null, platformSecret: PLATFORM }), [PLATFORM]);

// 6) 去重：两把密钥相同时不重复验签（历史数据里应用密钥可能就是平台密钥）
assert.deepEqual(
  secretsOf({
    claimedApp: { application: { application_id: 'app-x' }, secret: PLATFORM },
    platformSecret: PLATFORM,
  }),
  [PLATFORM],
);

// 7) 保留 application 元信息（日志 / 后续按应用鉴权要用）
const candidates = buildSecretCandidates({ claimedApp: APP_A, platformSecret: PLATFORM });
assert.equal(candidates[0].application, APP_A.application);
assert.equal(candidates[1].application, null);

// 8) 带 ?app= 且该应用与平台密钥相同：仍然只有一把，且优先是应用候选
const dedupedByQuery = buildSecretCandidates({
  queryApp: { application: { application_id: 'app-y' }, secret: PLATFORM },
  platformSecret: PLATFORM,
});
assert.deepEqual(dedupedByQuery.map((c) => c.secret), [PLATFORM]);
assert.equal(dedupedByQuery[0].application.application_id, 'app-y');

console.log('verify-auth-secret-candidates ok：SSO 用户 JWT / 应用 Token 都能选对验签密钥');
