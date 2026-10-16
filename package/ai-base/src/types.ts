/**
 * AI 助手 UI 展示方式：
 * - sidebar：右侧固定侧边栏，展开时挤压主内容区
 * - float：仅漂浮按钮，面板以浮层打开（不挤压主内容区）
 * - hidden：完全不挂载聊天 UI，DOM 中不存在任何相关节点
 */
export type AIChatDisplayMode = 'sidebar' | 'float' | 'hidden';

/** AI 助手外观模式：auto 跟随系统 prefers-color-scheme */
export type AIBaseThemeMode = 'light' | 'dark' | 'auto';

/** 解析后的实际外观（不含 auto） */
export type AIBaseResolvedTheme = 'light' | 'dark';

export interface AIChatPromptItem {
  key: string;
  description: string;
}

export interface AIChatConfig {
  apiBase?: string;
  scopeSlug?: string;
  /**
   * 当前业务应用系统 ID（应用列表中的 application_id，可选）。
   * 配置后：加载「全局 Skill + fallbackSkillSlugs 页面 Skill」（不再加载全部专用 Skill，避免 Tool/指引稀释）；
   * 未配置：仅加载 fallbackSkillSlugs 指定的本地 Skill。
   */
  applicationId?: string;
  getToken?: () => string | null;
  /** 本地 client 代码显式配置的 Skill slug 列表（如页面 AIChatPageScope 传入） */
  fallbackSkillSlugs?: string[];
  /**
   * 应用顶层 Skill 说明（Markdown）。非空时优先于远端 applicationId 对应内容。
   * 可在 AIChatProvider 或 AIChatPageScope 初始化时直接注入。
   */
  topLevelSkillMarkdown?: string;
  systemPromptPrefix?: string;
  welcome?: { title: string; description: string };
  prompts?: AIChatPromptItem[];
  panelWidth?: number;
  headerOffset?: number;
  /** 聊天面板标题栏文案，默认「AI 助手」 */
  headerCaption?: string;
  defaultOpen?: boolean;
  /**
   * 与路由层 `AIChatDisplay mode="hidden"` 配合：首屏同步判断（路由懒加载前 wrapper 尚未挂载时避免闪烁）。
   * 应与使用 AIChatHidden wrapper 的路径保持一致。
   */
  hiddenPaths?: string[];
  /** 调试：向 LLM 暴露全部已注册 client Tool，忽略 Skill 关联限制 */
  exposeAllClientTools?: boolean;
  /** A2UI 下一步 Action id → 用户消息（点击按钮时发送） */
  nextStepPrompts?: Record<string, string | ((context: Record<string, unknown>) => string)>;
  /**
   * 单次 Tool 结果回灌上下文时的字符预算上限（全局默认值）。
   * 单个 Tool 可通过 resultBudget.maxChars 覆盖此默认。
   * 默认 8000 字符。
   */
  maxToolResultChars?: number;
  /**
   * 续接循环（tool-round / auto-continue）每轮 LLM 请求之间的最小间隔（毫秒）。
   * 防止单次用户消息内密集连发请求打穿上游 Provider 的突发保护。
   * 默认 600ms；对 DeepSeek 等容忍较高的 Provider 可设为 0 关闭节流。
   */
  roundDelayMs?: number;
  /**
   * 灰度开关：开启结构化终止（task_complete / update_plan）机制。
   * - true（默认）：注入 task_complete / update_plan；text-only 默认续命直至验收。
   * - false：回退旧 auto-continue（text-only 默认 STOP）。
   */
  enableStructuredTermination?: boolean;
  /**
   * 语义化路由清单（业务页面事实源的 AI 侧精简视图，由前端 semanticRegistry 派生）。
   */
  semanticRoutes?: SemanticRoute[];
  /**
   * 当前页优先注入的语义路由 domain（MS2：未激活域仅摘要）。
   * 例：['bizdata', 'api_services']
   */
  semanticRouteDomains?: string[];
  /**
   * 「自动跳转」开关默认值（默认 true）。
   * 仅约束 harness `navigate_to_page`；业务 `*_navigate` 工具不受此开关约束。
   * 用户一旦在设置面板关闭过，userHabit 覆盖此默认值（关过一次不回弹）。
   */
  autoNavigate?: boolean;
  /**
   * 同一步内最多同时运行的并行 Tool 数（默认 10，范围 1–32）。
   * 用户设置经 userHabit 覆盖。
   */
  toolConcurrency?: number;
  /**
   * 面临抉择时倾向（默认 user）：
   * - user：优先 ask_user 让用户选
   * - ai：优先由 AI 自行决断（危险/不可逆仍建议 ask_user）
   * 用户设置经 userHabit 覆盖。
   */
  decisionPreference?: 'user' | 'ai';
  /**
   * 思考内容显示方式（默认 collapsed）：
   * - collapsed：只显示思考标题（blink），正文折叠，点击展开
   * - preview3：只滚动显示最后 3 行，点击展开全部
   * - full：流式过程展开全文（结束后自动折叠）
   * 用户设置经 userHabit 覆盖。
   */
  reasoningDisplayMode?: 'collapsed' | 'preview3' | 'full';
  /**
   * 业务 / 宿主 Tool 语义化展示名（functionName → 中文短标题）。
   * 注入后优先于内核 harness 默认表；用于 InvocationCard 标题栏。
   * 典型：EADAF 传入 bizdata_* / apiservice_* 映射。
   */
  toolDisplayNames?: Record<string, string>;
  /**
   * AI 助手外观主题（默认 light）。
   * - light / dark：固定外观
   * - auto：跟随系统 prefers-color-scheme
   * 仅作用于 AI 侧栏 / 浮钮，不影响宿主应用。
   * 用户一旦在设置面板切换过，userHabit 覆盖此默认值（切过一次不回弹）。
   */
  theme?: AIBaseThemeMode;
  /**
   * 跳转执行器：接收语义 path + params，做白名单校验并执行 history.push。
   * 由前端 AIChatProvider 在 mount 时经 registerNavigationHandler 注入。
   * ai-base 不依赖 react-router，跳转完全由该 handler 完成。
   */
  navigate?: (req: NavigationRequest) => NavigationResult | Promise<NavigationResult>;
}

