import type { ToolResponse } from '../types/toolResponse';
import type { MemoryFact, MemoryFactSubject } from './types';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickSubject(data: unknown): MemoryFactSubject {
  const row = asRecord(data);
  if (!row) return { kind: 'unknown' };
  const nested =
    asRecord(row.entity) ||
    asRecord(row.item) ||
    asRecord(row.resource) ||
    asRecord(row.data) ||
    row;
  const id =
    nested.id != null
      ? String(nested.id)
      : nested.entityId != null
        ? String(nested.entityId)
        : undefined;
  const code =
    nested.code != null
      ? String(nested.code)
      : nested.entityCode != null
        ? String(nested.entityCode)
        : undefined;
  const name =
    nested.name != null
      ? String(nested.name)
      : nested.label != null
        ? String(nested.label)
        : undefined;
  const kind =
    (typeof nested.kind === 'string' && nested.kind) ||
    (typeof nested.type === 'string' && nested.type) ||
    (id || code ? 'Entity' : 'unknown');
  return { kind, ...(id ? { id } : {}), ...(code ? { code } : {}), ...(name ? { name } : {}) };
}

function makeFactId(tool: string, type: string, subject: MemoryFactSubject): string {
  return `${tool}:${type}:${subject.id || subject.code || subject.name || 'x'}:${Date.now().toString(36)}`;
}

/**
 * 从 Tool 信封抽取 L1 原子事实。
 * **必须在 serializeToolResultForContext 之前调用**（读结构化对象，禁止解析裁剪后文本）。
 */
export function extractFactsFromEnvelope(
  envelope: ToolResponse,
  options?: { turnId?: string; toolCallId?: string },
): MemoryFact[] {
  const tool = envelope.meta?.tool || 'unknown';
  const source = {
    turnId: options?.turnId,
    tool,
    toolCallId: options?.toolCallId,
  };
  const ts = Date.now();
  const facts: MemoryFact[] = [];

  if (envelope.kind === 'user_choice_request') {
    const data = asRecord(envelope.data);
    facts.push({
      factId: makeFactId(tool, 'user_decision', { kind: 'UserChoice' }),
      type: 'user_decision',
      subject: { kind: 'UserChoice', id: data?.requestId != null ? String(data.requestId) : undefined },
      predicate: 'requested',
      value: {
        question: data?.question,
        mode: data?.mode,
      },
      source,
      ts,
    });
    return facts;
  }

  if (envelope.kind === 'success' && envelope.ok !== false) {
    const subject = pickSubject(envelope.data);
    if (envelope.verified === true) {
      facts.push({
        factId: makeFactId(tool, 'mutation_result', subject),
        type: 'mutation_result',
        subject,
        predicate: 'verified',
        value: {
          ok: true,
          verified: true,
          tool,
        },
        source,
        ts,
      });
    }
    if (subject.id || subject.code) {
      facts.push({
        factId: makeFactId(tool, 'entity_ref', subject),
        type: 'entity_ref',
        subject,
        predicate: 'observed',
        value: subject,
        source,
        ts,
      });
    }
  }

  return facts;
}
