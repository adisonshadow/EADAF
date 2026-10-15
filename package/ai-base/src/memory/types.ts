import type { PlanItem } from '../types';

/** L1 原子事实类型 */
export type MemoryFactType =
  | 'entity_ref'
  | 'mutation_result'
  | 'user_decision'
  | 'page_focus'
  | 'constraint';

export interface MemoryFactSubject {
  kind: string;
  id?: string;
  code?: string;
  name?: string;
}

export interface MemoryFact {
  factId: string;
  type: MemoryFactType;
  subject: MemoryFactSubject;
  predicate: string;
  value: unknown;
  source: {
    turnId?: string;
    tool?: string;
    toolCallId?: string;
  };
  ts: number;
}

/** L3 会话工作记忆 */
export interface SessionWorkingMemory {
  conversationKey: string;
  goal?: string;
  plan: PlanItem[];
  openQuestions: string[];
  doneSummary?: string;
  facts: MemoryFact[];
  /** L4：本会话蒸馏出的短摘要（跨会话可读） */
  sessionSummary?: string;
  updatedAt: number;
}

export const MAX_SESSION_FACTS = 40;
export const MAX_INJECT_FACTS = 12;
