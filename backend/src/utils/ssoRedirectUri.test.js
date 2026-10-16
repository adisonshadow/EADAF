const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isPlatformDevMode,
  shouldUseDevRedirectUri,
  validateSsoRedirectUriConfig,
  resolveSsoRedirectUri,
} = require('./ssoRedirectUri');

const DEV_HTTP = { protocol: 'http', host: 'localhost:29527' };
const DEV_LAN = { protocol: 'http', host: '192.168.1.9:29527' };
const PROD_HTTPS = { protocol: 'https', host: 'uac.example.com' };

test('开发模式判定：只有明确的 development 才算，未设置按 development 处理', () => {
  assert.equal(isPlatformDevMode('development'), true);
  assert.equal(isPlatformDevMode('DEVELOPMENT'), true);
  assert.equal(isPlatformDevMode(undefined), true, '未设置 NODE_ENV 时与 config 一致按 development');
  assert.equal(isPlatformDevMode('development '), true, '大小写/空格不影响');
  assert.equal(isPlatformDevMode('production'), false);
  assert.equal(isPlatformDevMode('staging'), false, '非 production 也一律用默认重定向，避免误跳到开发机');
});

test('未启用 DEV 重定向时，永远用默认地址（开发模式也一样）', () => {
  const ssoConfig = {
    redirect_uri: 'https://fpcu.example.com/auth/callback',
    redirect_uri_dev_enabled: false,
    redirect_uri_dev: 'http://localhost:13303/auth/callback',
  };
  assert.equal(isPlatformDevMode('development') && resolveSsoRedirectUri(ssoConfig, DEV_HTTP), ssoConfig.redirect_uri);
  assert.equal(resolveSsoRedirectUri(ssoConfig, DEV_HTTP, { isDevMode: true }), ssoConfig.redirect_uri);
});

test('启用 DEV 重定向 + 开发模式：走 DEV 地址', () => {
  const ssoConfig = {
    redirect_uri: 'https://fpcu.example.com/auth/callback',
    redirect_uri_dev_enabled: true,
    redirect_uri_dev: 'http://localhost:13303/auth/callback',
  };
  assert.equal(
    resolveSsoRedirectUri(ssoConfig, DEV_HTTP, { isDevMode: true }),
    'http://localhost:13303/auth/callback',
  );
  assert.equal(shouldUseDevRedirectUri(ssoConfig, { isDevMode: true }), true);
});

test('启用 DEV 重定向 + 部署环境：仍走默认地址', () => {
  const ssoConfig = {
    redirect_uri: 'https://fpcu.example.com/auth/callback',
    redirect_uri_dev_enabled: true,
    redirect_uri_dev: 'http://localhost:13303/auth/callback',
  };
  assert.equal(
    resolveSsoRedirectUri(ssoConfig, PROD_HTTPS, { isDevMode: false }),
    'https://fpcu.example.com/auth/callback',
  );
  assert.equal(shouldUseDevRedirectUri(ssoConfig, { isDevMode: false }), false);
});

test('DEV 地址留空时回落到默认地址（不把登录跳丢）', () => {
  const ssoConfig = {
    redirect_uri: 'https://fpcu.example.com/auth/callback',
    redirect_uri_dev_enabled: true,
    redirect_uri_dev: '   ',
  };
  assert.equal(
    resolveSsoRedirectUri(ssoConfig, DEV_HTTP, { isDevMode: true }),
    'https://fpcu.example.com/auth/callback',
  );
});

test('两套地址各自带着「自动跟随本系统域名/IP」开关', () => {
  const ssoConfig = {
    redirect_uri: ':13303/auth/callback',
    redirect_uri_use_system_host: true,
    redirect_uri_dev_enabled: true,
    redirect_uri_dev: ':14400/auth/callback',
    redirect_uri_dev_use_system_host: true,
  };
  assert.equal(
    resolveSsoRedirectUri(ssoConfig, DEV_HTTP, { isDevMode: true }),
    'http://localhost:14400/auth/callback',
  );
  assert.equal(
    resolveSsoRedirectUri(ssoConfig, DEV_LAN, { isDevMode: true }),
    'http://192.168.1.9:14400/auth/callback',
  );
  assert.equal(
    resolveSsoRedirectUri(ssoConfig, DEV_LAN, { isDevMode: false }),
    'http://192.168.1.9:13303/auth/callback',
  );
});

