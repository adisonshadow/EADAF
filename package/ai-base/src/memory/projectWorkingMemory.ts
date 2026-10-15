import type { AISurfaceSnapshot } from '../types/aiSurface';
import type { ChatReferenceItem } from '../provider/ChatReferenceContext';
import type { MemoryFact } from './types';
import { MAX_INJECT_FACTS } from './types';
import type { SessionWorkingMemory } from './types';
import type { PlanItem } from '../types';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickFocus(data: unknown): Record<string, unknown> | null {
  const row = asRecord(data);
  if (!row) return null;
  const focus =
    asRecord(row.focus) ||
    asRecord(row.selected) ||
    asRecord(row.entity) ||
    asRecord(row.current);
  if (focus) {
    const id = focus.id ?? focus.entityId;
    const code = focus.code ?? focus.entityCode;
    const name = focus.name ?? focus.label;
    if (id == null && code == null && name == null) return null;
    return {
      kind: focus.kind ?? focus.type ?? 'Entity',
      ...(id != null ? { id: String(id) } : {}),
      ...(code != null ? { code: String(code) } : {}),
      ...(name != null ? { name: String(name) } : {}),
    };
  }
  const id = row.id ?? row.entityId;
  const code = row.code ?? row.entityCode;
  if (id == null && code == null) return null;
  return {
    kind: row.kind ?? row.type ?? 'Entity',
    ...(id != null ? { id: String(id) } : {}),
    ...(code != null ? { code: String(code) } : {}),
    ...(row.name != null || row.label != null
      ? { name: String(row.name ?? row.label) }
      : {}),
  };
}

export interface SceneCardInput {
  route?: string;
  surfaces: AISurfaceSnapshot[];
  pinnedRefs?: ChatReferenceItem[];
  maxSurfaces?: number;
}

/** L2 场景卡：有预算的提炼，禁止整包 JSON */
export function buildSceneCard(input: SceneCardInput): string {
  const maxSurfaces = input.maxSurfaces ?? 4;
  const lines: string[] = ['## 当前场景'];
  if (input.route) lines.push(`- route: ${input.route}`);

  const surfaces = input.surfaces.slice(0, maxSurfaces);
  if (!surfaces.length && !(input.pinnedRefs?.length)) {
    return '';
  }

  for (const surface of surfaces) {
    const focus = pickFocus(surface.data);
    const data = asRecord(surface.data);
    const formDirty = data?.formDirty === true;
    lines.push(`- surface: ${surface.domain}/${surface.id}${surface.label ? ` (${surface.label})` : ''}`);
    if (focus) {
      const parts = [
        focus.kind,
        focus.id ? `id=${focus.id}` : '',
        focus.code ? `code=${focus.code}` : '',
        focus.name ? `name=${focus.name}` : '',
      ].filter(Boolean);
      lines.push(`  focus: { ${parts.join(', ')} }`);
    }
    const fieldOutline = Array.isArray(data?.fields) ? data.fields : [];
    if (fieldOutline.length) {
      const keys = fieldOutline
        .map((item) => {
          const row = asRecord(item);
          const key = row?.key != null ? String(row.key) : '';
          if (!key) return '';
          const required = row?.required === true;
          return required ? `${key}*` : key;
        })
        .filter(Boolean)
        .slice(0, 20);
      if (keys.length) {
        const more = fieldOutline.length > keys.length ? ` …+${fieldOutline.length - keys.length}` : '';
        lines.push(`  fields: ${keys.join(', ')}${more}`);
      }
    }
    if (formDirty) lines.push('  formDirty: true');
  }

  if (input.pinnedRefs?.length) {
    lines.push('- pinnedRefs:');
    for (const ref of input.pinnedRefs.slice(0, 8)) {
      lines.push(`  - [${ref.type}] ${ref.label} (id: ${ref.id})`);
    }
  }

  return lines.join('\n');
}

