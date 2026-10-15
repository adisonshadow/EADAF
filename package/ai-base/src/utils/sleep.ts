/**
 * 可中断的 sleep。
 *
 * 用于在续接循环（tool-round / auto-continue）的轮次之间插入最小间隔，
 * 防止短时间内连发大量 LLM 请求打穿上游 Provider 的突发保护。
 *
 * - 传入 AbortSignal 时，若信号被 abort 则立即 resolve（不等满 ms），
 *   使取消操作不必卡满整个 delay 周期。
 * - 不传入 signal 时表现为普通 sleep。
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
