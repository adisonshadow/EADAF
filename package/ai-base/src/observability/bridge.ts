import { subscribeToolInvoke } from '../utils/toolInvokeLogger';
import { recordToolMetricSample } from './toolMetrics';
import { recordToolInvokeOnTrace } from './turnTrace';

let wired = false;

/**
 * 将 toolInvoke 日志桥接到 Turn 轨迹与指标（幂等）。
 * AIChatProvider mount 时调用一次即可。
 */
export function ensureObservabilityBridge(): () => void {
  if (wired) {
    return () => undefined;
  }
  wired = true;
  const unsubscribe = subscribeToolInvoke((entry) => {
    recordToolMetricSample({
      name: entry.name,
      success: entry.success,
      durationMs: entry.durationMs,
    });
    recordToolInvokeOnTrace(entry);
  });
  return () => {
    wired = false;
    unsubscribe();
  };
}