/* -------------------------------------------------------------------------- */
/* 语义化路由（AI 决策跳转）                                                    */
/* -------------------------------------------------------------------------- */

/** 页面路径参数声明（供 AI 理解与参数类型校验） */
export interface SemanticRouteParam {
  type: 'string' | 'number';
  description: string;
  example?: string;
}

/**
 * 业务页语义条目（AI 侧精简消费类型；与前端 AppSemanticRoute 对齐可映射）。
 * 前端 toAIChatSemanticRoutes() 负责过滤 redirect、映射 hiddenFromAI → hidden。
 */
export interface SemanticRoute {
  path: string;
  title: string;
  /** AI 决策依据，1~2 句 */
  description: string;
  /** 业务域分组（prompt 中按此分组展示，如 member_org / bizdata） */
  domain: string;
  /** 可选动作词（AI 可据此判断何时适合跳转） */
  actions?: string[];
  keywords?: string[];
  /** 路径参数声明（如 { id: { type: 'string', description: '成员 id' } }） */
  params?: Record<string, SemanticRouteParam>;
  /** true：不进 AI prompt，仍可进白名单（若需要可跳） */
  hidden?: boolean;
}

/** AI 请求跳转的语义化目标（path 必须是清单中的模板，参数经 params 携带） */
export interface NavigationRequest {
  path: string;
  params?: Record<string, unknown>;
}

export type NavigationResult =
  | { navigated: true; path: string }
  | {
      navigated: false;
      reason: 'no_handler' | 'invalid_target' | 'disabled';
      message?: string;
    };

