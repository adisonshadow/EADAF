import { CommentOutlined } from '@ant-design/icons';
import { ConfigProvider, FloatButton, theme as antdTheme } from 'antd';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { resolveConfig } from '../config/runtime';
import { AIBaseClient } from '../sdk/client';
import type { AIBaseResolvedTheme, AIBaseThemeMode, AIChatConfig, AIChatDisplayMode } from '../types';
import { registerAIChatControls } from '../utils/aiChatBridge';
import { registerBuiltinTools, unregisterBuiltinTools } from '../registry/builtinTools';
import { registerToolDisplayNames } from '../utils/toolDisplayNameFallbacks';
import {
  getAutoNavigate,
  registerNavigationHandler,
  setAutoNavigate as setAutoNavigateChannel,
  subscribeAutoNavigate,
} from '../navigation/navigationChannel';
import {
  getDecisionPreference,
  getReasoningDisplayMode,
  getToolConcurrency,
  setDecisionPreference as setDecisionPreferenceChannel,
  setReasoningDisplayMode as setReasoningDisplayModeChannel,
  setToolConcurrency as setToolConcurrencyChannel,
  subscribeDecisionPreference,
  subscribeReasoningDisplayMode,
  subscribeToolConcurrency,
  type DecisionPreference,
  type ReasoningDisplayMode,
} from '../config/agentPrefsChannel';
import {
  getAIBaseTheme,
  getSystemPrefersDark,
  resolveThemeMode,
  setAIBaseTheme,
  setThemeConfigDefault,
  subscribeAIBaseTheme,
  subscribeSystemColorScheme,
} from '../theme/themeChannel';
import { AIChatLayoutContext, type AIChatLayoutContextValue } from './context';
import { AIChatPromptsProvider } from './AIChatPromptsContext';
import { ChatReferenceProvider } from './ChatReferenceContext';
import {
  getCurrentPathname,
  getDisplayModeForPath,
  subscribePathname,
} from './pathnameDisplayMode';
import { createAgentContext, type AgentPlugin } from '../runtime';
import { ensureObservabilityBridge } from '../observability/bridge';
import type { Context } from '@cordisjs/core';

// 懒挂载 AIChatPanel：首屏不加载 Panel 及其重依赖（gpt-vis/XMarkdown/Attachments 等），
// 推迟到 Panel 真正打开时按需加载，显著降低首屏冷启动的工作量。
const AIChatPanel = lazy(() => import('../ui/AIChatPanel'));

export interface AIChatProviderProps {
  config?: AIChatConfig;
  /**
   * Agent 能力平面插件（Cordis）。例如宿主 Tool 包、业务系统 pack。
   * Provider mount 时 boot，unmount 时 dispose（自动撤销 Tool 注册）。
   */
  plugins?: AgentPlugin[];
  children: ReactNode;
}

