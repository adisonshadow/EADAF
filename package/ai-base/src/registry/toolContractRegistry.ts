import { getAllFunctionCalls, subscribeFunctionCalls } from './functionRegistry';

/**
 * 应用无关的 Tool 参数契约（运行时权威）。
 * DB / Skill 只提供授权名；参数 schema 由此处供给 LLM / 校验 / run_code。
 */
export interface ToolContract {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** 契约源标识，如 function-registry / fmms-orders */
  sourceId: string;
}

export interface ToolContractSource {
  id: string;
  list(): ToolContract[];
}

const sources = new Map<string, ToolContractSource>();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** 订阅契约源变更（适配器内部 registry 变化时也会转发） */
export function subscribeToolContracts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function registerToolContractSource(source: ToolContractSource): void {
  const id = String(source?.id || '').trim();
  if (!id) {
    throw new Error('ToolContractSource.id 不能为空');
  }
  sources.set(id, source);
  notify();
}

export function unregisterToolContractSource(id: string): void {
  if (sources.delete(id)) notify();
}

export function clearToolContractSources(): void {
  if (sources.size === 0) return;
  sources.clear();
  notify();
}

export function listToolContractSources(): ToolContractSource[] {
  return Array.from(sources.values());
}

/**
 * 聚合全部已注册契约源。同名后注册覆盖先注册（并 warn）。
 */
export function listAllToolContracts(): ToolContract[] {
  const map = new Map<string, ToolContract>();
  for (const source of sources.values()) {
    let items: ToolContract[] = [];
    try {
      items = source.list() || [];
    } catch (err) {
      console.warn(`[ToolContractRegistry] source ${source.id} list() failed:`, err);
      continue;
    }
    for (const item of items) {
      if (!item?.name) continue;
      const prev = map.get(item.name);
      if (prev && prev.sourceId !== item.sourceId) {
        console.warn(
          `[ToolContractRegistry] tool "${item.name}" overridden: ${prev.sourceId} → ${item.sourceId}`,
        );
      }
      map.set(item.name, {
        name: item.name,
        description: item.description || item.name,
        parameters: (item.parameters && typeof item.parameters === 'object'
          ? item.parameters
          : { type: 'object', properties: {} }) as Record<string, unknown>,
        sourceId: item.sourceId || source.id,
      });
    }
  }
  return Array.from(map.values());
}

export function getToolContract(name: string): ToolContract | undefined {
  if (!name) return undefined;
  return listAllToolContracts().find((c) => c.name === name);
}

/**
 * 可见契约 = 授权名 ∩ 已注册契约。
 * 未在任何 source 注册的授权名不会进入结果（避免把空 DB schema 当成权威）。
 */
export function resolveVisibleContracts(authorizedNames: Iterable<string>): ToolContract[] {
  const allowed = new Set(
    Array.from(authorizedNames)
      .map((n) => String(n || '').trim())
      .filter(Boolean),
  );
  if (allowed.size === 0) return [];
  return listAllToolContracts().filter((c) => allowed.has(c.name));
}

export function toolContractToOpenAITool(contract: ToolContract) {
  return {
    type: 'function' as const,
    function: {
      name: contract.name,
      description: contract.description,
      parameters: contract.parameters || { type: 'object', properties: {} },
    },
  };
}

const FUNCTION_REGISTRY_SOURCE_ID = 'function-registry';
let functionRegistrySourceInstalled = false;
let unsubscribeFunctionRegistry: (() => void) | null = null;

/**
 * 把现有 registerFunctionCall 注册表适配为契约源（EADAF 默认；其它包可另挂 source）。
 * 幂等：多次调用只安装一次。
 */
export function ensureFunctionRegistryContractSource(): void {
  if (functionRegistrySourceInstalled) return;
  functionRegistrySourceInstalled = true;
  registerToolContractSource({
    id: FUNCTION_REGISTRY_SOURCE_ID,
    list: () =>
      getAllFunctionCalls().map((def) => ({
        name: def.name,
        description: def.description || def.name,
        parameters: (def.parameters && typeof def.parameters === 'object'
          ? def.parameters
          : { type: 'object', properties: {} }) as Record<string, unknown>,
        sourceId: FUNCTION_REGISTRY_SOURCE_ID,
      })),
  });
  unsubscribeFunctionRegistry = subscribeFunctionCalls(() => notify());
}

/** 测试用：卸载 function-registry 适配器 */
export function resetFunctionRegistryContractSourceForTests(): void {
  unsubscribeFunctionRegistry?.();
  unsubscribeFunctionRegistry = null;
  functionRegistrySourceInstalled = false;
  unregisterToolContractSource(FUNCTION_REGISTRY_SOURCE_ID);
}