export interface ResolvedAIChatConfig {
  apiBase: string;
  scopeSlug?: string;
  applicationId?: string;
  getToken: () => string | null;
  fallbackSkillSlugs: string[];
  topLevelSkillMarkdown: string;
  systemPromptPrefix: string;
  welcome: { title: string; description: string };
  prompts: AIChatPromptItem[];
  panelWidth: number;
  headerOffset: number;
  headerCaption: string;
  defaultOpen: boolean;
  hiddenPaths: string[];
  exposeAllClientTools: boolean;
  nextStepPrompts: Record<string, string | ((context: Record<string, unknown>) => string)>;
  /** 单次 Tool 结果回灌上下文时的字符预算上限（全局默认值） */
  maxToolResultChars: number;
  /** 续接循环每轮 LLM 请求之间的最小间隔（毫秒），默认 600 */
  roundDelayMs: number;
  /** 是否开启结构化终止（task_complete / update_plan）机制，默认 true */
  enableStructuredTermination: boolean;
  /** 语义化路由清单（非空时注入可用页面 prompt 与 navigate_to_page 工具） */
  semanticRoutes: SemanticRoute[];
  /** 当前页优先的语义路由 domain（未激活域仅摘要） */
  semanticRouteDomains: string[];
  /** 「自动跳转」开关默认值（true），用户设置经 userHabit 覆盖 */
  autoNavigate: boolean;
  /** 同一步并行 Tool 上限默认值（10），用户设置经 userHabit 覆盖 */
  toolConcurrency: number;
  /** 抉择倾向默认值（user），用户设置经 userHabit 覆盖 */
  decisionPreference: 'user' | 'ai';
  /** 思考内容显示方式默认值（collapsed），用户设置经 userHabit 覆盖 */
  reasoningDisplayMode: 'collapsed' | 'preview3' | 'full';
  /** 宿主注入的 Tool 展示名（functionName → 中文） */
  toolDisplayNames: Record<string, string>;
  /** AI 助手外观主题默认值（light），用户设置经 userHabit 覆盖 */
  theme: AIBaseThemeMode;
  /** 跳转执行器（白名单 + history.push），由前端注入 */
  navigate?: (req: NavigationRequest) => NavigationResult | Promise<NavigationResult>;
}

