import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AIChatPromptItem } from '../types';

export interface AIChatPromptsContextValue {
  /** 运行时覆盖的 prompts；为 null 时使用 AIChatPageScope / 根配置 */
  dynamicPrompts: AIChatPromptItem[] | null;
  setPrompts: (prompts: AIChatPromptItem[] | null) => void;
  resetPrompts: () => void;
}

const AIChatPromptsContext = createContext<AIChatPromptsContextValue | null>(null);

export interface AIChatPromptsProviderProps {
  children: ReactNode;
}

export function AIChatPromptsProvider({ children }: AIChatPromptsProviderProps) {
  const [dynamicPrompts, setDynamicPrompts] = useState<AIChatPromptItem[] | null>(null);

  const setPrompts = useCallback((prompts: AIChatPromptItem[] | null) => {
    setDynamicPrompts(prompts);
  }, []);

  const resetPrompts = useCallback(() => {
    setDynamicPrompts(null);
  }, []);

  const value = useMemo(
    () => ({ dynamicPrompts, setPrompts, resetPrompts }),
    [dynamicPrompts, setPrompts, resetPrompts],
  );

  return <AIChatPromptsContext.Provider value={value}>{children}</AIChatPromptsContext.Provider>;
}

export function useAIChatPromptsContext(): AIChatPromptsContextValue {
  const ctx = useContext(AIChatPromptsContext);
  if (!ctx) {
    throw new Error('useAIChatPromptsContext 必须在 <AIChatProvider> 内使用');
  }
  return ctx;
}

/** 获取运行时动态 prompts 覆盖（未设置时为 null） */
export function useAIChatDynamicPrompts(): AIChatPromptItem[] | null {
  return useAIChatPromptsContext().dynamicPrompts;
}

/**
 * 动态设置欢迎区 Prompts 列表。
 * 优先级高于 AIChatPageScope / AIChatProvider 静态配置。
 */
export function useSetAIChatPrompts() {
  const { setPrompts, resetPrompts } = useAIChatPromptsContext();
  return { setPrompts, resetPrompts };
}

/**
 * 声明式设置当前页 Prompts，卸载后自动恢复。
 * 适合根据页面状态（选中实体、Tab 等）切换建议问题。
 */
export function useAIChatPrompts(prompts: AIChatPromptItem[]) {
  const { setPrompts, resetPrompts } = useSetAIChatPrompts();
  const signature = prompts.map((item) => `${item.key}:${item.description}`).join('|');

  useLayoutEffect(() => {
    setPrompts(prompts);
    return () => resetPrompts();
  }, [signature, setPrompts, resetPrompts]);
}
