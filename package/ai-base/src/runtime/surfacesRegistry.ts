import { inferToolDisplay } from '../utils/inferToolDisplay';
import { lookupToolDisplayName } from '../utils/toolDisplayNameFallbacks';
import type { ToolDisplay, ToolResponse } from '../types/toolResponse';
import type {
  AgentSurfacesApi,
  InvocationCategory,
  InvocationContentMode,
  InvocationIcon,
  InvocationPresentation,
  InvocationPresentationInput,
  PresentCallFn,
  PresentCallView,
  PresentResultFn,
  PresentResultView,
  SurfaceKindComponent,
} from './surfacesTypes';

const TECHNICAL_DEFAULT: Omit<InvocationPresentation, 'title' | 'icon' | 'contentMode'> = {
  category: 'technical',
  collapseDuring: true,
  collapseAfter: true,
  collapsedPreviewLines: 0,
  maxHeight: 240,
};

const BUSINESS_DEFAULT: Omit<InvocationPresentation, 'title' | 'icon' | 'contentMode'> = {
  category: 'business',
  /** 业务 Tool 内容区默认折叠，用户点开再看 */
  collapseDuring: true,
  collapseAfter: true,
  collapsedPreviewLines: 0,
  maxHeight: 360,
};

/** 内核内置清单（harness + 常见技术 Tool） */
const BUILTIN_PRESENTATIONS: Record<string, InvocationPresentation> = {
  skill: {
    ...TECHNICAL_DEFAULT,
    icon: 'skill',
    title: '加载 Skill',
    contentMode: 'name_output',
  },
  run_code: {
    ...TECHNICAL_DEFAULT,
    icon: 'code',
    title: '执行脚本',
    contentMode: 'in_out',
    maxHeight: 320,
  },
  run_subagent: {
    ...TECHNICAL_DEFAULT,
    icon: 'code',
    title: '子任务编排',
    contentMode: 'in_out',
  },
  http_request: {
    ...TECHNICAL_DEFAULT,
    icon: 'http',
    title: 'HTTP 请求',
    contentMode: 'request_response',
  },
  update_plan: {
    category: 'business',
    icon: 'plan',
    title: '生成任务清单',
    contentMode: 'name_output',
    // 任务清单首次生成默认展开；更新由 presentResult 改为折叠
    collapseDuring: false,
    collapseAfter: false,
    collapsedPreviewLines: 0,
    maxHeight: 360,
  },
  task_complete: {
    ...TECHNICAL_DEFAULT,
    icon: 'plan',
    title: '完成任务',
    contentMode: 'name_output',
  },
  navigate_to_page: {
    ...TECHNICAL_DEFAULT,
    icon: 'nav',
    title: '跳转页面',
    contentMode: 'name_output',
  },
  ask_user: {
    ...TECHNICAL_DEFAULT,
    icon: 'generic',
    title: '询问用户',
    contentMode: 'name_output',
  },
  aibase_read_surfaces: {
    ...TECHNICAL_DEFAULT,
    icon: 'generic',
    title: '读取页面 Surface',
    contentMode: 'name_output',
  },
};

const presentations = new Map<string, InvocationPresentation>();
const presentCallFns = new Map<string, PresentCallFn>();
const presentResultFns = new Map<string, PresentResultFn>();
const kindComponents = new Map<string, SurfaceKindComponent>();

function mergePresentation(
  base: InvocationPresentation,
  patch?: InvocationPresentationInput | Partial<InvocationPresentation>,
): InvocationPresentation {
  if (!patch) return base;
  return {
    category: patch.category ?? base.category,
    icon: patch.icon ?? base.icon,
    title: patch.title ?? base.title,
    contentMode: patch.contentMode ?? base.contentMode,
    collapseDuring: patch.collapseDuring ?? base.collapseDuring,
    collapseAfter: patch.collapseAfter ?? base.collapseAfter,
    collapsedPreviewLines: patch.collapsedPreviewLines ?? base.collapsedPreviewLines,
    maxHeight: patch.maxHeight ?? base.maxHeight,
  };
}

function categoryDefaults(category: InvocationCategory): Omit<
  InvocationPresentation,
  'title' | 'icon' | 'contentMode'
> {
  return category === 'technical' ? { ...TECHNICAL_DEFAULT } : { ...BUSINESS_DEFAULT };
}