export function projectPlanMarkdown(plan: PlanItem[], goal?: string): string {
  if (!plan.length && !goal?.trim()) return '';
  const lines: string[] = ['## 工作记忆（L3）'];
  if (goal?.trim()) lines.push(`- goal: ${goal.trim()}`);
  if (plan.length) {
    lines.push('- plan:');
    for (const item of plan.slice(0, 16)) {
      lines.push(`  - [${item.status}] ${item.id}: ${item.content}`);
    }
  }
  return lines.join('\n');
}

function factLine(fact: MemoryFact): string {
  const subj = [
    fact.subject.kind,
    fact.subject.id ? `id=${fact.subject.id}` : '',
    fact.subject.code ? `code=${fact.subject.code}` : '',
    fact.subject.name ? `name=${fact.subject.name}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const value =
    typeof fact.value === 'string'
      ? fact.value
      : fact.value == null
        ? ''
        : JSON.stringify(fact.value);
  const short = value.length > 120 ? `${value.slice(0, 119)}…` : value;
  return `- [${fact.type}] ${subj} ${fact.predicate}${short ? ` → ${short}` : ''}${
    fact.source.tool ? ` (via ${fact.source.tool})` : ''
  }`;
}

/** 按当前场景实体 id/code 相交过滤；无焦点时取最近事实 */
export function projectFactsMarkdown(
  facts: MemoryFact[],
  focusIds: Set<string>,
  limit = MAX_INJECT_FACTS,
): string {
  if (!facts.length) return '';
  const sorted = [...facts].sort((a, b) => b.ts - a.ts);
  const matched = focusIds.size
    ? sorted.filter((f) => {
        const id = f.subject.id;
        const code = f.subject.code;
        return (id && focusIds.has(id)) || (code && focusIds.has(code));
      })
    : sorted;
  const picked = (matched.length ? matched : sorted).slice(0, limit);
  if (!picked.length) return '';
  return ['## 相关事实（L1）', ...picked.map(factLine)].join('\n');
}

export function projectSessionSummaryMarkdown(
  currentSummary: string | undefined,
  otherSummaries: Array<{ conversationKey: string; summary: string }>,
): string {
  const lines: string[] = [];
  if (currentSummary?.trim()) {
    lines.push('## 本会话摘要（L4）', currentSummary.trim());
  }
  if (otherSummaries.length) {
    lines.push('## 近期会话摘要（L4）');
    for (const row of otherSummaries) {
      lines.push(`- [${row.conversationKey}] ${row.summary}`);
    }
  }
  return lines.join('\n');
}

export function collectFocusIdsFromSurfaces(surfaces: AISurfaceSnapshot[]): Set<string> {
  const ids = new Set<string>();
  for (const surface of surfaces) {
    const focus = pickFocus(surface.data);
    if (focus?.id) ids.add(String(focus.id));
    if (focus?.code) ids.add(String(focus.code));
  }
  return ids;
}

/** 组装每轮常驻注入块（L3 + L2 + L1 + L4），有预算截断 */
export function buildWorkingMemoryInjection(options: {
  memory: SessionWorkingMemory;
  sceneCard: string;
  focusIds: Set<string>;
  otherSummaries?: Array<{ conversationKey: string; summary: string }>;
  maxChars?: number;
}): string {
  const maxChars = options.maxChars ?? 6_000;
  const parts = [
    projectPlanMarkdown(options.memory.plan, options.memory.goal),
    options.sceneCard,
    projectFactsMarkdown(options.memory.facts, options.focusIds),
    projectSessionSummaryMarkdown(options.memory.sessionSummary, options.otherSummaries ?? []),
  ].filter((p) => p.trim());

  let text = parts.join('\n\n');
  if (text.length <= maxChars) return text;
  // 超预算时优先保留 L3 + L2
  const priority = [
    projectPlanMarkdown(options.memory.plan, options.memory.goal),
    options.sceneCard,
  ].filter((p) => p.trim());
  text = priority.join('\n\n');
  if (text.length > maxChars) return `${text.slice(0, maxChars - 20)}\n…[memory truncated]`;
  return text;
}
