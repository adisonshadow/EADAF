import type { AIBaseClient } from '../sdk/client';
import type { AIBaseSkill, ResolvedAIChatConfig } from '../types';
import { semanticRoutesToMarkdown } from '../navigation/semanticRoutesToMarkdown';
import {
  buildAskUserProtocol,
  type DecisionPreference,
} from '../config/agentPrefsChannel';
import {
  buildSkillCacheKey,
  getCachedSkillContext,
  setCachedSkillContext,
} from './skillCache';

/**
 * 结构化终止协议：开启 enableStructuredTermination 时注入系统提示词最前面。
 * ask_user 段落随 decisionPreference 变化。
 */
function buildStructuredTerminationProtocol(decisionPreference: DecisionPreference): string {
  return (
    '## Agent 执行协议（硬约束，优先级高于其他 Skill 指令）\n' +
    '你在一个「思考→执行→验收」的循环中工作。必须使用内置 Tool 来管理任务、向用户确认选择与终止：\n\n' +
    '### update_plan —— 任务清单\n' +
    '- 任务开始时：调用 update_plan，把任务拆解为 3-7 个里程碑步骤，全部初始化为 pending，再把第一个设为 in_progress；纯查询/列表/详情类只读任务可退化为 1 个步骤\n' +
    '- 每完成一步、或发现需要新增/调整步骤时：调用 update_plan（merge=true）增量更新状态\n' +
    '- 硬约束：同一时间**有且仅有一个**任务处于 in_progress，禁止并行推进多个步骤\n' +
    '- 标记 completed 前，必须确认该步对应的 Tool 已返回 verified=true\n\n' +
    buildAskUserProtocol(decisionPreference) +
    '\n' +
    '### skill —— 按需加载 Skill 正文\n' +
    '- 下方「Skill 目录」仅含摘要；需要某 Skill 的完整 SOP 时，先调用 skill({ slug }) 再执行任务动作\n' +
    '- 当前页已预取的 Skill 正文见「已加载 Skill」；勿重复加载\n\n' +
    '### task_complete —— 显式终止\n' +
    '- 当且仅当 plan 全部 completed、关键 Tool 全部 verified=true、成功标准全部满足时，调用 task_complete 终止\n' +
    '- **禁止**用自由文本声称「完成」「已处理」「搞定」等——必须调用 task_complete，否则循环不会停止\n' +
    '- 若当前 Skill 明确允许查询型直接收尾，则在只读结果已返回且已回答用户问题时，可直接交付结束，不必为了凑闭环继续自动执行\n' +
    '- task_complete 会校验：未通过时返回未完成项，你必须继续推进后重试，不能无视\n' +
    '- summary 字段写给用户看（做了什么、验证结果、注意事项）\n' +
    '- **必须**填写 next_steps（1～5 条）：id 用英文 snake_case，label 用业务语言且 <30 字；系统会渲染为可点击按钮\n' +
    '- **禁止**再输出 ```a2ui-commands 围栏（系统已从 next_steps 自动渲染）；与 ask_user 边界不变：ask_user=中途决策门，next_steps=阶段完成后可选动作\n\n' +
    '### 每轮工作模式\n' +
    '1. 对账：回顾当前 plan，确认进度，选定要推进的 in_progress 项\n' +
    '2. 执行：对该项做 Read（读现状）→ Modify（改）→ Verify（验证）；需要用户决策时先 ask_user\n' +
    '3. 更新：update_plan 标记完成、推进下一项\n' +
    '4. 终止：全部完成后调用 task_complete\n\n' +
    '### 禁止事项\n' +
    '- 禁止跳过 update_plan 直接堆 Tool 调用\n' +
    '- 禁止用「接下来您可以…」之类的自由文本收尾来代替 task_complete\n' +
    '- 禁止在 task_complete 返回 TASK_INCOMPLETE 后仍向用户声称完成\n' +
    (decisionPreference === 'user'
      ? '- 禁止用口头「请确认」代替 ask_user 做方案取舍或危险操作确认\n'
      : '- 禁止用口头「请确认」代替 ask_user 处理不可逆/高风险操作；常规取舍由你自行决断\n') +
    '- **有专用业务 Tool 时禁止用 http_request 探路**：业务数据用 `bizdata_list_entity_summaries` / `bizdata_list_enums` / `bizdata_entity` / `bizdata_get_entity`；REST 前缀是 `/api/v1/business-data`（不是 `/api/v1/bizdata`）。`http_request` 仅用于确无专用 Tool 的外部探查\n' +
    '- **有专用业务 Tool 时必须直接 native 调用**：禁止用 `run_code` / `run_subagent` 探测可用 Tool 或「发现」能力。`run_code` 仅用于多 Tool 编排或数据计算；`skill` 加载后 grantedTools 已同回合可用\n' +
    '- 若确需在 run_code 内编排：用 `tools.list()` 查看**本回合已授权**业务 Tool（含 server_builtin，不含 http_request/harness），禁止因「以为空」去乱猜 HTTP 路径或绕道 subagent\n' +
    '- `tools` 不是数组：正确写法 `const names = tools.list(); const hits = names.filter(n => n.includes("bizdata_")); await tools[hits[0]]({...})`；禁止 `tools.filter` / `tools.map` / `await tools.list()` 后再对 tools 本身做数组操作'
  );
}

