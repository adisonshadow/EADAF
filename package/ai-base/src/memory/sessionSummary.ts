import type { PlanItem } from '../types';
import type { MemoryFact } from './types';
import {
  clearSessionPlan,
  getSessionWorkingMemory,
  setSessionSummary,
} from './sessionWorkingMemory';

/**
 * 任务结束时把 L3 + L1 蒸馏成短摘要写入 L4（本地会话 store）。
 * 不做 LLM 散文摘要：规则拼接可引用字段。
 */
export function distillSessionSummary(
  conversationKey: string,
  options?: {
    deliverySummary?: string;
    clearPlan?: boolean;
  },
): string {
  const mem = getSessionWorkingMemory(conversationKey);
  const plan: PlanItem[] = mem.plan;
  const facts: MemoryFact[] = mem.facts;

  const lines: string[] = [];
  if (options?.deliverySummary?.trim()) {
    lines.push(options.deliverySummary.trim().slice(0, 400));
  }
  const completed = plan.filter((p) => p.status === 'completed');
  if (completed.length) {
    lines.push(
      `已完成 ${completed.length} 项：${completed
        .slice(0, 5)
        .map((p) => p.content)
        .join('；')}`,
    );
  }
  const entities = facts
    .filter((f) => f.type === 'entity_ref' || f.type === 'mutation_result')
    .slice(-8);
  if (entities.length) {
    const refs = entities
      .map((f) => f.subject.code || f.subject.id || f.subject.name)
      .filter(Boolean);
    if (refs.length) {
      lines.push(`涉及实体：${Array.from(new Set(refs)).slice(0, 8).join(', ')}`);
    }
  }

  const summary = lines.join('。').slice(0, 800);
  if (summary) setSessionSummary(conversationKey, summary);
  if (options?.clearPlan !== false) clearSessionPlan(conversationKey);
  return summary;
}
