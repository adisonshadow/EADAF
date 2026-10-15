export { AIChatProvider } from './provider/AIChatProvider';
export type { AIChatProviderProps } from './provider/AIChatProvider';
export { AIChatDisplay } from './provider/AIChatDisplay';
export type { AIChatDisplayProps } from './provider/AIChatDisplay';
export { AIChatPageScope, useEffectiveAIChatConfig } from './provider/AIChatPageScope';
export type { AIChatPageScopeProps, AIChatPageScopeConfig } from './provider/AIChatPageScope';
export { ChatSessionGroupProvider, useChatSessionGroupId } from './provider/ChatSessionGroupContext';
export type { ChatSessionGroupProviderProps } from './provider/ChatSessionGroupContext';
export { ChatReferenceProvider, useChatReference } from './provider/ChatReferenceContext';
export type {
  ChatReferenceItem,
  AddReferenceParams,
  ChatReferenceContextValue,
  ChatReferenceProviderProps,
} from './provider/ChatReferenceContext';
export { useAIChatLayout } from './provider/context';
export { useAIChatDisplayMode } from './provider/useAIChatDisplayMode';
export { notifyPathnameChange } from './provider/pathnameDisplayMode';
export {
  AIChatPromptsProvider,
  useAIChatPrompts,
  useSetAIChatPrompts,
  useAIChatDynamicPrompts,
} from './provider/AIChatPromptsContext';
export type { AIChatPromptsContextValue, AIChatPromptsProviderProps } from './provider/AIChatPromptsContext';
export { useSendAIChatMessage } from './hooks/useSendAIChatMessage';
export {
  sendAIChatMessage,
  sendMockUserMessage,
  registerAIChatControls,
  registerAIChatSessionControls,
  loadAIChatConversation,
  getActiveAIChatConversationKey,
  getAIChatStorageNamespace,
} from './utils/aiChatBridge';
export type { AIChatControls, AIChatSessionControls } from './utils/aiChatBridge';
export { formatMessageWithReferences, formatReferencePointer } from './utils/formatChatReferences';
export { extractAiChatErrorMessage, readChatErrorMessage } from './utils/formatAiChatError';
export { setToolInvokeLogger, logToolInvoke, withToolInvokeLog, formatToolInvokeError, subscribeToolInvoke } from './utils/toolInvokeLogger';
export type { ToolInvokeLogEntry, ToolInvokeLogger, ToolInvokeSide, ToolInvokeListener } from './utils/toolInvokeLogger';

export {
  registerAISurface,
  unregisterAISurface,
  getAISurface,
  getAllAISurfaces,
  readAllAISurfaces,
  surfaceRegistryKey,
} from './registry/aiSurfaceRegistry';
export { emitAIMutation, subscribeAIMutation, emitMutationFromToolResult } from './registry/aiMutationBus';
export { useAISurface, useAIMutationHandler } from './provider/useAISurface';

export {
  // Context funnel memory (L0–L4)
  getSessionWorkingMemory,
  getSessionPlan,
  setSessionPlan,
  appendSessionFacts,
  getSessionFacts,
  getSessionSummary,
  clearSessionPlan,
  resetSessionWorkingMemory,
  extractFactsFromEnvelope,
  buildSceneCard,
  buildWorkingMemoryInjection,
  distillSessionSummary,
  buildCurrentSceneCard,
} from './memory';
export type {
  MemoryFact,
  MemoryFactType,
  SessionWorkingMemory,
} from './memory';

export {
  compactHistoryForApi,
  compactTurnToolMessages,
  estimateMessageChars,
  getContextUsagePercent,
  MAX_CONTEXT_CHARS,
  KEEP_RECENT_MESSAGES,
  MULTIMODAL_IMAGE_CHARS,
} from './chat/contextBudget';
export { sanitizeApiContentForPersist, sanitizeMessagesForPersist } from './storage/chatHistoryDb';

export {
  registerFunctionCall,
  unregisterFunctionCall,
  getFunctionCallDef,
  getAllFunctionCalls,
  invokeFunctionCall,
  clearFunctionCalls,
  subscribeFunctionCalls,
} from './registry/functionRegistry';
export type { RegisterFunctionCallOptions } from './registry/functionRegistry';