/** 名称启发式：未注册时推断 category / icon / contentMode */
export function heuristicPresentation(name: string, titleHint?: string): InvocationPresentation {
  const builtin = BUILTIN_PRESENTATIONS[name];
  if (builtin) return { ...builtin };

  const lower = name.toLowerCase();
  let category: InvocationCategory = 'business';
  let icon: InvocationIcon = 'generic';
  let contentMode: InvocationContentMode = 'name_output';

  if (/http_request|fetch|request/i.test(lower)) {
    category = 'technical';
    icon = 'http';
    contentMode = 'request_response';
  } else if (/run_code|script|eval/i.test(lower)) {
    category = 'technical';
    icon = 'code';
    contentMode = 'in_out';
  } else if (/skill/i.test(lower)) {
    category = 'technical';
    icon = 'skill';
  } else if (/navigate|route/i.test(lower)) {
    category = 'technical';
    icon = 'nav';
  } else if (/plan|task_complete/i.test(lower)) {
    icon = 'plan';
  } else if (/list|query|search|get_|browse/i.test(lower)) {
    icon = 'table';
  } else if (/create|update|delete|upsert|write|insert|publish/i.test(lower)) {
    icon = 'write';
  }

  const title =
    titleHint?.trim() ||
    lookupToolDisplayName(name) ||
    humanizeToolName(name);

  return {
    ...categoryDefaults(category),
    icon,
    title,
    contentMode,
  };
}

/** snake_case functionName → 可读短标题（无静态表时兜底） */
function humanizeToolName(name: string): string {
  const stripped = name
    .replace(/^(bizdata|apiservice|aibase)_/i, '')
    .replace(/_/g, ' ')
    .trim();
  if (!stripped) return name;
  return stripped.length > 28 ? `${stripped.slice(0, 27)}…` : stripped;
}

function ensurePresentation(name: string): InvocationPresentation {
  const key = String(name || '').trim();
  if (!key) {
    return {
      ...BUSINESS_DEFAULT,
      icon: 'generic',
      title: '工具调用',
      contentMode: 'name_output',
    };
  }
  const registered = presentations.get(key);
  if (registered) return registered;
  return heuristicPresentation(key);
}

function shortPath(path: string, max = 48): string {
  if (path.length <= max) return path;
  return `${path.slice(0, max - 1)}…`;
}

function extractHttpSubtitle(data: Record<string, unknown>): string | undefined {
  const method = typeof data.method === 'string' ? data.method.toUpperCase() : 'GET';
  let path =
    typeof data.path === 'string'
      ? data.path
      : typeof data.url === 'string'
        ? data.url
        : '';
  if (path && typeof data.url === 'string' && !data.path) {
    try {
      const u = new URL(data.url);
      path = u.pathname + u.search;
    } catch {
      // keep raw
    }
  }
  if (!path) return method;
  const status = typeof data.status === 'number' ? data.status : undefined;
  const short = shortPath(path);
  return status != null ? `${method} ${short} · ${status}` : `${method} ${short}`;
}

function extractBizSubtitle(args: Record<string, unknown>): string | undefined {
  const keys = [
    'scopeCode',
    'entityCode',
    'codePrefix',
    'code',
    'enumCode',
    'serviceId',
    'serviceCode',
    'slug',
    'metricId',
    'name',
  ] as const;
  for (const key of keys) {
    const value = args[key];
    if (typeof value === 'string' && value.trim()) {
      const text = value.trim();
      return text.length > 40 ? `${text.slice(0, 39)}…` : text;
    }
  }
  if (typeof args.action === 'string' && args.action.trim()) {
    return args.action.trim();
  }
  return undefined;
}

function defaultPresentCall(name: string, args: Record<string, unknown>): PresentCallView {
  const presentation = ensurePresentation(name);
  let title = presentation.title;
  let subtitle: string | undefined;

  if (name === 'skill') {
    const skillName = typeof args.name === 'string' ? args.name.trim() : '';
    const slug = typeof args.slug === 'string' ? args.slug : '';
    subtitle = skillName || slug || undefined;
  } else if (name === 'http_request') {
    subtitle = extractHttpSubtitle(args);
  } else if (name === 'update_plan') {
    const plan = Array.isArray(args.plan) ? args.plan : [];
    const mode = args.mode === 'update' ? 'update' : 'create';
    if (mode === 'update') {
      title = '更新任务清单';
      const completed = plan.filter(
        (p) => p && typeof p === 'object' && (p as { status?: string }).status === 'completed',
      ).length;
      subtitle = `(${completed}/${plan.length})`;
    } else if (plan.length > 0) {
      subtitle = `${plan.length}项`;
    }
  } else if (name === 'run_code') {
    const lang = typeof args.language === 'string' ? args.language : 'javascript';
    subtitle = lang;
  } else if (name === 'navigate_to_page') {
    const routeId = typeof args.routeId === 'string' ? args.routeId : '';
    const path = typeof args.path === 'string' ? args.path : '';
    subtitle = routeId || path || undefined;
  } else {
    subtitle = extractBizSubtitle(args);
  }

  return { title, subtitle, presentation, args };
}

