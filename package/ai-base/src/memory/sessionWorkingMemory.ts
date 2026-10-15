import type { PlanItem } from '../types';
import type { MemoryFact, SessionWorkingMemory } from './types';
import { MAX_SESSION_FACTS } from './types';

const sessions = new Map<string, SessionWorkingMemory>();
const STORAGE_KEY = 'eadaf.sessionMemory.v1';

type PersistedStore = Record<
  string,
  {
    plan?: PlanItem[];
    goal?: string;
    facts?: MemoryFact[];
    sessionSummary?: string;
    updatedAt?: number;
  }
>;

function readPersisted(): PersistedStore {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writePersisted(store: PersistedStore): void {
  if (typeof localStorage === 'undefined') return;
  try {
    // 只保留最近 30 个会话，避免 localStorage 膨胀
    const entries = Object.entries(store)
      .sort((a, b) => (b[1].updatedAt ?? 0) - (a[1].updatedAt ?? 0))
      .slice(0, 30);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // ignore quota
  }
}

function persistMemory(mem: SessionWorkingMemory): void {
  const store = readPersisted();
  store[mem.conversationKey] = {
    plan: mem.plan,
    goal: mem.goal,
    facts: mem.facts.slice(-MAX_SESSION_FACTS),
    sessionSummary: mem.sessionSummary,
    updatedAt: mem.updatedAt,
  };
  writePersisted(store);
}

function emptyMemory(conversationKey: string): SessionWorkingMemory {
  return {
    conversationKey,
    plan: [],
    openQuestions: [],
    facts: [],
    updatedAt: Date.now(),
  };
}

function hydrateFromStorage(conversationKey: string): SessionWorkingMemory {
  const stored = readPersisted()[conversationKey];
  if (!stored) return emptyMemory(conversationKey);
  return {
    conversationKey,
    plan: Array.isArray(stored.plan) ? stored.plan : [],
    goal: stored.goal,
    openQuestions: [],
    facts: Array.isArray(stored.facts) ? stored.facts.slice(-MAX_SESSION_FACTS) : [],
    sessionSummary: stored.sessionSummary,
    doneSummary: stored.sessionSummary,
    updatedAt: stored.updatedAt ?? Date.now(),
  };
}

export function getSessionWorkingMemory(conversationKey: string): SessionWorkingMemory {
  const key = String(conversationKey || '').trim() || 'default';
  let mem = sessions.get(key);
  if (!mem) {
    mem = hydrateFromStorage(key);
    sessions.set(key, mem);
  }
  return mem;
}

export function ensureSessionWorkingMemory(conversationKey: string): SessionWorkingMemory {
  return getSessionWorkingMemory(conversationKey);
}

export function getSessionPlan(conversationKey: string): PlanItem[] {
  return getSessionWorkingMemory(conversationKey).plan;
}

export function setSessionPlan(conversationKey: string, plan: PlanItem[]): void {
  const mem = getSessionWorkingMemory(conversationKey);
  mem.plan = plan;
  mem.updatedAt = Date.now();
  persistMemory(mem);
}

export function setSessionGoal(conversationKey: string, goal: string | undefined): void {
  const mem = getSessionWorkingMemory(conversationKey);
  mem.goal = goal?.trim() || undefined;
  mem.updatedAt = Date.now();
  persistMemory(mem);
}

export function appendSessionFacts(conversationKey: string, facts: MemoryFact[]): void {
  if (!facts.length) return;
  const mem = getSessionWorkingMemory(conversationKey);
  const next = [...mem.facts, ...facts];
  // 同 subject.id + type + predicate 去重，保留最新
  const seen = new Map<string, MemoryFact>();
  for (const fact of next) {
    const dedupeKey = [
      fact.type,
      fact.subject.kind,
      fact.subject.id || fact.subject.code || '',
      fact.predicate,
    ].join('::');
    seen.set(dedupeKey, fact);
  }
  mem.facts = Array.from(seen.values()).slice(-MAX_SESSION_FACTS);
  mem.updatedAt = Date.now();
  persistMemory(mem);
}

export function getSessionFacts(conversationKey: string): MemoryFact[] {
  return getSessionWorkingMemory(conversationKey).facts;
}

export function setSessionSummary(conversationKey: string, summary: string | undefined): void {
  const mem = getSessionWorkingMemory(conversationKey);
  mem.sessionSummary = summary?.trim() || undefined;
  mem.doneSummary = mem.sessionSummary;
  mem.updatedAt = Date.now();
  persistMemory(mem);
}

export function getSessionSummary(conversationKey: string): string | undefined {
  return getSessionWorkingMemory(conversationKey).sessionSummary;
}

/** 任务完成：清空 plan，保留 facts / summary */
export function clearSessionPlan(conversationKey: string): void {
  const mem = getSessionWorkingMemory(conversationKey);
  mem.plan = [];
  mem.openQuestions = [];
  mem.goal = undefined;
  mem.updatedAt = Date.now();
  persistMemory(mem);
}

/** 测试 / 切会话清理 */
export function resetSessionWorkingMemory(conversationKey?: string): void {
  if (conversationKey == null) {
    sessions.clear();
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
    return;
  }
  const key = String(conversationKey || '').trim() || 'default';
  sessions.delete(key);
  const store = readPersisted();
  delete store[key];
  writePersisted(store);
}

/** 列出最近其它会话摘要（供 L4 开场注入，排除当前会话） */
export function listOtherSessionSummaries(
  currentKey: string,
  limit = 3,
): Array<{ conversationKey: string; summary: string }> {
  // 合并内存 + 持久化，避免只开过一次的会话摘要丢失
  const store = readPersisted();
  for (const [key, row] of Object.entries(store)) {
    if (!sessions.has(key) && row.sessionSummary) {
      sessions.set(key, hydrateFromStorage(key));
    }
  }

  const rows: Array<{ conversationKey: string; summary: string; updatedAt: number }> = [];
  for (const mem of sessions.values()) {
    if (mem.conversationKey === currentKey) continue;
    if (!mem.sessionSummary?.trim()) continue;
    rows.push({
      conversationKey: mem.conversationKey,
      summary: mem.sessionSummary.trim(),
      updatedAt: mem.updatedAt,
    });
  }
  return rows
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
    .map(({ conversationKey, summary }) => ({ conversationKey, summary }));
}