const STRUCTURED_NAVIGATE_PROTOCOL =
  '### navigate_to_page —— 写成功后的页面跳转（硬约束）\n' +
  '- 写操作 verified=true 后，若结果需要在另一页面呈现（创建资源后进带 id 的编辑/详情、跨模块继续下一步），必须立刻调用 navigate_to_page，再继续后续步骤或 task_complete\n' +
  '- 跨步骤工作流（建模→物化→创建 API 等）每完成一个里程碑跳一次；禁止因为「后面还有步骤 / 连续创建」而整段任务一次都不跳\n' +
  '- 仅以下情况不跳：纯问答；已经在目标页；同类型批量创建尚未收尾（批量全部完成后再跳一次即可）\n' +
  '- 每轮工作模式补充：写操作若需换页，先 navigate_to_page，再用 update_plan 标记完成\n' +
  '- path 必须逐字使用「可用页面」清单中的模板；id 等动态参数放 params，禁止拼接 URL 或编造清单外路径\n' +
  '- 返回 navigated=false 时不要重试：reason=disabled 提示用户在设置中开启自动跳转；reason=invalid_target 说明路径不在清单中';

const NAVIGATION_PROTOCOL =
  '### 页面跳转（navigate_to_page）\n' +
  '- 必须跳：写操作成功且结果需在目标页呈现（创建后进带 id 的编辑/详情页）；跨步骤工作流每个里程碑跳一次；用户明确要求打开某页\n' +
  '- 不要跳：纯问答；当前页已能展示结果；同类型批量创建的中途（全部完成后再跳）\n' +
  '- 「连续创建」若跨模块（如实体→API），不是「批量中途」，必须跳\n' +
  '- path 必须逐字使用下方清单中的模板路径（含 :param 时用 params 传参，禁止拼接 URL 或编造清单外的路径）\n' +
  '- id 等动态参数一律放 params，如 params: { id: "u-42" }\n' +
  '- 返回 navigated=false 时：不要重试本工具；reason=disabled 说明自动跳转已关闭（提示用户在设置中开启），reason=invalid_target 说明路径不在清单中';

const FRAMEWORK_SKILL_SLUG = 'aibase-chat-framework';

export interface SkillCatalogEntry {
  slug: string;
  name: string;
  description?: string;
  isGlobal?: boolean;
  /** 正文是否已预取进 system prompt */
  bodyPrefetched?: boolean;
}

async function loadSkill(client: AIBaseClient, slug: string): Promise<AIBaseSkill | null> {
  try {
    return await client.loadSkill(slug);
  } catch {
    return null;
  }
}

async function loadSkillsBySlugs(
  client: AIBaseClient,
  slugs: string[],
): Promise<AIBaseSkill[]> {
  if (!slugs.length) return [];

  try {
    const skills = await client.loadSkills(slugs);
    if (Array.isArray(skills) && skills.length) {
      return skills;
    }
  } catch {
    // 批量失败时降级
  }

  const results = await Promise.all(slugs.map((slug) => loadSkill(client, slug)));
  return results.filter(Boolean) as AIBaseSkill[];
}

