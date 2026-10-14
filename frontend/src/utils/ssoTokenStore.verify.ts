/**
 * SSO token 隔离回归自检（node --import tsx src/utils/ssoTokenStore.verify.ts）
 *
 * 锁住"SSO 登录后 EADAF 掉登录"这个 bug 的根因：
 *   应用 token 绝不能写进平台会话位（token / refresh_token），
 *   否则管理台用平台密钥验签会 401 → 清会话 → 回登录页。
 */
import assert from 'node:assert/strict';

// 最小 localStorage 实现（本模块只依赖它）
class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.has(k) ? (this.map.get(k) as string) : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

const storage = new MemoryStorage();
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = storage;

const {
  saveSsoAuth,
  getSsoAuth,
  clearSsoAuth,
  clearAllSsoAuth,
  ssoTokenKey,
  platformTokenKeys,
} = await import('./ssoTokenStore');

const APP_A = '10000000-0001-4000-8000-000000006666';
const APP_B = '10000000-0002-4000-8000-000000007777';

function platformSnapshot() {
  return {
    token: storage.getItem('token'),
    refresh_token: storage.getItem('refresh_token'),
  };
}

// 1) 平台会话先建立
storage.setItem('token', 'platform-token');
storage.setItem('refresh_token', 'platform-refresh');
const before = platformSnapshot();

// 2) 保存应用 token
saveSsoAuth(APP_A, 'app-a-token', 'app-a-refresh');

// 3) 关键断言：平台会话位一个字节都不能被动
assert.deepEqual(platformSnapshot(), before, '应用 token 不得写进平台会话位');
assert.equal(storage.getItem('token'), 'platform-token');
assert.equal(storage.getItem('refresh_token'), 'platform-refresh');

// 4) 应用 token 存在独立键、可读回
assert.equal(storage.getItem(ssoTokenKey(APP_A)), 'app-a-token');
assert.deepEqual(getSsoAuth(APP_A), { token: 'app-a-token', refreshToken: 'app-a-refresh' });

// 5) 多应用互不干扰
saveSsoAuth(APP_B, 'app-b-token');
assert.equal(getSsoAuth(APP_A).token, 'app-a-token');
assert.equal(getSsoAuth(APP_B).token, 'app-b-token');
assert.deepEqual(platformSnapshot(), before);

// 6) 清理单个应用不影响另一个，也不影响平台
clearSsoAuth(APP_A);
assert.equal(getSsoAuth(APP_A).token, '');
assert.equal(getSsoAuth(APP_B).token, 'app-b-token');
assert.deepEqual(platformSnapshot(), before);

// 7) 全量清应用 token：只删 sso_* 键
const removed = clearAllSsoAuth();
assert.equal(removed, 1, '只应清掉 APP_B 的 1 个键');
assert.equal(getSsoAuth(APP_B).token, '');
assert.deepEqual(platformSnapshot(), before, '全量清应用 token 不得伤平台会话');

// 8) 空 appId / 空 token 不写脏键
saveSsoAuth('', 'x');
saveSsoAuth(APP_A, '');
assert.equal(removed, 1);
assert.equal(storage.getItem(ssoTokenKey('')), null);
assert.equal(storage.getItem(ssoTokenKey(APP_A)), null);

// 9) 平台会话键名常量与 auth.ts 的约定一致
assert.deepEqual([...platformTokenKeys], ['token', 'refresh_token']);

console.log('ssoTokenStore.verify.ts ok：应用 token 与平台会话已隔离');