function defaultPresentResult(
  name: string,
  args: Record<string, unknown>,
  envelope: Pick<ToolResponse, 'ok' | 'kind' | 'data' | 'error' | 'verified' | 'display' | 'meta'>,
): PresentResultView {
  const callView = defaultPresentCall(name, args);
  let { title, subtitle, presentation } = callView;

  const data = envelope.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const row = data as Record<string, unknown>;
    if (name === 'skill') {
      const skillName = typeof row.name === 'string' ? row.name.trim() : '';
      const slug = typeof row.slug === 'string' ? row.slug : '';
      subtitle = skillName || slug || subtitle;
    } else if (name === 'http_request') {
      subtitle = extractHttpSubtitle(row) || subtitle;
    } else if (name === 'update_plan' && Array.isArray(row.plan)) {
      const plan = row.plan as Array<{ status?: string }>;
      const mode = row.mode === 'update' ? 'update' : 'create';
      if (mode === 'update') {
        title = '更新任务清单';
        const completed = plan.filter((p) => p.status === 'completed').length;
        subtitle = `(${completed}/${plan.length})`;
        presentation = {
          ...presentation,
          title: '更新任务清单',
          collapseAfter: true,
          collapsedPreviewLines: 0,
        };
      } else {
        title = '生成任务清单';
        subtitle = `${plan.length}项`;
      }
    } else if (!subtitle) {
      subtitle = extractBizSubtitle(row) || subtitle;
    }
  }

  // 应用 presentation 折叠策略到 display（清单优先于 infer 的 collapsed）
  let display = envelope.display ?? inferToolDisplay(envelope);
  if (display) {
    const collapsed =
      display.visibility === 'result_hidden'
        ? true
        : presentation.collapseAfter
          ? true
          : Boolean(display.collapsed);
    display = {
      ...display,
      // Surface body 不再自带标题（由 InvocationCard 标题栏负责）
      title: undefined,
      collapsed,
      previewLines:
        display.previewLines ??
        (collapsed ? presentation.collapsedPreviewLines : undefined),
    };
  }

  return {
    title,
    subtitle,
    presentation,
    display,
    args,
  };
}

function registerPresentation(
  name: string,
  profile: InvocationPresentationInput,
): () => void {
  const key = String(name || '').trim();
  if (!key) throw new Error('registerPresentation: name 不能为空');
  const base = presentations.get(key) || heuristicPresentation(key, profile.title);
  const next = mergePresentation(base, profile);
  presentations.set(key, next);
  return () => {
    if (presentations.get(key) === next) presentations.delete(key);
  };
}

function registerPresentCall(name: string, fn: PresentCallFn): () => void {
  const key = String(name || '').trim();
  if (!key) throw new Error('registerPresentCall: name 不能为空');
  presentCallFns.set(key, fn);
  return () => {
    if (presentCallFns.get(key) === fn) presentCallFns.delete(key);
  };
}

function registerPresentResult(name: string, fn: PresentResultFn): () => void {
  const key = String(name || '').trim();
  if (!key) throw new Error('registerPresentResult: name 不能为空');
  presentResultFns.set(key, fn);
  return () => {
    if (presentResultFns.get(key) === fn) presentResultFns.delete(key);
  };
}

function registerKind(kind: string, component: SurfaceKindComponent): () => void {
  const key = String(kind || '').trim();
  if (!key) throw new Error('registerKind: kind 不能为空');
  kindComponents.set(key, component);
  return () => {
    if (kindComponents.get(key) === component) kindComponents.delete(key);
  };
}

function presentCall(name: string, args: Record<string, unknown> = {}): PresentCallView {
  const key = String(name || '').trim();
  const base = defaultPresentCall(key, args);
  const custom = presentCallFns.get(key);
  if (!custom) return base;
  const patch = custom(args);
  if (!patch) return base;
  return {
    title: patch.title ?? base.title,
    subtitle: patch.subtitle !== undefined ? patch.subtitle : base.subtitle,
    presentation: patch.presentation
      ? mergePresentation(base.presentation, patch.presentation)
      : base.presentation,
    args: patch.args ?? base.args,
  };
}