function extractTopLevelFromCapabilities(caps: Record<string, unknown> | null | undefined): string {
  const topLevel = caps?.topLevelSkill as { contentMarkdown?: string } | null | undefined;
  return topLevel?.contentMarkdown?.trim() || '';
}

function mergeSkillsBySlug(...groups: AIBaseSkill[][]): AIBaseSkill[] {
  const map = new Map<string, AIBaseSkill>();
  for (const group of groups) {
    for (const skill of group) {
      map.set(skill.slug, skill);
    }
  }
  return Array.from(map.values());
}

function toCatalogEntry(
  item: { slug: string; name?: string; description?: string; isGlobal?: boolean },
  bodyPrefetched: boolean,
): SkillCatalogEntry {
  return {
    slug: item.slug,
    name: item.name || item.slug,
    description: item.description,
    isGlobal: item.isGlobal,
    bodyPrefetched,
  };
}

export interface ChatSkillContext {
  /** 已预取正文的 Skill（注入「已加载 Skill」段 + Tool 池） */
  skills: AIBaseSkill[];
  /** 应用可见 Skill 目录摘要（常驻，不含全文） */
  catalog: SkillCatalogEntry[];
  topLevelSkillMarkdown: string;
}

/**
 * 加载 Skill：目录常驻 + 正文按需。
 * - 预取正文：fallbackSkillSlugs ∪ 全局框架（aibase-chat-framework）
 * - 目录：capabilities 可见集合（或本地已加载）的摘要
 */
export async function loadChatSkillContext(
  client: AIBaseClient,
  config: ResolvedAIChatConfig,
  scopeSlug?: string,
): Promise<ChatSkillContext> {
  const cacheKey = buildSkillCacheKey({
    apiBase: config.apiBase,
    applicationId: config.applicationId,
    scopeSlug: scopeSlug || config.scopeSlug,
    fallbackSlugs: config.fallbackSkillSlugs,
  });
  const cached = getCachedSkillContext(cacheKey);
  if (cached) return cached;

  const localTopLevel = config.topLevelSkillMarkdown.trim();
  const fallbackSlugs = config.fallbackSkillSlugs ?? [];
  const prefetchSlugs = Array.from(
    new Set([...fallbackSlugs, FRAMEWORK_SKILL_SLUG].filter(Boolean)),
  );
  const localSkills = await loadSkillsBySlugs(client, prefetchSlugs);

  if (!config.applicationId) {
    const catalog = localSkills.map((s) =>
      toCatalogEntry(
        { slug: s.slug, name: s.name, description: s.description, isGlobal: true },
        true,
      ),
    );
    const ctx: ChatSkillContext = {
      skills: localSkills,
      catalog,
      topLevelSkillMarkdown: localTopLevel,
    };
    setCachedSkillContext(cacheKey, ctx);
    return ctx;
  }

  try {
    const caps = await client.getCapabilities({
      scopeSlug: scopeSlug || config.scopeSlug,
      applicationId: config.applicationId,
    });
    const topLevelSkillMarkdown =
      localTopLevel || extractTopLevelFromCapabilities(caps as Record<string, unknown>);

    const skillMetas =
      ((caps as Record<string, unknown>)?.skills as Array<{
        slug: string;
        name?: string;
        description?: string;
        isGlobal?: boolean;
      }>) || [];

    const fallbackSet = new Set(fallbackSlugs);
    const prefetchSet = new Set(prefetchSlugs);

    // 预取：框架 + 当前页；其余只进目录
    const remotePrefetchSlugs = skillMetas
      .filter((item) => item.isGlobal === true || fallbackSet.has(item.slug))
      .map((item) => item.slug);
    const remoteSkills = remotePrefetchSlugs.length
      ? await loadSkillsBySlugs(client, remotePrefetchSlugs)
      : [];

    const skills = mergeSkillsBySlug(remoteSkills, localSkills);
    const prefetched = new Set(skills.map((s) => s.slug));

    const catalog: SkillCatalogEntry[] = skillMetas.length
      ? skillMetas.map((item) =>
          toCatalogEntry(item, prefetched.has(item.slug) || prefetchSet.has(item.slug)),
        )
      : skills.map((s) =>
          toCatalogEntry(
            { slug: s.slug, name: s.name, description: s.description },
            true,
          ),
        );

    const ctx: ChatSkillContext = {
      skills,
      catalog,
      topLevelSkillMarkdown,
    };
    setCachedSkillContext(cacheKey, ctx);
    return ctx;
  } catch {
    const catalog = localSkills.map((s) =>
      toCatalogEntry({ slug: s.slug, name: s.name, description: s.description }, true),
    );
    return {
      skills: localSkills,
      catalog,
      topLevelSkillMarkdown: localTopLevel,
    };
  }
}

