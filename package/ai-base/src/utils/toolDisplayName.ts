import { getFunctionCallDef } from '../registry/functionRegistry';
import type { AIBaseTool } from '../types';
import { lookupToolDisplayName } from './toolDisplayNameFallbacks';

/** 将 functionName 解析为界面展示用中文名称 */
export function resolveToolDisplayName(functionName: string, tools: AIBaseTool[]): string {
  const fallback = lookupToolDisplayName(functionName);
  if (fallback) return fallback;

  const meta = tools.find((tool) => tool.functionName === functionName);
  if (meta?.name?.trim()) {
    const text = meta.name.trim();
    return text.length > 24 ? `${text.slice(0, 24)}…` : text;
  }

  const localDef = getFunctionCallDef(functionName);
  if (localDef?.description?.trim()) {
    const text = localDef.description.trim();
    return text.length > 24 ? `${text.slice(0, 24)}…` : text;
  }

  return functionName;
}

/** 任务清单 ThoughtChain / Surface 标题：首次生成 vs 进度更新 */
export function formatPlanListDisplayName(
  plan: Array<{ status?: string }>,
  mode: 'create' | 'update',
): string {
  const total = plan.length;
  if (mode === 'create') {
    return `生成任务清单 · ${total}项`;
  }
  const completed = plan.filter((item) => item.status === 'completed').length;
  return `更新任务清单 · (${completed}/${total})`;
}

/** 根据成功信封或调用参数补全动态短标题（项数 / Skill 名 / HTTP 路径等） */
export function enrichToolDisplayName(
  functionName: string,
  baseName: string,
  data?: unknown,
): string {
  if (!data || typeof data !== 'object') return baseName;
  const row = data as Record<string, unknown>;
  if (functionName === 'update_plan' && Array.isArray(row.plan)) {
    const mode = row.mode === 'update' ? 'update' : 'create';
    return formatPlanListDisplayName(
      row.plan as Array<{ status?: string }>,
      mode,
    );
  }
  if (functionName === 'skill') {
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (name) return `加载 Skill · ${name}`;
    const slug = typeof row.slug === 'string' ? row.slug : '';
    if (slug) return `加载 Skill · ${slug}`;
  }
  if (functionName === 'http_request') {
    const method = typeof row.method === 'string' ? row.method.toUpperCase() : 'GET';
    let path =
      typeof row.path === 'string'
        ? row.path
        : typeof row.url === 'string'
          ? row.url
          : '';
    if (path && typeof row.url === 'string' && !row.path) {
      try {
        const u = new URL(row.url);
        path = u.pathname + u.search;
      } catch {
        // keep raw
      }
    }
    if (path) {
      const short = path.length > 48 ? `${path.slice(0, 47)}…` : path;
      const status = typeof row.status === 'number' ? row.status : undefined;
      return status != null ? `HTTP ${method} ${short} · ${status}` : `HTTP ${method} ${short}`;
    }
  }
  return baseName;
}
