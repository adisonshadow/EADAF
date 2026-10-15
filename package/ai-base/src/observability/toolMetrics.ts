/**
 * Tool 调用指标聚合（MS6 / p2-observability）：按 name 统计成功率与耗时分位。
 */

export interface ToolMetric {
  name: string;
  calls: number;
  successes: number;
  failures: number;
  successRate: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  avgMs: number;
}

const MAX_SAMPLES_PER_TOOL = 1000;

type Sample = { success: boolean; durationMs: number };

const samples = new Map<string, Sample[]>();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore
    }
  });
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function recordToolMetricSample(entry: {
  name: string;
  success: boolean;
  durationMs: number;
}): void {
  if (!entry.name || entry.name.startsWith('ai_termination_reason:')) return;
  const list = samples.get(entry.name) || [];
  list.push({ success: entry.success, durationMs: entry.durationMs });
  if (list.length > MAX_SAMPLES_PER_TOOL) {
    list.splice(0, list.length - MAX_SAMPLES_PER_TOOL);
  }
  samples.set(entry.name, list);
  notify();
}

export function getToolMetrics(): ToolMetric[] {
  const out: ToolMetric[] = [];
  for (const [name, list] of samples) {
    const durations = list.map((s) => s.durationMs).sort((a, b) => a - b);
    const successes = list.filter((s) => s.success).length;
    const failures = list.length - successes;
    const sum = durations.reduce((a, b) => a + b, 0);
    out.push({
      name,
      calls: list.length,
      successes,
      failures,
      successRate: list.length ? successes / list.length : 0,
      p50Ms: percentile(durations, 50),
      p95Ms: percentile(durations, 95),
      p99Ms: percentile(durations, 99),
      avgMs: durations.length ? Math.round(sum / durations.length) : 0,
    });
  }
  return out.sort((a, b) => b.calls - a.calls);
}

export function resetToolMetrics(): void {
  samples.clear();
  notify();
}

export function subscribeToolMetrics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
