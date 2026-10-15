import type { AIBaseTool, OpenAIToolDefinition } from '../types';
import {
  ensureFunctionRegistryContractSource,
  resolveVisibleContracts,
  toolContractToOpenAITool,
} from './toolContractRegistry';

export function buildToolManifest(tools: AIBaseTool[] = []) {
  return tools.map((tool) => ({
    id: tool.id,
    functionName: tool.functionName,
    executionType: tool.executionType,
    openaiTool: tool.openaiTool || toOpenAIToolFromMeta(tool),
  }));
}

export function toOpenAIToolFromMeta(tool: AIBaseTool): OpenAIToolDefinition {
  return {
    type: 'function',
    function: {
      name: tool.functionName,
      description: tool.description || tool.name,
      parameters: tool.parametersSchema || { type: 'object', properties: {} },
    },
  };
}

export function mergeOpenAITools(
  skillTools: OpenAIToolDefinition[] = [],
  localTools: OpenAIToolDefinition[] = [],
) {
  const map = new Map<string, OpenAIToolDefinition>();
  skillTools.forEach((tool) => map.set(tool.function.name, tool));
  // 本地 client Tool 注册含完整 parameters，覆盖 DB 中可能过时的 schema
  localTools.forEach((tool) => {
    map.set(tool.function.name, tool);
  });
  return Array.from(map.values());
}

/**
 * 将 Skill 授予的 Tool meta 合并进现有列表（first-wins 去重）。
 * 用于同回合 skill 懒加载后立即扩展 LLM schema。
 */
export function mergeSkillToolsIntoPool(
  existing: AIBaseTool[],
  incoming: AIBaseTool[] | undefined,
): AIBaseTool[] {
  if (!incoming?.length) return existing;
  const map = new Map<string, AIBaseTool>();
  for (const tool of existing) {
    if (tool.functionName) map.set(tool.functionName, tool);
  }
  for (const tool of incoming) {
    if (tool.functionName && !map.has(tool.functionName)) {
      map.set(tool.functionName, tool);
    }
  }
  return Array.from(map.values());
}

/**
 * 业务 Tool meta → OpenAI tools（契约总线覆盖 parameters）。
 */
export function buildOpenAIToolsFromMetas(tools: AIBaseTool[]): OpenAIToolDefinition[] {
  ensureFunctionRegistryContractSource();
  const authorizedNames = tools.map((t) => t.functionName).filter(Boolean);
  const fromContracts = new Map(
    resolveVisibleContracts(authorizedNames).map((c) => [c.name, toolContractToOpenAITool(c)]),
  );
  return tools.map((tool) => {
    const overlay = fromContracts.get(tool.functionName);
    return (overlay || toOpenAIToolFromMeta(tool)) as OpenAIToolDefinition;
  });
}

/**
 * 重建「业务 Tool + harness」完整 OpenAI tools 列表（同回合扩展后用）。
 */
export function rebuildSessionOpenAITools(input: {
  skillTools: AIBaseTool[];
  harnessTools: OpenAIToolDefinition[];
  alwaysHarness: OpenAIToolDefinition[];
  navTools: OpenAIToolDefinition[];
  localTools: OpenAIToolDefinition[];
}): OpenAIToolDefinition[] {
  const skillOpenAI = buildOpenAIToolsFromMetas(input.skillTools);
  return mergeOpenAITools(
    [...skillOpenAI, ...input.harnessTools, ...input.alwaysHarness, ...input.navTools],
    input.localTools,
  );
}
