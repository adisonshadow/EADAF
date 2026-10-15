import type { ToolResponse } from '../types/toolResponse';

/**
 * 写/改类 Tool 名启发式（通用动词，不绑定业务域）。
 * 查询 / harness / `*_navigate` 排除。
 */
const WRITE_TOOL_NAME_RE =
  /(?:^|_)(?:create|update|upsert|delete|publish|disable|insert|execute|save|set)(?:[s_]|$)/i;

const HARNESS_SKIP = new Set([
  'task_complete',
  'update_plan',
  'ask_user',
  'navigate_to_page',
  'skill',
  'run_code',
  'run_subagent',
]);

/** 回灌 LLM 的写成功跳转提示（不展示给用户） */
export const WRITE_SUCCESS_NAVIGATE_HINT =
  '【必须立刻】写操作已成功。请马上调用 navigate_to_page 跳到对应资源页' +
  '（有 id 则用「可用页面」清单中带 :param 的编辑/详情模板，禁止只跳列表）。' +
  '跨步骤工作流（如实体已建→再创建 API）每完成一个里程碑就必须跳一次，' +
  '禁止因为「后面还有步骤 / 连续创建」而整段任务一次都不跳。' +
  '仅当已在目标页、或同类型批量创建尚未收尾时，可以暂不跳。';

export function isWriteLikeToolName(name: string): boolean {
  if (!name || HARNESS_SKIP.has(name) || name.endsWith('_navigate')) return false;
  return WRITE_TOOL_NAME_RE.test(name);
}

function isSuccessfulWrite(item: ToolResponse): boolean {
  if (!isWriteLikeToolName(item.meta.tool)) return false;
  if (item.kind !== 'success' || item.ok === false) return false;
  if (item.verified === false) return false;
  return true;
}

/**
 * 最近一次成功写操作之后还没有 navigate_to_page。
 * 用于 structured nudge：提醒模型补一次跳转，而不是恢复硬编码跳页。
 */
export function needsPostWriteNavigation(toolOutcomes: ToolResponse[] = []): boolean {
  let lastWriteIdx = -1;
  let lastNavIdx = -1;
  for (let i = 0; i < toolOutcomes.length; i += 1) {
    const item = toolOutcomes[i];
    if (item.meta.tool === 'navigate_to_page') lastNavIdx = i;
    if (isSuccessfulWrite(item)) lastWriteIdx = i;
  }
  return lastWriteIdx >= 0 && lastWriteIdx > lastNavIdx;
}

/**
 * 写成功信封在回灌 LLM 前附加 agentHint（浅拷贝，不改原信封）。
 * 开关关闭时原样返回。
 */
export function withWriteNavigateHint(
  envelope: ToolResponse,
  autoNavigate: boolean,
): ToolResponse {
  if (!autoNavigate) return envelope;
  if (!isSuccessfulWrite(envelope)) return envelope;
  if (envelope.agentHint === WRITE_SUCCESS_NAVIGATE_HINT) return envelope;
  return { ...envelope, agentHint: WRITE_SUCCESS_NAVIGATE_HINT };
}