export {
  registerToolContractSource,
  unregisterToolContractSource,
  clearToolContractSources,
  listToolContractSources,
  listAllToolContracts,
  getToolContract,
  resolveVisibleContracts,
  toolContractToOpenAITool,
  ensureFunctionRegistryContractSource,
  subscribeToolContracts,
} from './registry/toolContractRegistry';
export type { ToolContract, ToolContractSource } from './registry/toolContractRegistry';

export {
  registerSkillCompletionPolicy,
  unregisterSkillCompletionPolicy,
  clearSkillCompletionPolicies,
  getSkillCompletionStrategy,
  resolveTerminationCompletionStrategy,
} from './registry/skillPolicyRegistry';
export type { SkillCompletionPolicyOverride } from './registry/skillPolicyRegistry';

// Skill 加载缓存失效：管理后台编辑 Skill 后调用以刷新前端缓存（见 p2-skill-tool-caching.md）
export { invalidateSkillCache } from './registry/skillCache';

export { useFunctionCall } from './hooks/useFunctionCall';
export type { UseFunctionCallOptions } from './hooks/useFunctionCall';

export { serializeToolResultForContext, resolveToolResultBudget } from './utils/toolResultBudget';
export type { TrimmedToolResult } from './utils/toolResultBudget';
export { aggregateToolResults } from './utils/aggregateToolResults';
export {
  supportsModelAttachments,
  supportsModelVoiceInput,
  MODEL_CAPABILITY_AUDIO_INPUT,
} from './utils/modelAttachmentConfig';
/**
 * 结构化终止（task_complete / update_plan）机制。
 * 默认开启（enableStructuredTermination: true）；设 false 可回退旧 auto-continue。
 * 详见 docs/TODOs/新Agent架构方案/06-闭环与终止.md。
 */
export {
  TASK_COMPLETE_TOOL,
  UPDATE_PLAN_TOOL,
  ASK_USER_TOOL,
  NAVIGATE_TO_PAGE_TOOL,
  SKILL_TOOL,
  RUN_CODE_TOOL,
  RUN_SUBAGENT_TOOL,
  ASK_USER_OPENAI_TOOL,
  NAVIGATE_TO_PAGE_OPENAI_TOOL,
  SKILL_OPENAI_TOOL,
  RUN_CODE_OPENAI_TOOL,
  RUN_SUBAGENT_OPENAI_TOOL,
  HARNESS_TOOL_NAMES,
  HARNESS_OPENAI_TOOLS,
} from './registry/builtinTools';
export {
  registerSkillBodyLoader,
  registerSkillActivatedListener,
  createClientSkillBodyLoader,
} from './registry/skillBodyChannel';
export type { SkillBodyPayload } from './registry/skillBodyChannel';
export type { SkillCatalogEntry, ChatSkillContext } from './registry/skillLoader';
export { loadChatSkillContext, buildCombinedSystemPrompt } from './registry/skillLoader';
export {
  beginTurnTrace,
  endTurnTrace,
  appendTurnEvent,
  getTurnTrace,
  listRecentTurnTraces,
  clearTurnTraces,
  subscribeTurnTraces,
  setActiveTurnContext,
  getActiveTurnId,
} from './observability/turnTrace';
export type {
  TurnTraceRecord,
  TurnTraceEvent,
  TurnTraceEventKind,
  TurnTraceToolSummary,
} from './observability/turnTrace';
export {
  getToolMetrics,
  resetToolMetrics,
  subscribeToolMetrics,
  recordToolMetricSample,
} from './observability/toolMetrics';
export type { ToolMetric } from './observability/toolMetrics';
export { ensureObservabilityBridge } from './observability/bridge';
export { runSubagentFanout, runSubagentSequence } from './runtime/runSubagent';
export {
  formatUserChoiceMessage,
  isUserChoiceRequestData,
} from './chat/userChoice';
export type {
  AskUserArgs,
  UserChoiceMode,
  UserChoiceOption,
  UserChoiceRequest,
  UserChoiceSubmission,
} from './chat/userChoice';
export { resolveToolStepFromEnvelope } from './chat/resolveToolStepFromEnvelope';

