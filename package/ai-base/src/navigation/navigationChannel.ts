import { getUserHabit, setUserHabit } from '../storage/userHabit';
import type { NavigationRequest, NavigationResult } from '../types';

/**
 * 语义化路由导航通道（模块级 store，与 registerAIChatControls 同模式）。
 *
 * 职责：
 * - 持有「自动跳转」开关：config 默认值 ← userHabit 覆盖（关过一次不回弹）；
 * - 注册 navigate 执行器（前端 AIChatProvider mount 时注入「白名单 + history.push」闭包）；
 * - 供 harness Tool `navigate_to_page` 调用：先开关 → 再 handler → 透传结果；
 * - ai-base 不依赖 react-router，跳转执行完全由注册的 handler 完成。
 *
 * 开关范围：仅约束 harness `navigate_to_page`；业务 `*_navigate` 工具不受此开关约束。
 */

export const AUTO_NAVIGATE_HABIT_KEY = 'chat.autoNavigate';

export type NavigateHandler = (
  req: NavigationRequest,
) => NavigationResult | Promise<NavigationResult>;

let navigationHandler: NavigateHandler | null = null;

type AutoNavigateListener = (value: boolean) => void;
const autoNavigateListeners = new Set<AutoNavigateListener>();

/** 读取开关：userHabit 有记录用记录，否则用 config 默认值（默认 true） */
export function getAutoNavigate(configDefault = true): boolean {
  return getUserHabit(AUTO_NAVIGATE_HABIT_KEY, configDefault);
}

/** 写入开关：持久化到 userHabit + 通知订阅者（UI 设置面板与 harness 都走这里） */
export function setAutoNavigate(value: boolean): void {
  setUserHabit(AUTO_NAVIGATE_HABIT_KEY, value);
  autoNavigateListeners.forEach((listener) => listener(value));
}

/** 订阅开关变化（Provider 用其同步 context 状态） */
export function subscribeAutoNavigate(listener: AutoNavigateListener): () => void {
  autoNavigateListeners.add(listener);
  return () => {
    autoNavigateListeners.delete(listener);
  };
}

/** AIChatProvider mount 时注册跳转执行器；传 null 注销 */
export function registerNavigationHandler(handler: NavigateHandler | null | undefined): void {
  navigationHandler = handler ?? null;
}

/** 读取当前注册的跳转执行器（调试 / verify 用） */
export function getNavigationHandler(): NavigateHandler | null {
  return navigationHandler;
}

/**
 * 执行一次语义化跳转请求。
 * 优先级：开关 → handler → 透传。
 * - 开关关闭：直接返回 `disabled`（不暴露白名单校验细节，避免信息泄漏）；
 * - 未注册 handler：返回 `no_handler`；
 * - 其余由前端执行器完成白名单校验并返回 `invalid_target` 或 `navigated`。
 */
export async function navigateToPage(req: NavigationRequest): Promise<NavigationResult> {
  if (!getAutoNavigate()) {
    return {
      navigated: false,
      reason: 'disabled',
      message: '自动跳转已关闭，可在 AI 助手设置中开启',
    };
  }
  if (!navigationHandler) {
    return {
      navigated: false,
      reason: 'no_handler',
      message: '未注册页面跳转处理器',
    };
  }
  return navigationHandler(req);
}
