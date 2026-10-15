import type { SemanticRoute } from '../types';

export interface SemanticRoutesMarkdownOptions {
  /**
   * 优先注入的 domain 列表（当前页相关）。
   * 非空时：这些 domain 全量列出；其余 domain 只列域名摘要，降低 token。
   */
  preferDomains?: string[];
  /** 非优先域最多展示多少个域名摘要（默认 8） */
  maxOtherDomains?: number;
}

/**
 * 语义路由清单 → 紧凑 Markdown（供 system prompt「可用页面」段注入）。
 * 按 domain 分组；过滤 hidden；可按 preferDomains 截断未激活域。
 */
export function semanticRoutesToMarkdown(
  routes: SemanticRoute[] = [],
  options?: SemanticRoutesMarkdownOptions,
): string {
  const visible = routes.filter((route) => !route.hidden);
  if (visible.length === 0) return '';

  const prefer = new Set(
    (options?.preferDomains || []).map((d) => d.trim()).filter(Boolean),
  );
  const maxOther = options?.maxOtherDomains ?? 8;

  const groups = new Map<string, SemanticRoute[]>();
  for (const route of visible) {
    const domain = route.domain || 'other';
    const list = groups.get(domain) ?? [];
    list.push(route);
    groups.set(domain, list);
  }

  const preferredDomains = prefer.size
    ? [...groups.keys()].filter((d) => prefer.has(d))
    : [...groups.keys()];
  const otherDomains = prefer.size
    ? [...groups.keys()].filter((d) => !prefer.has(d))
    : [];

  const lines: string[] = [];

  const writeFull = (domain: string, items: SemanticRoute[]) => {
    for (const route of items) {
      const paramsText = route.params
        ? `(params: ${Object.keys(route.params).join(', ')})`
        : '';
      const base = `- [${domain}] ${route.title} ${route.path} —— ${route.description}`;
      lines.push(paramsText ? `${base} ${paramsText}` : base);
    }
  };

  for (const domain of preferredDomains) {
    writeFull(domain, groups.get(domain) || []);
  }

  if (otherDomains.length) {
    lines.push('');
    lines.push('### 其他域（摘要，需要时先确认目标页 domain）');
    for (const domain of otherDomains.slice(0, maxOther)) {
      const items = groups.get(domain) || [];
      lines.push(`- [${domain}] ${items.length} 个页面`);
    }
    if (otherDomains.length > maxOther) {
      lines.push(`- …另有 ${otherDomains.length - maxOther} 个域未展开`);
    }
  }

  return lines.join('\n');
}
