/**
 * 语义化路由导航通道回归验证（node --import tsx src/navigation/navigationChannel.verify.ts）
 *
 * 覆盖：默认开关 / 持久化（userHabit）/ 订阅通知 / handler 注册与透传 /
 *       开关优先于 handler（disabled 不暴露白名单细节）。
 */
import assert from 'node:assert/strict';
import {
  AUTO_NAVIGATE_HABIT_KEY,
  getAutoNavigate,
  setAutoNavigate,
  subscribeAutoNavigate,
  registerNavigationHandler,
  getNavigationHandler,
  navigateToPage,
} from './navigationChannel';
import { getUserHabit } from '../storage/userHabit';
import type { NavigationRequest, NavigationResult } from '../types';

/* ------------------------------- localStorage mock ------------------------------- */
const storage = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, String(value));
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => storage.clear(),
};

function resetStorage() {
  storage.clear();
  registerNavigationHandler(null);
}

/* ----------------------------------- 用例 ----------------------------------- */

(async () => {
  resetStorage();
  // 1. 默认开（无 userHabit 记录时用 config 默认值）
  assert.equal(getAutoNavigate(true), true, '默认应为 true');
  assert.equal(getAutoNavigate(false), false, 'config 默认 false 时应用 false');

  // 2. setAutoNavigate 持久化到 userHabit：关过一次不回弹
  setAutoNavigate(false);
  assert.equal(getUserHabit(AUTO_NAVIGATE_HABIT_KEY, true), false, 'userHabit 应写入 false');
  assert.equal(getAutoNavigate(true), false, 'userHabit 覆盖 config 默认');

  // 3. 订阅通知
  const seen: boolean[] = [];
  const unsubscribe = subscribeAutoNavigate((value) => seen.push(value));
  setAutoNavigate(true);
  setAutoNavigate(false);
  assert.deepEqual(seen, [true, false], '订阅者应按顺序收到开关变化');
  unsubscribe();
  setAutoNavigate(true);
  assert.equal(seen.length, 2, '取消订阅后不再收到通知');

  // 4. 开关关：不调 handler，直接 disabled
  setAutoNavigate(false);
  registerNavigationHandler(() => {
    throw new Error('开关关闭时不应调用 handler');
  });
  const disabled = await navigateToPage({ path: '/member_org/member' });
  assert.deepEqual(disabled, {
    navigated: false,
    reason: 'disabled',
    message: '自动跳转已关闭，可在 AI 助手设置中开启',
  });

  // 5. 未注册 handler → no_handler
  setAutoNavigate(true);
  registerNavigationHandler(null);
  const noHandler = await navigateToPage({ path: '/member_org/member' });
  assert.equal(noHandler.navigated, false);
  if (!noHandler.navigated) {
    assert.equal(noHandler.reason, 'no_handler');
  }
  assert.equal(getNavigationHandler(), null, '未注册时 handler 应为 null');

  // 6. 注册 handler 后透传（navigated）
  registerNavigationHandler((req: NavigationRequest): NavigationResult => {
    return { navigated: true, path: req.path };
  });
  const ok = await navigateToPage({ path: '/ai_management/providers' });
  assert.deepEqual(ok, { navigated: true, path: '/ai_management/providers' });

  // 7. 透传 invalid_target（前端白名单校验结果原样返回）
  registerNavigationHandler((): NavigationResult => {
    return { navigated: false, reason: 'invalid_target', message: '未知或非法页面: /xxx' };
  });
  const invalid = await navigateToPage({ path: '/xxx' });
  assert.equal(invalid.navigated, false);
  if (!invalid.navigated) {
    assert.equal(invalid.reason, 'invalid_target');
    assert.ok(invalid.message?.includes('/xxx'));
  }

  // 8. 异步 handler 支持
  registerNavigationHandler(
    async (req: NavigationRequest): Promise<NavigationResult> => {
      await Promise.resolve();
      return { navigated: true, path: `/member_org/member/${req.params?.id ?? ''}/edit` };
    },
  );
  const asyncOk = await navigateToPage({
    path: '/member_org/member/:id/edit',
    params: { id: 'u-42' },
  });
  assert.deepEqual(asyncOk, { navigated: true, path: '/member_org/member/u-42/edit' });

  console.log('navigationChannel 回归验证全部通过');
})();