export function AIChatProvider({ config, plugins, children }: AIChatProviderProps) {
  const resolved = useMemo(
    () => resolveConfig(config),
    [
      config?.apiBase,
      config?.scopeSlug,
      config?.applicationId,
      config?.systemPromptPrefix,
      config?.panelWidth,
      config?.headerOffset,
      config?.headerCaption,
      config?.defaultOpen,
      config?.hiddenPaths?.join(','),
      config?.fallbackSkillSlugs?.join(','),
      config?.welcome?.title,
      config?.welcome?.description,
      config?.prompts?.map((item) => item.key).join(','),
      config?.navigate,
      config?.theme,
      config?.toolConcurrency,
      config?.decisionPreference,
      config?.reasoningDisplayMode,
      config?.toolDisplayNames
        ? Object.keys(config.toolDisplayNames).sort().join(',')
        : '',
    ],
  );

  // 宿主业务 Tool 展示名：config 变化时重注册，unmount 撤销
  const toolDisplayNamesKey = useMemo(
    () =>
      resolved.toolDisplayNames
        ? Object.keys(resolved.toolDisplayNames)
            .sort()
            .map((k) => `${k}=${resolved.toolDisplayNames[k]}`)
            .join('|')
        : '',
    [resolved.toolDisplayNames],
  );
  useEffect(() => {
    const names = resolved.toolDisplayNames;
    if (!names || Object.keys(names).length === 0) return undefined;
    return registerToolDisplayNames(names);
    // 用序列化 key 避免空对象引用抖动
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolDisplayNamesKey]);

  const client = useMemo(
    () => new AIBaseClient({ baseUrl: resolved.apiBase, getToken: resolved.getToken }),
    [resolved.apiBase, config?.getToken],
  );

  const initialMode = getDisplayModeForPath(getCurrentPathname(), resolved.hiddenPaths);
  const [chatOpen, setChatOpen] = useState(
    () => resolved.defaultOpen && initialMode !== 'hidden',
  );
  const [displayMode, setDisplayMode] = useState<AIChatDisplayMode>(() => initialMode);

  useEffect(() => {
    if (resolved.hiddenPaths.length === 0) return undefined;

    const syncFromPath = () => {
      const nextMode = getDisplayModeForPath(getCurrentPathname(), resolved.hiddenPaths);
      setDisplayMode(nextMode);
      if (nextMode === 'hidden') {
        setChatOpen(false);
      }
    };

    return subscribePathname(syncFromPath);
  }, [resolved.hiddenPaths]);

  const paddingRight = displayMode === 'sidebar' && chatOpen ? resolved.panelWidth : 0;

  // 「自动跳转」开关：userHabit 有记录用记录，否则用 config 默认值（关过一次不回弹）
  const [autoNavigate, setAutoNavigateState] = useState<boolean>(() =>
    getAutoNavigate(resolved.autoNavigate),
  );

  useEffect(() => subscribeAutoNavigate(setAutoNavigateState), []);

  const handleSetAutoNavigate = useCallback((value: boolean) => {
    // 写入 userHabit + 通知订阅者；UI 状态经 subscribeAutoNavigate 回流
    setAutoNavigateChannel(value);
  }, []);

  const [toolConcurrency, setToolConcurrencyState] = useState<number>(() =>
    getToolConcurrency(resolved.toolConcurrency),
  );
  useEffect(() => subscribeToolConcurrency(setToolConcurrencyState), []);
  const handleSetToolConcurrency = useCallback((value: number) => {
    setToolConcurrencyChannel(value);
  }, []);

  const [decisionPreference, setDecisionPreferenceState] = useState<DecisionPreference>(() =>
    getDecisionPreference(resolved.decisionPreference),
  );
  useEffect(() => subscribeDecisionPreference(setDecisionPreferenceState), []);
  const handleSetDecisionPreference = useCallback((value: DecisionPreference) => {
    setDecisionPreferenceChannel(value);
  }, []);

  const [reasoningDisplayMode, setReasoningDisplayModeState] = useState<ReasoningDisplayMode>(() =>
    getReasoningDisplayMode(resolved.reasoningDisplayMode),
  );
  useEffect(() => subscribeReasoningDisplayMode(setReasoningDisplayModeState), []);
  const handleSetReasoningDisplayMode = useCallback((value: ReasoningDisplayMode) => {
    setReasoningDisplayModeChannel(value);
  }, []);

  // 外观主题：userHabit 有记录用记录，否则用 config 默认值（切过一次不回弹）
  useEffect(() => {
    setThemeConfigDefault(resolved.theme);
  }, [resolved.theme]);

  const [themeMode, setThemeModeState] = useState<AIBaseThemeMode>(() =>
    getAIBaseTheme(resolved.theme),
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => getSystemPrefersDark());

  useEffect(() => subscribeAIBaseTheme(setThemeModeState), []);

  useEffect(() => {
    if (themeMode !== 'auto') return undefined;
    setSystemPrefersDark(getSystemPrefersDark());
    return subscribeSystemColorScheme(setSystemPrefersDark);
  }, [themeMode]);

  const resolvedTheme: AIBaseResolvedTheme = useMemo(
    () => resolveThemeMode(themeMode, systemPrefersDark),
    [themeMode, systemPrefersDark],
  );

  const handleSetTheme = useCallback((mode: AIBaseThemeMode) => {
    setAIBaseTheme(mode);
  }, []);

  const chatTheme = useMemo(
    () => ({
      algorithm: resolvedTheme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    }),
    [resolvedTheme],
  );

  // 注册语义路由跳转执行器（前端注入的白名单 + history.push 闭包）
  useEffect(() => {
    registerNavigationHandler(resolved.navigate);
    return () => registerNavigationHandler(null);
  }, [resolved.navigate]);

  // Cordis Agent 能力平面：plugins 变化时重建
  const [agentContext, setAgentContext] = useState<Context | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);
  const pluginsKey = useMemo(
    () => (plugins || []).map((p) => (typeof p === 'object' && p && 'name' in p ? String(p.name) : '')).join('|'),
    [plugins],
  );

  useEffect(() => {
    disposeRef.current?.();
    disposeRef.current = null;

    const handle = createAgentContext({ plugins: plugins || [] });
    disposeRef.current = handle.dispose;
    setAgentContext(handle.ctx);

    return () => {
      disposeRef.current?.();
      disposeRef.current = null;
      setAgentContext(null);
    };
    // plugins 数组引用常变；用 name 拼接的 key 稳定重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pluginsKey]);

  const layoutValue = useMemo<AIChatLayoutContextValue>(
    () => ({
      chatOpen,
      setChatOpen,
      displayMode,
      setDisplayMode,
      panelWidth: resolved.panelWidth,
      paddingRight,
      headerOffset: resolved.headerOffset,
      config: resolved,
      client,
      autoNavigate,
      setAutoNavigate: handleSetAutoNavigate,
      toolConcurrency,
      setToolConcurrency: handleSetToolConcurrency,
      decisionPreference,
      setDecisionPreference: handleSetDecisionPreference,
      reasoningDisplayMode,
      setReasoningDisplayMode: handleSetReasoningDisplayMode,
      themeMode,
      resolvedTheme,
      setTheme: handleSetTheme,
      agentContext,
    }),
    [
      chatOpen,
      displayMode,
      paddingRight,
      resolved,
      client,
      autoNavigate,
      handleSetAutoNavigate,
      toolConcurrency,
      handleSetToolConcurrency,
      decisionPreference,
      handleSetDecisionPreference,
      reasoningDisplayMode,
      handleSetReasoningDisplayMode,
      themeMode,
      resolvedTheme,
      handleSetTheme,
      agentContext,
    ],
  );

  useEffect(() => {
    registerAIChatControls({ openPanel: () => setChatOpen(true) });
    registerBuiltinTools();
    const disposeObs = ensureObservabilityBridge();
    return () => {
      registerAIChatControls(null);
      unregisterBuiltinTools();
      disposeObs();
    };
  }, []);

  // 侧栏占位打在业务布局容器上，勿写 document.body.paddingRight（会与 antd Modal 滚动锁冲突导致卡死）
  return (
    <AIChatLayoutContext.Provider value={layoutValue}>
      <AIChatPromptsProvider>
        <ChatReferenceProvider>
          <div
            className="aibase-chat-host"
            style={paddingRight > 0 ? { paddingRight } : undefined}
          >
            {children}
          </div>
          <ConfigProvider theme={chatTheme}>
            {displayMode !== 'hidden' && chatOpen && (
              <Suspense fallback={null}>
                <AIChatPanel onClose={() => setChatOpen(false)} />
              </Suspense>
            )}
            {displayMode !== 'hidden' && !chatOpen && (
              <FloatButton
                className="aibase-chat-float-btn"
                icon={<CommentOutlined />}
                type="primary"
                tooltip="打开 AI 助手"
                style={{ right: 24, bottom: 24 }}
                onClick={() => setChatOpen(true)}
              />
            )}
          </ConfigProvider>
        </ChatReferenceProvider>
      </AIChatPromptsProvider>
    </AIChatLayoutContext.Provider>
  );
}
