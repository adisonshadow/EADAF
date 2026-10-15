import type { ReactNode } from 'react';
import type { AIChatDisplayMode } from '../types';
import { useAIChatDisplayMode } from './useAIChatDisplayMode';

export interface AIChatDisplayProps {
  mode: AIChatDisplayMode;
  children?: ReactNode;
}

/**
 * 声明式设置当前路由/页面的 AI 助手展示形式。
 *
 * @example
 * <Route path="/auth/login" element={<AIChatDisplay mode="hidden"><LoginPage /></AIChatDisplay>} />
 */
export function AIChatDisplay({ mode, children }: AIChatDisplayProps) {
  useAIChatDisplayMode(mode);
  return children ?? null;
}
