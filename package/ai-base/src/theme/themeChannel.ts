import { getUserHabit, setUserHabit } from '../storage/userHabit';
import type { AIBaseThemeMode, AIBaseResolvedTheme } from '../types';

/**
 * AIBase 外观主题通道（模块级 store，与 navigationChannel 同模式）。
 *
 * - mode：`light` | `dark` | `auto`（auto = 跟随系统 prefers-color-scheme）
 * - 优先级：userHabit 有记录用记录，否则用 config 默认值（默认 light）；切过一次不回弹
 * - 仅作用于 AI 聊天 UI（侧栏 / 浮钮），不改变宿主应用主题
 */

export const THEME_HABIT_KEY = 'chat.theme';

type ThemeListener = (mode: AIBaseThemeMode) => void;
const themeListeners = new Set<ThemeListener>();

/** 模块内记住最近一次 config 默认值，供 getAIBaseTheme / getResolved 在无 habit 时使用 */
let configDefault: AIBaseThemeMode = 'light';

export function setThemeConfigDefault(mode: AIBaseThemeMode): void {
  configDefault = mode;
}

function isThemeMode(value: unknown): value is AIBaseThemeMode {
  return value === 'light' || value === 'dark' || value === 'auto';
}

/** 读取 mode：userHabit 有记录用记录，否则用 config 默认值 */
export function getAIBaseTheme(configDefaultOverride?: AIBaseThemeMode): AIBaseThemeMode {
  const fallback = configDefaultOverride ?? configDefault;
  const stored = getUserHabit<unknown>(THEME_HABIT_KEY, fallback);
  return isThemeMode(stored) ? stored : fallback;
}

/** 写入 mode：持久化到 userHabit + 通知订阅者 */
export function setAIBaseTheme(mode: AIBaseThemeMode): void {
  setUserHabit(THEME_HABIT_KEY, mode);
  themeListeners.forEach((listener) => listener(mode));
}

/** 订阅 mode 变化（Provider 用其同步 context 状态） */
export function subscribeAIBaseTheme(listener: ThemeListener): () => void {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

/** 读取系统是否偏好深色（SSR / 无 window 时视为 light） */
export function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** 将 mode 解析为实际外观 light | dark */
export function resolveThemeMode(
  mode: AIBaseThemeMode,
  prefersDark = getSystemPrefersDark(),
): AIBaseResolvedTheme {
  if (mode === 'auto') return prefersDark ? 'dark' : 'light';
  return mode;
}

/** 当前 mode 解析后的实际外观 */
export function getResolvedAIBaseTheme(
  configDefaultOverride?: AIBaseThemeMode,
): AIBaseResolvedTheme {
  return resolveThemeMode(getAIBaseTheme(configDefaultOverride));
}

/**
 * 订阅系统配色变化（仅当 mode === auto 时有意义）。
 * 返回取消订阅函数；无 matchMedia 时为 noop。
 */
export function subscribeSystemColorScheme(listener: (prefersDark: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined;
  }
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = (event: MediaQueryListEvent) => {
    listener(event.matches);
  };
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}
