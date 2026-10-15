import type { FunctionCallDef } from '../types';
import { executeToolWithEnvelope } from '../utils/executeToolWithEnvelope';
import type { ToolInvokeLogEntry } from '../utils/toolInvokeLogger';
import { syncPresentationFromToolDef } from '../runtime/surfacesRegistry';
import type { PresentCallFn, PresentResultFn } from '../runtime/surfacesTypes';

/** 默认命名空间：未显式传 namespace 的注册与查询都落在这里（向后兼容） */
const DEFAULT_NAMESPACE = 'default';

const registry = new Map<string, FunctionCallDef>();
const listeners = new Set<() => void>();
/** presentation 同步 disposer：按 namespace::name 跟踪，注销时清理 */
const surfaceDisposers = new Map<string, () => void>();

function syncSurfacesForDef(def: FunctionCallDef, key: string): void {
  surfaceDisposers.get(key)?.();
  if (!def.presentation && !def.presentCall && !def.presentResult) {
    surfaceDisposers.delete(key);
    return;
  }
  const dispose = syncPresentationFromToolDef(
    def.name,
    def.presentation,
    def.presentCall as PresentCallFn | undefined,
    def.presentResult as PresentResultFn | undefined,
  );
  surfaceDisposers.set(key, dispose);
}

/**
 * 批量注册期间挂起通知：批量操作结束后只 notifyRegistryChange() 一次，
 * 避免一次冷启动注册多个 Tool 时触发多次订阅回调 → 多次重渲染。
 * isBatchFlushing 期间 notifyRegistryChange 只置 dirty，flush 时统一通知。
 */
let isBatchFlushing = false;
let batchDirty = false;

function notifyRegistryChange() {
  if (isBatchFlushing) {
    batchDirty = true;
    return;
  }
  listeners.forEach((listener) => listener());
}

/**
 * 批量注册/注销的事务边界：fn 执行期间挂起通知，结束后若发生变更只通知一次。
 * 即使 fn 抛错也会恢复标志并在发生变更时通知，保证不丢通知。
 */
function withBatchedNotify(fn: () => void): void {
  const wasFlushing = isBatchFlushing;
  isBatchFlushing = true;
  try {
    fn();
  } finally {
    isBatchFlushing = wasFlushing;
    // 只在最外层事务结束时统一通知，嵌套调用由最外层负责 flush
    if (!isBatchFlushing && batchDirty) {
      batchDirty = false;
      listeners.forEach((listener) => listener());
    }
  }
}

/** 内部 key：namespace + name 组合，保证不同命名空间同名 Tool 不冲突 */
function makeKey(namespace: string, name: string): string {
  return `${namespace}::${name}`;
}

/** 归一化命名空间入参：空值 → 默认命名空间 */
function resolveNamespace(namespace?: string): string {
  const trimmed = (namespace || '').trim();
  return trimmed || DEFAULT_NAMESPACE;
}

