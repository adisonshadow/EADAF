import { createContext, useContext } from 'react';
import type { AIBaseClient } from '../sdk/client';
import type {
  AIBaseResolvedTheme,
  AIBaseThemeMode,
  AIChatDisplayMode,
  ResolvedAIChatConfig,
} from '../types';
import type { DecisionPreference, ReasoningDisplayMode } from '../config/agentPrefsChannel';
import type { Context } from '@cordisjs/core';

export interface AIChatLayoutContextValue {
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  displayMode: AIChatDisplayMode;
  setDisplayMode: (mode: AIChatDisplayMode) => void;
  panelWidth: number;
  paddingRight: number;
  headerOffset: number;
  config: ResolvedAIChatConfig;
  client: AIBaseClient;
  /** 「自动跳转」开关（userHabit 持久化；仅约束 navigate_to_page） */
  autoNavigate: boolean;
  setAutoNavigate: (value: boolean) => void;
  /** 同一步并行 Tool 上限（userHabit 持久化） */
  toolConcurrency: number;
  setToolConcurrency: (value: number) => void;
  /** 面临抉择时倾向（userHabit 持久化） */
  decisionPreference: DecisionPreference;
  setDecisionPreference: (value: DecisionPreference) => void;
  /** 思考内容显示方式（userHabit 持久化） */
  reasoningDisplayMode: ReasoningDisplayMode;
  setReasoningDisplayMode: (value: ReasoningDisplayMode) => void;
  /** 外观模式（light / dark / auto；userHabit 持久化） */
  themeMode: AIBaseThemeMode;
  /** 解析后的实际外观（auto 已展开为 light / dark） */
  resolvedTheme: AIBaseResolvedTheme;
  setTheme: (mode: AIBaseThemeMode) => void;
  /** Agent 能力平面（Cordis）；未启用插件时为 null */
  agentContext: Context | null;
}

export const AIChatLayoutContext = createContext<AIChatLayoutContextValue | null>(null);

export function useAIChatLayout(): AIChatLayoutContextValue {
  const context = useContext(AIChatLayoutContext);
  if (!context) {
    throw new Error('useAIChatLayout 必须在 <AIChatProvider> 内使用');
  }
  return context;
}