// 语义化路由与 AI 决策跳转（navigationChannel + markdown 渲染）
export {
  registerNavigationHandler,
  getNavigationHandler,
  getAutoNavigate,
  setAutoNavigate,
  subscribeAutoNavigate,
  navigateToPage,
  AUTO_NAVIGATE_HABIT_KEY,
} from './navigation/navigationChannel';
export type { NavigateHandler } from './navigation/navigationChannel';
export { semanticRoutesToMarkdown } from './navigation/semanticRoutesToMarkdown';

export {
  setAIBaseTheme,
  getAIBaseTheme,
  getResolvedAIBaseTheme,
  subscribeAIBaseTheme,
  THEME_HABIT_KEY,
} from './theme/themeChannel';

export {
  getToolConcurrency,
  setToolConcurrency,
  subscribeToolConcurrency,
  getDecisionPreference,
  setDecisionPreference,
  subscribeDecisionPreference,
  getReasoningDisplayMode,
  setReasoningDisplayMode,
  subscribeReasoningDisplayMode,
  buildAskUserProtocol,
  DEFAULT_TOOL_CONCURRENCY,
  DEFAULT_DECISION_PREFERENCE,
  DEFAULT_REASONING_DISPLAY_MODE,
  MIN_TOOL_CONCURRENCY,
  MAX_TOOL_CONCURRENCY,
  TOOL_CONCURRENCY_HABIT_KEY,
  DECISION_PREFERENCE_HABIT_KEY,
  REASONING_DISPLAY_MODE_HABIT_KEY,
} from './config/agentPrefsChannel';
export type { DecisionPreference, ReasoningDisplayMode } from './config/agentPrefsChannel';

export { AIBaseClient } from './sdk';

export type {
  AIChatConfig,
  AIChatDisplayMode,
  AIBaseThemeMode,
  AIBaseResolvedTheme,
  AIChatPromptItem,
  ResolvedAIChatConfig,
  AIBaseScope,
  AIBaseTool,
  OpenAIToolDefinition,
  AIBaseSkill,
  AIBaseModelInfo,
  AIBaseClientOptions,
  ToolInvokeResult,
  FunctionCallDef,
  SkillCompletionStrategy,
  PlanItem,
  SemanticRoute,
  SemanticRouteParam,
  NavigationRequest,
  NavigationResult,
} from './types';
export type {
  ToolResponse,
  ToolResponseError,
  ToolResultKind,
  ToolErrorCategory,
  ToolDisplay,
  ToolDisplayKind,
} from './types/toolResponse';
export { isToolResponse, buildInvalidArgsEnvelope } from './types/toolResponse';
export { normalizeToolResult, toToolResponseContextView, categorizeThrownError } from './utils/normalizeToolResult';
export { validateToolArgs, formatAjvErrors } from './utils/validateToolArgs';
export { inferToolDisplay } from './utils/inferToolDisplay';
export {
  registerToolDisplayNames,
  clearHostToolDisplayNames,
  lookupToolDisplayName,
  CORE_TOOL_DISPLAY_NAMES,
} from './utils/toolDisplayNameFallbacks';
export { executeToolWithEnvelope } from './utils/executeToolWithEnvelope';
export {
  createAgentContext,
  ToolsService,
  SurfacesService,
  runJavaScriptCode,
  getTurnState,
  registerInvocationPresentation,
  getInvocationPresentation,
  presentToolCall,
  presentToolResult,
  surfacesRegistry,
} from './runtime';
export type {
  AgentPlugin,
  AgentToolsApi,
  AgentSurfacesApi,
  AgentContextHandle,
  CreateAgentContextOptions,
  TurnState,
  RunCodeToolsBridge,
  InvocationIcon,
  InvocationContentMode,
  InvocationCategory,
  InvocationPresentation,
  InvocationPresentationInput,
  PresentCallView,
  PresentResultView,
} from './runtime';
export type {
  AIMutation,
  ToolMutationResult,
  AISurfaceDefinition,
  AISurfaceSnapshot,
} from './types/aiSurface';
