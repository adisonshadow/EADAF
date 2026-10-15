import {
  getAllFunctionCalls,
  getFunctionCallDef,
} from '../registry/functionRegistry';
import {
  ensureFunctionRegistryContractSource,
  resolveVisibleContracts,
  type ToolContract,
} from '../registry/toolContractRegistry';
import { getCurrent } from '../registry/agentPlanState';

/**
 * run_code 永不编排：裸 HTTP 与 harness 套娃。
 * 本地常量避免与 builtinTools 循环依赖（builtinTools 已 import 本模块）。
 */
export const RUN_CODE_NEVER_ORCHESTRATE = new Set([
  'http_request',
  'task_complete',
  'update_plan',
  'ask_user',
  'navigate_to_page',
  'skill',
  'run_code',
  'run_subagent',
]);

export interface ResolveRunnableOptions {
  /**
   * true：授权名 ∩ 可分派（含 server_builtin），减去 http_request / harness。
   * false / 缺省：仅授权 ∩ 已注册 client handler（无 turn dispatcher 时的回退）。
   */
  includeAuthorizedServerTools?: boolean;
}

/**
 * native / run_code 同源可见集（run_subagent 仍走 assertRunnableClientTool 的 client-only）。
 *
 * - 有 turn dispatcher（includeAuthorizedServerTools）：授权业务 Tool（含 server_builtin）
 * - 无 dispatcher：授权 ∩ 已注册 client handler（不含 http_request 等仅 server 名）
 * - 授权集为空：回退为「全部已注册 client Tool」
 */
export function resolveRunnableClientToolNames(
  authorizedNames?: Iterable<string> | Set<string> | null,
  options?: ResolveRunnableOptions,
): { toolNames: string[]; contracts: ToolContract[] } {
  ensureFunctionRegistryContractSource();

  const authorized = authorizedNames
    ? Array.from(authorizedNames)
        .map((n) => String(n || '').trim())
        .filter(Boolean)
    : [];

  const hasAuthGate = authorized.length > 0;
  const includeServer =
    options?.includeAuthorizedServerTools ??
    Boolean(getCurrent()?.invokeAuthorizedTool);

  if (!hasAuthGate) {
    const all = getAllFunctionCalls().filter((d) => Boolean(d.name));
    const toolNames = all.map((d) => d.name).sort();
    const contracts = mergeContractsWithHandlers(toolNames);
    return { toolNames, contracts };
  }

  let runnableAuthorized: string[];
  if (includeServer) {
    runnableAuthorized = authorized.filter((name) => !RUN_CODE_NEVER_ORCHESTRATE.has(name));
  } else {
    // 授权 ∩ 已注册 handler（排除 http_request 等仅 server 的名）
    runnableAuthorized = authorized.filter((name) => Boolean(getFunctionCallDef(name)));
  }

  const toolNames = Array.from(new Set(runnableAuthorized)).sort();
  const contracts = mergeContractsWithHandlers(toolNames);
  return { toolNames, contracts };
}

function mergeContractsWithHandlers(toolNames: string[]): ToolContract[] {
  const fromRegistry = resolveVisibleContracts(toolNames);
  const byName = new Map(fromRegistry.map((c) => [c.name, c]));
  const resolveBrief = getCurrent()?.resolveToolBrief;

  for (const name of toolNames) {
    if (byName.has(name)) continue;
    const def = getFunctionCallDef(name);
    if (def) {
      byName.set(name, {
        name,
        description: def.description || name,
        parameters: (def.parameters && typeof def.parameters === 'object'
          ? def.parameters
          : { type: 'object', properties: {} }) as Record<string, unknown>,
        sourceId: 'function-registry',
      });
      continue;
    }
    const brief = resolveBrief?.(name);
    if (brief) {
      byName.set(name, {
        name,
        description: brief.description || name,
        parameters: brief.parameters || { type: 'object', properties: {} },
        sourceId: 'skill-pool',
      });
      continue;
    }
    byName.set(name, {
      name,
      description: name,
      parameters: { type: 'object', properties: {} },
      sourceId: 'authorized-server',
    });
  }
  return Array.from(byName.values());
}

/** 断言 tool 在当前授权 ∩ 已注册 client 集合内（run_subagent 仍 client-only） */
export function assertRunnableClientTool(
  name: string,
  authorizedNames?: Iterable<string> | Set<string> | null,
): void {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    throw new Error('tool 名不能为空');
  }
  const { toolNames } = resolveRunnableClientToolNames(authorizedNames, {
    includeAuthorizedServerTools: false,
  });
  if (!toolNames.includes(trimmed)) {
    throw new Error(
      `未授权或不在可编排 client Tool 内: ${trimmed}。请直接 native 调用业务 Tool，禁止用 subagent 绕过 Skill 授权。`,
    );
  }
  if (!getFunctionCallDef(trimmed)) {
    throw new Error(`未注册的 client Tool: ${trimmed}`);
  }
}