function presentResult(
  name: string,
  args: Record<string, unknown> | undefined,
  envelope: Pick<ToolResponse, 'ok' | 'kind' | 'data' | 'error' | 'verified' | 'display' | 'meta'>,
): PresentResultView {
  const key = String(name || '').trim();
  const safeArgs = args && typeof args === 'object' ? args : {};
  const base = defaultPresentResult(key, safeArgs, envelope);
  const custom = presentResultFns.get(key);
  if (!custom) return base;

  const patch = custom(safeArgs, envelope);
  if (!patch) return base;

  // 允许直接返回 ToolDisplay
  if (
    patch &&
    typeof patch === 'object' &&
    'kind' in patch &&
    typeof (patch as ToolDisplay).kind === 'string' &&
    !('presentation' in patch) &&
    !('title' in patch && 'subtitle' in patch && 'display' in patch)
  ) {
    const asDisplay = patch as ToolDisplay;
    return {
      ...base,
      display: {
        ...asDisplay,
        title: undefined,
        collapsed: asDisplay.collapsed ?? base.presentation.collapseAfter,
        previewLines:
          asDisplay.previewLines ??
          (asDisplay.collapsed ?? base.presentation.collapseAfter
            ? base.presentation.collapsedPreviewLines
            : undefined),
      },
    };
  }

  const view = patch as Partial<PresentResultView>;
  return {
    title: view.title ?? base.title,
    subtitle: view.subtitle !== undefined ? view.subtitle : base.subtitle,
    presentation: view.presentation
      ? mergePresentation(base.presentation, view.presentation)
      : base.presentation,
    display: view.display
      ? {
          ...view.display,
          title: undefined,
        }
      : base.display,
    args: view.args ?? base.args,
  };
}

/** 模块级 surfaces API（无 Cordis 时也可使用） */
export const surfacesRegistry: AgentSurfacesApi = {
  registerPresentation,
  getPresentation: (name) => ensurePresentation(name),
  listPresentations: () =>
    Array.from(
      new Set([...Object.keys(BUILTIN_PRESENTATIONS), ...presentations.keys()]),
    ).map((name) => ({ name, presentation: ensurePresentation(name) })),
  registerPresentCall,
  registerPresentResult,
  registerKind,
  getKindComponent: (kind) => kindComponents.get(String(kind || '').trim()),
  presentCall,
  presentResult,
};

/** 兼容导出：无 Cordis 时注册 presentation */
export function registerInvocationPresentation(
  name: string,
  profile: InvocationPresentationInput,
): () => void {
  return surfacesRegistry.registerPresentation(name, profile);
}

export function getInvocationPresentation(name: string): InvocationPresentation {
  return surfacesRegistry.getPresentation(name);
}

export function presentToolCall(
  name: string,
  args?: Record<string, unknown>,
): PresentCallView {
  return surfacesRegistry.presentCall(name, args);
}

export function presentToolResult(
  name: string,
  args: Record<string, unknown> | undefined,
  envelope: Pick<ToolResponse, 'ok' | 'kind' | 'data' | 'error' | 'verified' | 'display' | 'meta'>,
): PresentResultView {
  return surfacesRegistry.presentResult(name, args, envelope);
}

/** 测试用：清空自定义注册（保留 builtin 启发式） */
export function clearSurfacesOverrides(): void {
  presentations.clear();
  presentCallFns.clear();
  presentResultFns.clear();
  kindComponents.clear();
}

/** 从 FunctionCallDef.presentation 同步到 registry */
export function syncPresentationFromToolDef(
  name: string,
  presentation?: InvocationPresentationInput | Partial<InvocationPresentation>,
  presentCallFn?: PresentCallFn,
  presentResultFn?: PresentResultFn,
): () => void {
  const disposers: Array<() => void> = [];
  if (presentation) {
    disposers.push(
      registerPresentation(name, {
        title: presentation.title || lookupToolDisplayName(name) || name,
        ...presentation,
      }),
    );
  }
  if (presentCallFn) disposers.push(registerPresentCall(name, presentCallFn));
  if (presentResultFn) disposers.push(registerPresentResult(name, presentResultFn));
  return () => disposers.forEach((d) => d());
}
