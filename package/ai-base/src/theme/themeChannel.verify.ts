/**
 * AIBase 主题通道回归验证（node --import tsx src/theme/themeChannel.verify.ts）
 *
 * 覆盖：默认 light / config 覆盖 / setAIBaseTheme 持久化与订阅 /
 *       resolveThemeMode（含 auto + matchMedia）。
 */
import assert from 'node:assert/strict';
import {
  THEME_HABIT_KEY,
  getAIBaseTheme,
  setAIBaseTheme,
  subscribeAIBaseTheme,
  resolveThemeMode,
  getResolvedAIBaseTheme,
  setThemeConfigDefault,
} from './themeChannel';
import { getUserHabit } from '../storage/userHabit';
import type { AIBaseThemeMode } from '../types';

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

type MediaListener = (event: MediaQueryListEvent) => void;
let prefersDark = false;
const mediaListeners = new Set<MediaListener>();

(globalThis as { window?: unknown }).window = {
  matchMedia: (query: string) => {
    assert.equal(query, '(prefers-color-scheme: dark)');
    return {
      matches: prefersDark,
      media: query,
      addEventListener: (_type: string, listener: MediaListener) => {
        mediaListeners.add(listener);
      },
      removeEventListener: (_type: string, listener: MediaListener) => {
        mediaListeners.delete(listener);
      },
    };
  },
};

function reset() {
  storage.clear();
  prefersDark = false;
  mediaListeners.clear();
  setThemeConfigDefault('light');
}

/* ----------------------------------- 用例 ----------------------------------- */

reset();
// 1. 默认 light（无 userHabit）
assert.equal(getAIBaseTheme('light'), 'light', '默认应为 light');
assert.equal(getAIBaseTheme(), 'light', '无 override 时用模块 configDefault');

// 2. config 覆盖（无 habit 时生效）
assert.equal(getAIBaseTheme('dark'), 'dark', 'config 默认 dark 时应为 dark');
assert.equal(getAIBaseTheme('auto'), 'auto', 'config 默认 auto 时应为 auto');

// 3. setAIBaseTheme 持久化：切过一次不回弹
setAIBaseTheme('dark');
assert.equal(getUserHabit(THEME_HABIT_KEY, 'light'), 'dark', 'userHabit 应写入 dark');
assert.equal(getAIBaseTheme('light'), 'dark', 'userHabit 覆盖 config 默认 light');
assert.equal(getAIBaseTheme('auto'), 'dark', 'userHabit 覆盖 config 默认 auto');

// 4. 订阅通知
const seen: AIBaseThemeMode[] = [];
const unsubscribe = subscribeAIBaseTheme((mode) => seen.push(mode));
setAIBaseTheme('light');
setAIBaseTheme('auto');
assert.deepEqual(seen, ['light', 'auto'], '订阅者应按顺序收到 mode 变化');
unsubscribe();
setAIBaseTheme('dark');
assert.equal(seen.length, 2, '取消订阅后不再收到通知');

// 5. resolveThemeMode
assert.equal(resolveThemeMode('light', true), 'light');
assert.equal(resolveThemeMode('dark', false), 'dark');
assert.equal(resolveThemeMode('auto', false), 'light');
assert.equal(resolveThemeMode('auto', true), 'dark');

// 6. getResolvedAIBaseTheme：auto + matchMedia
reset();
setAIBaseTheme('auto');
prefersDark = false;
assert.equal(getResolvedAIBaseTheme(), 'light', 'auto + 系统浅色 → light');
prefersDark = true;
assert.equal(getResolvedAIBaseTheme(), 'dark', 'auto + 系统深色 → dark');

setAIBaseTheme('light');
prefersDark = true;
assert.equal(getResolvedAIBaseTheme(), 'light', '固定 light 不跟系统');

console.log('themeChannel.verify.ts: all passed');
