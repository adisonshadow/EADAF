import { getAllFunctionCalls } from '../registry/functionRegistry';
import type { ToolContract } from '../registry/toolContractRegistry';

const DEFAULT_TIMEOUT_MS = 12000;
const MAX_SOURCE_CHARS = 20000;
const MAX_RESULT_CHARS = 50000;

export interface RunCodeToolsBridge {
  (name: string, args: Record<string, unknown>): Promise<unknown>;
}

export interface RunCodeToolContractBrief {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * 避免脚本内 `const tools = …` 与注入参数同名冲突（实测2）。
 * 将顶层/常见声明改名为 __user_tools。
 */
function sanitizeRunCodeSource(source: string): string {
  return source
    .replace(/\b(?:const|let|var)\s+tools\b/g, (m) => m.replace(/\btools\b/, '__user_tools'))
    .replace(/\bfunction\s+tools\s*\(/g, 'function __user_tools(');
}

function formatAvailableToolsHint(toolNames: string[]): string {
  const sample = toolNames.slice(0, 12).join(', ');
  const more = toolNames.length > 12 ? ` …共 ${toolNames.length} 个` : '';
  return sample ? `可用：${sample}${more}` : '当前无本回合可编排业务 Tool';
}

function toBrief(contract: ToolContract | RunCodeToolContractBrief): RunCodeToolContractBrief {
  return {
    name: contract.name,
    description: contract.description || contract.name,
    parameters: contract.parameters || { type: 'object', properties: {} },
  };
}

/**
 * 在浏览器中执行 JS 编排脚本（AsyncFunction）。
 * 脚本内可用 `await tools.xxx(args)`、`tools.list()`、`tools.schema(name?)`、`Object.keys(tools)`。
 * `tools` 不是数组：禁止 `tools.filter`；请先 `tools.list()` / `tools.schema` 再按名调用。
 * 请勿重新声明 `tools` 变量。
 */
export async function runJavaScriptCode(
  source: string,
  invokeTool: RunCodeToolsBridge,
  options?: {
    timeoutMs?: number;
    toolNames?: string[];
    /** 与 list/schema 同源的可见契约（授权 ∩ 注册） */
    contracts?: RunCodeToolContractBrief[];
  },
): Promise<{ value: unknown }> {
  const code = sanitizeRunCodeSource(String(source || '').trim());
  if (!code) {
    throw new Error('source 不能为空');
  }
  if (code.length > MAX_SOURCE_CHARS) {
    throw new Error(`source 过长（>${MAX_SOURCE_CHARS} 字符）`);
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const contractBriefs = (options?.contracts || []).map(toBrief);
  const contractByName = new Map(contractBriefs.map((c) => [c.name, c]));
  const toolNames =
    options?.toolNames ||
    (contractBriefs.length
      ? contractBriefs.map((c) => c.name).sort()
      : getAllFunctionCalls()
          .map((d) => d.name)
          .filter(Boolean)
          .sort());

  const allowed = new Set<string>(['list', 'schema', ...toolNames]);

  const schemaFn = (name?: string) => {
    if (name == null || name === '') {
      return contractBriefs.length
        ? contractBriefs
        : toolNames.map((n) => ({
            name: n,
            description: n,
            parameters: { type: 'object', properties: {} },
          }));
    }
    const hit = contractByName.get(name);
    if (hit) return hit;
    if (toolNames.includes(name)) {
      return { name, description: name, parameters: { type: 'object', properties: {} } };
    }
    throw new Error(
      `未知 Tool: ${name}。请先 tools.list() 或 tools.schema()。${formatAvailableToolsHint(toolNames)}`,
    );
  };

  const toolsBag: Record<string, unknown> = {
    list: () => toolNames.slice(),
    schema: schemaFn,
  };
  for (const name of toolNames) {
    toolsBag[name] = (args: Record<string, unknown> = {}) => invokeTool(name, args || {});
  }

  const tools = new Proxy(toolsBag, {
    get(target, prop) {
      if (typeof prop !== 'string' || prop === 'then') return undefined;
      if (prop in target) return target[prop];
      // 白名单：未注册名（含 filter/map/find）不得伪装成可调用 Tool（实测3）
      const hint = formatAvailableToolsHint(toolNames);
      return () => {
        throw new Error(
          `未授权或不在本回合可编排名: ${prop}（run_code 仅能编排已授权业务 Tool；tools 不是数组，勿用 .filter/.map）。${hint}`,
        );
      };
    },
    has(_target, prop) {
      return typeof prop === 'string' && allowed.has(prop);
    },
    ownKeys(target) {
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === 'string' && prop in target) {
        return {
          configurable: true,
          enumerable: true,
          writable: false,
          value: target[prop],
        };
      }
      return undefined;
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor as new (
    ...args: string[]
  ) => (...fnArgs: unknown[]) => Promise<unknown>;

  const fn = new AsyncFunction('tools', `"use strict";\n${code}\n`);

  const value = await Promise.race([
    fn(tools),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`run_code 超时（${timeoutMs}ms）`)), timeoutMs);
    }),
  ]);

  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    serialized = String(value);
  }
  if (serialized && serialized.length > MAX_RESULT_CHARS) {
    return {
      value: {
        truncated: true,
        preview: serialized.slice(0, MAX_RESULT_CHARS),
        message: `结果超 ${MAX_RESULT_CHARS} 字符已截断`,
      },
    };
  }

  return { value };
}