test('DEV 地址填完整域名、默认地址跟随本机时，各按各的规则拼', () => {
  const ssoConfig = {
    redirect_uri: '/auth/callback',
    redirect_uri_use_system_host: true,
    redirect_uri_dev_enabled: true,
    redirect_uri_dev: 'http://127.0.0.1:13303/auth/callback',
  };
  assert.equal(
    resolveSsoRedirectUri(ssoConfig, PROD_HTTPS, { isDevMode: true }),
    'http://127.0.0.1:13303/auth/callback',
  );
  assert.equal(
    resolveSsoRedirectUri(ssoConfig, PROD_HTTPS, { isDevMode: false }),
    'https://uac.example.com/auth/callback',
  );
});

test('默认地址的解析行为保持不变（回归）', () => {
  assert.equal(resolveSsoRedirectUri({ redirect_uri: ' https://a.example.com/cb ' }), 'https://a.example.com/cb');
  assert.equal(resolveSsoRedirectUri({}), '');
  assert.equal(
    resolveSsoRedirectUri({ redirect_uri: ':13303/auth/callback', redirect_uri_use_system_host: true }, DEV_HTTP),
    'http://localhost:13303/auth/callback',
  );
  assert.equal(
    resolveSsoRedirectUri({ redirect_uri: '/auth/callback', redirect_uri_use_system_host: true }, PROD_HTTPS),
    'https://uac.example.com/auth/callback',
  );
});

test('校验：默认地址规则不变', () => {
  assert.deepEqual(validateSsoRedirectUriConfig({}), { ok: false, message: 'SSO回调地址不能为空' });
  assert.deepEqual(validateSsoRedirectUriConfig({ redirect_uri: 'not-a-url' }), {
    ok: false,
    message: 'SSO回调地址格式不正确',
  });
  assert.deepEqual(validateSsoRedirectUriConfig({ redirect_uri: 'https://a.example.com/cb' }), { ok: true });
  assert.equal(
    validateSsoRedirectUriConfig({ redirect_uri: 'a.example.com/cb', redirect_uri_use_system_host: true }).ok,
    false,
  );
  assert.deepEqual(
    validateSsoRedirectUriConfig({ redirect_uri: ':13303/auth/callback', redirect_uri_use_system_host: true }),
    { ok: true },
  );
});

test('校验：启用 DEV 重定向时 DEV 地址必填且要合格式', () => {
  const base = {
    redirect_uri: 'https://fpcu.example.com/auth/callback',
    redirect_uri_dev_enabled: true,
  };
  const empty = validateSsoRedirectUriConfig(base);
  assert.equal(empty.ok, false);
  assert.match(empty.message, /DEV 专用重定向 URI/);

  const bad = validateSsoRedirectUriConfig({ ...base, redirect_uri_dev: 'localhost:13303/auth/callback' });
  assert.equal(bad.ok, false);
  assert.equal(bad.message, 'DEV 专用重定向 URI 格式不正确');

  assert.deepEqual(
    validateSsoRedirectUriConfig({ ...base, redirect_uri_dev: 'http://localhost:13303/auth/callback' }),
    { ok: true },
  );
});

test('校验：DEV 行勾了跟随本机时必须填后缀，没勾则必须填完整地址', () => {
  const base = {
    redirect_uri: 'https://fpcu.example.com/auth/callback',
    redirect_uri_dev_enabled: true,
    redirect_uri_dev_use_system_host: true,
  };
  assert.equal(validateSsoRedirectUriConfig({ ...base, redirect_uri_dev: 'http://x.com/cb' }).ok, false);
  assert.deepEqual(validateSsoRedirectUriConfig({ ...base, redirect_uri_dev: ':13303/auth/callback' }), { ok: true });
  assert.deepEqual(validateSsoRedirectUriConfig({ ...base, redirect_uri_dev: '/auth/callback' }), { ok: true });
});

test('校验：没启用 DEV 重定向时不校验残留的 DEV 值', () => {
  assert.deepEqual(
    validateSsoRedirectUriConfig({
      redirect_uri: 'https://fpcu.example.com/auth/callback',
      redirect_uri_dev_enabled: false,
      redirect_uri_dev: '半截没填完的东西',
    }),
    { ok: true },
  );
});
