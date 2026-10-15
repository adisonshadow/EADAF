import type { AIChatConfig, ResolvedAIChatConfig } from '../types';
import {
  DEFAULT_DECISION_PREFERENCE,
  DEFAULT_REASONING_DISPLAY_MODE,
  DEFAULT_TOOL_CONCURRENCY,
} from './agentPrefsChannel';

const DEFAULT_SYSTEM_PROMPT_PREFIX =
  '你是 企业数据底座的 AI 助手，已接入各类数据服务与Tool。\n' +
  '遇到统计类问题，必须先调用 Tool 获取数据再回答。\n\n' +
  '## Tool 结果汇报（硬约束）\n' +
  '- 写操作（创建/更新/删除/发布/测试）**禁止**在未调用 Tool，或 Tool 信封中 `verified !== true` / `kind !== success` 时向用户声称成功\n' +
  '- 必须以最近一次相关 Tool 返回的 `ok`、`verified`、`kind`、`error.message` 为准；禁止编造 ID、status、preview、rolledBack 等\n' +
  '- Tool 返回 `business_error` 或 `verified: false` 时，向用户说明失败原因（引用 error.message），不要脑补成功';

const DEFAULT_WELCOME = {
  title: '我是您的AI助手',
  description: '我会根据你的任务自动选择合适的专家技能与工具，直接描述需求即可。',
};

const DEFAULT_PROMPTS = [
  { key: '1', description: '了解一下我可以做什么' },
];

const defaultGetToken = () => localStorage.getItem('token');

export function resolveConfig(config: AIChatConfig = {}): ResolvedAIChatConfig {
  return {
    apiBase: config.apiBase || '/api',
    scopeSlug: config.scopeSlug,
    applicationId: config.applicationId,
    getToken: config.getToken || defaultGetToken,
    fallbackSkillSlugs: config.fallbackSkillSlugs ?? [],
    topLevelSkillMarkdown: config.topLevelSkillMarkdown ?? '',
    systemPromptPrefix: config.systemPromptPrefix || DEFAULT_SYSTEM_PROMPT_PREFIX,
    welcome: config.welcome || DEFAULT_WELCOME,
    prompts: config.prompts || DEFAULT_PROMPTS,
    panelWidth: config.panelWidth ?? 420,
    headerOffset: config.headerOffset ?? 64,
    headerCaption: config.headerCaption ?? 'AI 助手',
    defaultOpen: config.defaultOpen ?? true,
    hiddenPaths: config.hiddenPaths ?? [],
    exposeAllClientTools: config.exposeAllClientTools ?? false,
    nextStepPrompts: config.nextStepPrompts ?? {},
    maxToolResultChars: config.maxToolResultChars ?? 8000,
    roundDelayMs: config.roundDelayMs ?? 600,
    enableStructuredTermination: config.enableStructuredTermination ?? true,
    semanticRoutes: config.semanticRoutes ?? [],
    semanticRouteDomains: config.semanticRouteDomains ?? [],
    autoNavigate: config.autoNavigate ?? true,
    toolConcurrency: config.toolConcurrency ?? DEFAULT_TOOL_CONCURRENCY,
    decisionPreference: config.decisionPreference ?? DEFAULT_DECISION_PREFERENCE,
    reasoningDisplayMode: config.reasoningDisplayMode ?? DEFAULT_REASONING_DISPLAY_MODE,
    toolDisplayNames: config.toolDisplayNames ?? {},
    theme: config.theme ?? 'light',
    navigate: config.navigate,
  };
}