/** @deprecated 使用 loadChatSkillContext */
export async function loadAllSkills(
  client: AIBaseClient,
  config: ResolvedAIChatConfig,
  scopeSlug?: string,
): Promise<AIBaseSkill[]> {
  const ctx = await loadChatSkillContext(client, config, scopeSlug);
  return ctx.skills;
}

function renderCatalogMarkdown(catalog: SkillCatalogEntry[]): string {
  if (!catalog.length) return '';
  const lines = catalog.map((item) => {
    const flag = item.bodyPrefetched ? '（已加载正文）' : '';
    const desc = (item.description || '无描述').replace(/\s+/g, ' ').trim();
    const short = desc.length > 120 ? `${desc.slice(0, 119)}…` : desc;
    return `- \`${item.slug}\`: ${item.name} — ${short}${flag}`;
  });
  return [
    '## Skill 目录（摘要）',
    '完整 SOP 未预取的 Skill，请先调用 `skill` 工具并传入精确 slug，再执行任务动作。',
    ...lines,
  ].join('\n');
}

export function buildCombinedSystemPrompt(
  skills: AIBaseSkill[],
  config: ResolvedAIChatConfig,
  topLevelMarkdown = '',
  options?: {
    autoNavigate?: boolean;
    decisionPreference?: DecisionPreference;
    catalog?: SkillCatalogEntry[];
  },
): string {
  const topLevel = topLevelMarkdown.trim();
  const catalog = options?.catalog;
  const bodySections = skills.map(
    (skill) =>
      `### ${skill.name} (${skill.slug})\n${skill.contentMarkdown || skill.description || ''}`,
  );
  const hasSemanticRoutes = Boolean(config.semanticRoutes?.length);
  const catalogMarkdown = catalog?.length ? renderCatalogMarkdown(catalog) : '';
  const decisionPreference =
    options?.decisionPreference ?? config.decisionPreference ?? 'user';

  if (
    !topLevel &&
    !bodySections.length &&
    !catalogMarkdown &&
    !config.enableStructuredTermination &&
    !hasSemanticRoutes
  ) {
    return '';
  }

  const parts: string[] = [];
  if (config.enableStructuredTermination) {
    parts.push(buildStructuredTerminationProtocol(decisionPreference));
    if (hasSemanticRoutes && options?.autoNavigate !== false) {
      parts.push(STRUCTURED_NAVIGATE_PROTOCOL);
    }
  }
  if (config.systemPromptPrefix) {
    parts.push(config.systemPromptPrefix);
  }
  if (topLevel) {
    if (parts.length) parts.push('');
    parts.push('## 应用顶层 Skill');
    parts.push(topLevel);
  }
  if (catalogMarkdown) {
    if (parts.length) parts.push('');
    parts.push(catalogMarkdown);
  }
  if (bodySections.length) {
    if (parts.length) parts.push('');
    parts.push('## 已加载 Skill（正文）');
    parts.push(...bodySections);
  }
  if (hasSemanticRoutes) {
    if (parts.length) parts.push('');
    parts.push('## 可用页面');
    const autoNavigateOn = options?.autoNavigate !== false;
    if (autoNavigateOn) {
      parts.push(
        '当前自动跳转开关：已开启。写成功后必须按协议调用 navigate_to_page，不要等全部任务结束才跳。',
      );
      parts.push(NAVIGATION_PROTOCOL);
    } else {
      parts.push(
        '当前自动跳转开关：已关闭。不要调用 navigate_to_page 跳页；用文字说明目标页面，并提示用户可在 AI 助手设置中开启。',
      );
    }
    parts.push(
      semanticRoutesToMarkdown(config.semanticRoutes, {
        preferDomains: config.semanticRouteDomains,
      }),
    );
  }
  return parts.join('\n');
}
