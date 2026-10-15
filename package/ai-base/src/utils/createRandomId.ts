/**
 * 生成 UUID 风格 id。
 *
 * `crypto.randomUUID()` 仅在安全上下文可用（HTTPS / localhost）。
 * 客户用 http://公网IP 或 http://内网IP 打开时该函数不存在，会直接抛错。
 * 非安全上下文仍可用 `getRandomValues`；再不行退回 Date + Math.random。
 */
export function createRandomId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}
