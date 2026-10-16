/**
 * 运行时可配（deployConfig）回归自检：
 *   node --import tsx src/config/deployConfig.verify.ts
 *
 * 锁住三件事：
 *   1. 解析优先级：runtime-config.js 注入 > 后端 /system/runtime-config > 构建期/代码兜底；
 *   2. 后端不可达时**不抛错**（用兜底值继续启动，不能让一次网络抖动把管理台打不开）；
 *   3. 关键值（存储桶 code、API 基址）确实会被运行时可配覆盖 —— 否则"同一产物跨环境部署"就是假的。
 */
import assert from 'node:assert/strict';

type FetchCall = { url: string; init?: RequestInit };

function installEnv(injected: unknown, serverResponse?: unknown, options: { fail?: boolean } = {}) {
  const calls: FetchCall[] = [];
  (globalThis as unknown as { window: unknown }).window = { __EADAF_DEPLOY__: injected };
  (globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (options.fail) throw new Error('network down');
    if (serverResponse === undefined) {
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({ code: 200, data: serverResponse }) } as unknown as Response;
  };
  return calls;
}

const mod = await import('./deployConfig');

// --- 1) 注入值优先于后端下发 ---
{
  const calls = installEnv({ apiBaseUrl: 'https://injected.example.com/', systemStorageBucketCode: 'from-inject' }, { systemStorageBucketCode: 'from-server' });
  const config = await mod.loadDeployConfig();
  assert.equal(config.systemStorageBucketCode, 'from-inject', '注入值应优先于后端下发');
  assert.equal(mod.resolveApiBaseUrl(''), 'https://injected.example.com', 'apiBaseUrl 应去掉末尾斜杠');
  assert.equal(calls.length, 1, '应只请求一次运行时接口');
  assert.ok(calls[0].url.endsWith('/api/v1/system/runtime-config'), `请求路径应为运行时接口：${calls[0]?.url}`);
  assert.ok(calls[0].url.startsWith('https://injected.example.com'), '跨域时应带上注入的基址去取运行时配置');
}

// --- 2) 没有注入值 → 用后端下发 ---
{
  installEnv({}, { systemStorageBucketCode: 'from-server', apiBaseUrl: 'https://server.example.com' });
  const config = await mod.loadDeployConfig();
  assert.equal(config.systemStorageBucketCode, 'from-server');
  assert.equal(mod.resolveApiBaseUrl(''), 'https://server.example.com');
  assert.equal(mod.getSystemStorageBucketCode(), 'from-server');
}

// --- 3) 后端不可达 → 不抛错，回落构建期/默认值 ---
{
  installEnv(undefined, undefined, { fail: true });
  const config = await mod.loadDeployConfig();
  assert.deepEqual(config, {}, '后端不可达时不应写入任何值');
  assert.equal(mod.getSystemStorageBucketCode(), 'eadaf-system', '应回落到默认桶 code');
  assert.equal(mod.getSystemStorageBucketCode('build-time'), 'build-time', '应回落到构建期注入值');
  assert.equal(mod.resolveApiBaseUrl('https://build.example.com/'), 'https://build.example.com', '构建期兜底也要规范化');
  assert.equal(mod.resolveApiBaseUrl(''), '', '同源部署应为空串（走相对路径）');
}

// --- 4) 只有注入、后端 404 时也要生效（纯静态部署场景） ---
{
  installEnv({ systemStorageBucketCode: 'static-only' });
  assert.equal(mod.getSystemStorageBucketCode(), 'eadaf-system', '加载前不应有值');
  await mod.loadDeployConfig();
  assert.equal(mod.getSystemStorageBucketCode(), 'static-only');
  assert.ok(mod.isDeployConfigLoaded(), '加载完成后应标记为已加载');
}

console.log('deployConfig.verify.ts ok：运行时可配优先级 / 降级 / 静态注入均已生效');