/** 本地 client Tool 注册/注销时订阅，用于刷新可用 Tool 列表 */
export function subscribeFunctionCalls(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface RegisterFunctionCallOptions {
  /**
   * 命名空间隔离：同一 name 在不同 namespace 下可并存。
   * 默认 'default'（向后兼容现有注册）。微前端/多面板场景可按 app/scope 隔离。
   */
  namespace?: string;
}

/**
 * 注册本地 client Tool。
 * - 不传 namespace：落 'default'，行为与历史版本一致。
 * - 传 namespace：落该命名空间，不与同名 Tool 冲突。
 */
export function registerFunctionCall(
  def: FunctionCallDef,
  options?: RegisterFunctionCallOptions,
): void {
  const ns = resolveNamespace(options?.namespace);
  const key = makeKey(ns, def.name);
  registry.set(key, def);
  syncSurfacesForDef(def, key);
  notifyRegistryChange();
}

/**
 * 批量注册本地 client Tool，注册过程只触发一次 notifyRegistryChange。
 * 用于冷启动一次性注册多个 Tool（如 harness 内置 Tool），把通知风暴收敛为单次。
 * @param defs 多个 Tool 定义
 * @param options 统一的命名空间（同 registerFunctionCall 语义）
 */
export function registerFunctionCalls(
  defs: FunctionCallDef[],
  options?: RegisterFunctionCallOptions,
): void {
  if (defs.length === 0) return;
  const ns = resolveNamespace(options?.namespace);
  withBatchedNotify(() => {
    for (const def of defs) {
      const key = makeKey(ns, def.name);
      registry.set(key, def);
      syncSurfacesForDef(def, key);
    }
  });
}

/**
 * 注销本地 client Tool。
 * @param name Tool functionName
 * @param namespace 与注册时一致；未传则注销 'default' 命名空间下的同名 Tool。
 */
export function unregisterFunctionCall(name: string, namespace?: string): void {
  const ns = resolveNamespace(namespace);
  const key = makeKey(ns, name);
  if (registry.delete(key)) {
    surfaceDisposers.get(key)?.();
    surfaceDisposers.delete(key);
    notifyRegistryChange();
  }
}

/**
 * 批量注销本地 client Tool，注销过程只触发一次 notifyRegistryChange（与
 * registerFunctionCalls 配对，把冷启动注销通知也收敛为单次）。
 * @param names 多个 Tool functionName
 * @param namespace 与注册时一致；未传则注销 'default' 命名空间下的同名 Tool
 */
export function unregisterFunctionCalls(names: string[], namespace?: string): void {
  if (names.length === 0) return;
  const ns = resolveNamespace(namespace);
  withBatchedNotify(() => {
    for (const name of names) {
      const key = makeKey(ns, name);
      registry.delete(key);
      surfaceDisposers.get(key)?.();
      surfaceDisposers.delete(key);
    }
  });
}

/**
 * 取本地 client Tool 定义。
 * 解析顺序：先查指定 namespace（或默认），未命中再回退 'default'。
 * 这样「页面级命名空间注册 + 全局兜底」可共存。
 */
export function getFunctionCallDef(
  name: string,
  namespace?: string,
): FunctionCallDef | undefined {
  const ns = resolveNamespace(namespace);
  const direct = registry.get(makeKey(ns, name));
  if (direct) return direct;
  if (ns !== DEFAULT_NAMESPACE) {
    return registry.get(makeKey(DEFAULT_NAMESPACE, name));
  }
  return undefined;
}

/**
 * 列出本地 client Tool（合并视图）。
 * - 不传 namespace：返回全部命名空间的合并（namespace 优先于 default 同名项）。
 * - 传 namespace：仅返回该命名空间 + default 的合并（namespace 覆盖 default 同名项）。
 */
export function getAllFunctionCalls(namespace?: string): FunctionCallDef[] {
  const ns = resolveNamespace(namespace);
  if (ns === DEFAULT_NAMESPACE) {
    return collectNamespace(DEFAULT_NAMESPACE);
  }
  // 命名空间优先于 default：先把 default 放入 map，再用 namespace 覆盖
  const merged = new Map<string, FunctionCallDef>();
  for (const def of collectNamespace(DEFAULT_NAMESPACE)) {
    merged.set(def.name, def);
  }
  for (const def of collectNamespace(ns)) {
    merged.set(def.name, def);
  }
  return Array.from(merged.values());
}

function collectNamespace(namespace: string): FunctionCallDef[] {
  const prefix = `${namespace}::`;
  const result: FunctionCallDef[] = [];
  for (const [key, def] of registry) {
    if (key.startsWith(prefix)) result.push(def);
  }
  return result;
}

/** 清空指定命名空间下的全部 client Tool；不传则清空所有命名空间 */
export function clearFunctionCalls(namespace?: string): void {
  if (namespace === undefined) {
    if (registry.size === 0) return;
    registry.clear();
    notifyRegistryChange();
    return;
  }
  const prefix = `${resolveNamespace(namespace)}::`;
  let changed = false;
  for (const key of Array.from(registry.keys())) {
    if (key.startsWith(prefix)) {
      registry.delete(key);
      changed = true;
    }
  }
  if (changed) notifyRegistryChange();
}

export function toOpenAITools(defs: FunctionCallDef[]) {
  return defs.map((def) => ({
    type: 'function' as const,
    function: {
      name: def.name,
      description: def.description,
      parameters: def.parameters,
    },
  }));
}

/**
 * 执行本地 client Tool。
 * 查找规则同 getFunctionCallDef：先指定 namespace，回退 default。
 */
export async function invokeFunctionCall(
  name: string,
  args: Record<string, unknown>,
  namespace?: string,
  logContext?: Pick<ToolInvokeLogEntry, 'conversationKey' | 'turnId' | 'round'>,
) {
  const def = getFunctionCallDef(name, namespace);
  if (!def) {
    throw new Error(`未注册的 Client Tool: ${name}`);
  }
  return executeToolWithEnvelope({
    side: 'client',
    name,
    args,
    requiresVerification: def.requiresVerification,
    logContext,
    fn: () => def.handler(args),
  });
}
