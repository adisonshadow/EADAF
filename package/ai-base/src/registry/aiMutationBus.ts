import type { AIMutation } from '../types/aiSurface';

type MutationListener = (mutation: AIMutation) => void;

const listeners = new Set<MutationListener>();

export function emitAIMutation(mutation: AIMutation): void {
  listeners.forEach((listener) => {
    try {
      listener(mutation);
    } catch {
      // 单个 listener 失败不影响其它订阅者
    }
  });
}

export function subscribeAIMutation(listener: MutationListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 从 Tool 返回体中提取 mutation 并派发 */
export function emitMutationFromToolResult(result: unknown): void {
  if (!result || typeof result !== 'object') return;
  const mutation = (result as { mutation?: AIMutation }).mutation;
  if (mutation?.domain && mutation?.type) {
    emitAIMutation(mutation);
  }
}
