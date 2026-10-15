import type { ChatReferenceItem } from '../provider/ChatReferenceContext';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * 引用只注入 {type, label, id} 指针，禁止整包 JSON（避免把表格行灌进 user 消息）。
 * 若 content 含 id/code 等，附加一行短标识便于模型对齐 L1。
 */
export function formatReferencePointer(ref: ChatReferenceItem): string {
  const row = asRecord(ref.content);
  const contentId =
    row?.id != null
      ? String(row.id)
      : row?.entityId != null
        ? String(row.entityId)
        : undefined;
  const code =
    row?.code != null
      ? String(row.code)
      : row?.entityCode != null
        ? String(row.entityCode)
        : undefined;
  const extras = [
    contentId && contentId !== ref.id ? `ref=${contentId}` : '',
    code ? `code=${code}` : '',
  ]
    .filter(Boolean)
    .join(', ');
  return `- [${ref.type}] ${ref.label} (id: ${ref.id}${extras ? `; ${extras}` : ''})`;
}

export function formatMessageWithReferences(query: string, refs: ChatReferenceItem[]): string {
  if (!refs.length) return query;

  const refBlock = refs.map((ref) => formatReferencePointer(ref)).join('\n');

  return `[引用上下文]\n${refBlock}\n\n用户问题：${query}`;
}
