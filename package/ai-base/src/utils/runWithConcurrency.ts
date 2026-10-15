/**
 * 限制并发的并发执行器：把一组任务按 `limit` 上限分批跑（而非全部一次性 Promise.all）。
 *
 * 用于同一轮 LLM 返回的多个 tool_calls：它们通常彼此独立，可并发执行以降低整体延迟，
 * 但需设上限避免一次性几十个工具同时打爆后端。
 *
 * 结果顺序与输入 items 一一对应（不依赖完成先后），保证 tool_call_id 对齐回灌。
 */
export async function runWithConcurrency<TItem, TResult>(
  items: TItem[],
  limit: number,
  task: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  const safeLimit = Math.max(1, Math.floor(limit) || 1);
  const results: TResult[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await task(items[index], index);
    }
  }

  const workerCount = Math.min(safeLimit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
