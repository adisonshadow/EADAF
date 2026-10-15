import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { resolveConfig } from '../config/runtime';
import type { AIChatConfig, ResolvedAIChatConfig } from '../types';
import { useAIChatDynamicPrompts } from './AIChatPromptsContext';
import { useAIChatLayout } from './context';

export type AIChatPageScopeConfig = Partial<
  Pick<
    AIChatConfig,
    | 'scopeSlug'
    | 'applicationId'
    | 'fallbackSkillSlugs'
    | 'topLevelSkillMarkdown'
    | 'systemPromptPrefix'
    | 'welcome'
    | 'prompts'
    | 'headerCaption'
    | 'exposeAllClientTools'
    | 'nextStepPrompts'
    | 'maxToolResultChars'
    | 'semanticRouteDomains'
  >
>;

export const AIChatPageScopeContext = createContext<AIChatPageScopeConfig | null>(null);

export function useAIChatPageScopeConfig(): AIChatPageScopeConfig | null {
  return useContext(AIChatPageScopeContext);
}

export function useEffectiveAIChatConfig(): ResolvedAIChatConfig {
  const { config: rootConfig } = useAIChatLayout();
  const pageScope = useAIChatPageScopeConfig();
  const dynamicPrompts = useAIChatDynamicPrompts();

  return useMemo(() => {
    const base = !pageScope
      ? rootConfig
      : resolveConfig({
          apiBase: rootConfig.apiBase,
          getToken: rootConfig.getToken,
          panelWidth: rootConfig.panelWidth,
          headerOffset: rootConfig.headerOffset,
          defaultOpen: rootConfig.defaultOpen,
          hiddenPaths: rootConfig.hiddenPaths,
          scopeSlug: pageScope.scopeSlug ?? rootConfig.scopeSlug,
          applicationId: pageScope.applicationId ?? rootConfig.applicationId,
          fallbackSkillSlugs: pageScope.fallbackSkillSlugs ?? rootConfig.fallbackSkillSlugs,
          topLevelSkillMarkdown: pageScope.topLevelSkillMarkdown ?? rootConfig.topLevelSkillMarkdown,
          systemPromptPrefix: pageScope.systemPromptPrefix ?? rootConfig.systemPromptPrefix,
          welcome: pageScope.welcome ?? rootConfig.welcome,
          prompts: pageScope.prompts ?? rootConfig.prompts,
          headerCaption: pageScope.headerCaption ?? rootConfig.headerCaption,
          exposeAllClientTools: pageScope.exposeAllClientTools ?? rootConfig.exposeAllClientTools,
          nextStepPrompts: pageScope.nextStepPrompts ?? rootConfig.nextStepPrompts,
          maxToolResultChars: pageScope.maxToolResultChars ?? rootConfig.maxToolResultChars,
          // 根级布局配置：页面 scope 不覆盖，但 resolveConfig 需透传以免落回默认
          autoNavigate: rootConfig.autoNavigate,
          toolConcurrency: rootConfig.toolConcurrency,
          decisionPreference: rootConfig.decisionPreference,
          reasoningDisplayMode: rootConfig.reasoningDisplayMode,
          toolDisplayNames: rootConfig.toolDisplayNames,
          theme: rootConfig.theme,
          semanticRoutes: rootConfig.semanticRoutes,
          semanticRouteDomains:
            pageScope.semanticRouteDomains ?? rootConfig.semanticRouteDomains,
          enableStructuredTermination: rootConfig.enableStructuredTermination,
          roundDelayMs: rootConfig.roundDelayMs,
          navigate: rootConfig.navigate,
        });

    if (dynamicPrompts == null) return base;

    return {
      ...base,
      prompts: dynamicPrompts,
    };
  }, [rootConfig, pageScope, dynamicPrompts]);
}

export interface AIChatPageScopeProps extends AIChatPageScopeConfig {
  children: ReactNode;
}

export function AIChatPageScope({
  children,
  scopeSlug,
  applicationId,
  fallbackSkillSlugs,
  topLevelSkillMarkdown,
  systemPromptPrefix,
  welcome,
  prompts,
  headerCaption,
  exposeAllClientTools,
  nextStepPrompts,
  maxToolResultChars,
  semanticRouteDomains,
}: AIChatPageScopeProps) {
  const value = useMemo(
    () => ({
      scopeSlug,
      applicationId,
      fallbackSkillSlugs,
      topLevelSkillMarkdown,
      systemPromptPrefix,
      welcome,
      prompts,
      headerCaption,
      exposeAllClientTools,
      nextStepPrompts,
      maxToolResultChars,
      semanticRouteDomains,
    }),
    [
      scopeSlug,
      applicationId,
      fallbackSkillSlugs?.join(','),
      topLevelSkillMarkdown,
      systemPromptPrefix,
      welcome?.title,
      welcome?.description,
      prompts?.map((p) => p.key).join(','),
      headerCaption,
      exposeAllClientTools,
      nextStepPrompts,
      maxToolResultChars,
      semanticRouteDomains?.join(','),
    ],
  );

  return (
    <AIChatPageScopeContext.Provider value={value}>{children}</AIChatPageScopeContext.Provider>
  );
}
