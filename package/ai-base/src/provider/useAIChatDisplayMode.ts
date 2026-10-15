import { useLayoutEffect } from 'react';
import type { AIChatDisplayMode } from '../types';
import { useAIChatLayout } from './context';

/**
 * 在当前页面设置 AI 助手展示形式，卸载后恢复为侧边栏（默认）。
 *
 * 使用 useLayoutEffect 在绘制前同步写入，避免首帧闪烁，同时不在渲染阶段更新 Provider 状态。
 */
export function useAIChatDisplayMode(mode: AIChatDisplayMode) {
  const { setDisplayMode, setChatOpen } = useAIChatLayout();

  useLayoutEffect(() => {
    setDisplayMode(mode);
    if (mode === 'float' || mode === 'hidden') {
      setChatOpen(false);
    }
    return () => {
      setDisplayMode('sidebar');
    };
  }, [mode, setDisplayMode, setChatOpen]);
}