export interface AIBaseScope {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

export interface AIBaseTool {
  id: string;
  name: string;
  slug: string;
  functionName: string;
  description?: string;
  executionType: 'client' | 'server_http' | 'server_builtin';
  parametersSchema?: Record<string, unknown>;
  reviewMarkdown?: string;
  openaiTool?: OpenAIToolDefinition;
  /**
   * 是否允许本地同名 client Tool handler 覆盖 server 类型（server_http/server_builtin）的执行。
   * 默认 false：按 executionType 声明分派，本地同名 def 不再隐式拦截 server 工具。
   * 显式 true 时，本地存在同名 def 则改由本地执行。
   */
  allowClientOverride?: boolean;
  /** 该 Tool 结果回灌上下文时的字符预算（覆盖 AIChatConfig.maxToolResultChars） */
  resultBudget?: { maxChars: number };
  /** 写操作 Tool：verified 不为 true 时规范为 business_error */
  requiresVerification?: boolean;
}

export interface OpenAIToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface AIBaseSkill {
  id: string;
  name: string;
  slug: string;
  description?: string;
  contentMarkdown: string;
  scopeId?: string | null;
  scopeSlug?: string | null;
  tools?: AIBaseTool[];
  openaiTools?: OpenAIToolDefinition[];
  /**
   * 声明式 auto-continue 策略（取代 SDK 内硬编码的业务判定）。
   * 可由后端 Skill 元数据下发，也可由前端 registerSkillCompletionPolicy 覆盖。
   */
  completionStrategy?: SkillCompletionStrategy;
}

/**
 * Skill 完成策略 —— 声明式驱动 auto-continue，取代 SDK 内硬编码的业务正则与工具名集合。
 * 由业务方（而非 SDK）声明：哪些 Tool 必须调用、什么文本算任务完成、是否连续执行。
 */
export interface SkillCompletionStrategy {
  /** 关键 Tool functionName 列表；匹配方式见 requiredToolsMode */
  requiredTools?: string[];
  /**
   * requiredTools 匹配方式：
   * - `all`（默认）：列表内全部须已调用
   * - `any`：至少调用其中一个（互斥替代 Tool，如单条/批量创建）
   */
  requiredToolsMode?: 'all' | 'any';
  /** 文本中出现这些关键词时视为「任务完成」，停止 auto-continue */
  completionKeywords?: string[];
  /** 文本中出现这些关键词时禁止 auto-continue（如收尾建议句） */
  blockKeywords?: string[];
  /** 连续执行型 Skill（如 test-fix 循环），不受「一次一事」限制 */
  continuousExecution?: boolean;
  /**
   * 条件约束：文本命中 keywords 时，requiredTools 必须全部已调用。
   * 用于「声称发布成功」须调用 publish Tool，而不强制每次对话都调用 publish。
   */
  claimRules?: Array<{
    keywords: string[];
    requiredTools: string[];
  }>;
  /**
   * 结构化终止（task_complete）的校验强度。仅在开启
   * `AIChatConfig.enableStructuredTermination` 时生效：
   * - `strict`（默认）：task_complete 须通过三层校验
   *   （plan 全完成 + 关键 Tool 全 verified + successCriteria 全满足）
   * - `plan-only`：只校验 plan 全 completed，不重复验 Tool / successCriteria
   * - `off`：task_complete 无条件通过（向后兼容纯对话型 Skill）
   */
  terminationStrictness?: 'strict' | 'plan-only' | 'off';
  /**
   * 查询/只读型任务可在「结果已返回且已直接回答用户问题」后自然终止，
   * 无需强制补一次 task_complete。
   * 仅建议用于列表/详情/检索类 Skill；默认 false。
   */
  allowDirectAnswerTermination?: boolean;
  /**
   * 可验证的成功标准（对应成熟闭环流程的 TaskSpec.success_criteria）。
   * `strict` 模式下，task_complete 调用须逐条勾选满足情况，harness 校验是否全满足。
   */
  successCriteria?: string[];
  /**
   * 同性质批量 Tool 调用结果的聚合策略（阶段 E）。
   * 同一轮内同一 Tool 被多次调用且达到 minBatchSize 时，
   * 把回灌给 LLM 的上下文压缩成一条摘要消息（UI 展示不变）。
   */
  resultAggregation?: {
    /** 触发聚合的 Tool functionName 列表（如 ['apiservice_run_test']） */
    tools: string[];
    /** 单批聚合阈值，达到才聚合（默认 3） */
    minBatchSize?: number;
  };
}

/**
 * 结构化任务清单（Plan）的单项。由 `update_plan` Tool 维护，
 * harness 持有权威状态，用于每轮对账与 task_complete 的终止校验。
 */
export interface PlanItem {
  id: string;
  /** 任务描述（做什么） */
  content: string;
  /** 当前状态 */
  status: 'pending' | 'in_progress' | 'completed';
  /**
   * 完成该任务须调用的关键 Tool。用于 task_complete 的 verification 校验：
   * 这些 Tool 在 toolOutcomes 中必须全部 verified=true。
   */
  requiresVerification?: string[];
}

export interface AIBaseModelInfo {
  slug: string;
  displayName: string;
  /** 能力标签：text / vision / audio_input / audio_output / function_calling 等 */
  capabilities?: string[];
  /** 输入模态：text / image / audio / video / file（附件门控用） */
  inputTags?: string[];
  outputTags?: string[];
}

export interface AIBaseClientOptions {
  baseUrl?: string;
  getToken?: () => string | null;
}

export interface ToolInvokeResult {
  executionType?: string;
  result?: unknown;
  message?: string;
}

export interface FunctionCallDef<TArgs = Record<string, unknown>, TResult = unknown> {
  /** functionName，与 Skill 关联 Tool 同名时可提供 client 执行实现 */
  name: string;
  description: string;
  parameters: object;
  handler: (args: TArgs) => Promise<TResult>;
  /** 该 Tool 结果回灌上下文时的字符预算（覆盖 AIChatConfig.maxToolResultChars） */
  resultBudget?: { maxChars: number };
  /** 写操作 Tool：verified 不为 true 时规范为 business_error */
  requiresVerification?: boolean;
  /**
   * 调用卡片壳配置（写入 ctx.surfaces presentation 清单）。
   * 未声明时走内核 builtin / 名称启发式。
   */
  presentation?: {
    category?: 'technical' | 'business';
    icon?: 'skill' | 'http' | 'code' | 'plan' | 'table' | 'write' | 'nav' | 'generic';
    title?: string;
    contentMode?: 'in_out' | 'name_output' | 'request_response';
    collapseDuring?: boolean;
    collapseAfter?: boolean;
    collapsedPreviewLines?: number;
    maxHeight?: number;
  };
  /** 自定义调用时标题栏（args → title/subtitle） */
  presentCall?: (args: TArgs) => { title?: string; subtitle?: string } | void;
  /** 自定义结果展示；可返回 ToolDisplay 或覆盖 chrome */
  presentResult?: (
    args: TArgs,
    envelope: import('./types/toolResponse').ToolResponse,
  ) =>
    | import('./types/toolResponse').ToolDisplay
    | {
        title?: string;
        subtitle?: string;
        display?: import('./types/toolResponse').ToolDisplay;
      }
    | void;
}
