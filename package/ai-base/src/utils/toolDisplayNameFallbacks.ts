/**
 * 内核 Tool 语义化短标题（仅 harness / aibase 管理面）。
 * 业务 Tool（bizdata_* / apiservice_* 等）由宿主通过
 * `registerToolDisplayNames` 或 `AIChatConfig.toolDisplayNames` 注入。
 */
export const CORE_TOOL_DISPLAY_NAMES: Record<string, string> = {
  update_plan: '生成任务清单',
  task_complete: '完成任务',
  ask_user: '询问用户',
  navigate_to_page: '跳转页面',
  skill: '加载 Skill',
  run_code: '执行脚本',
  run_subagent: '子任务编排',
  aibase_read_surfaces: '读取页面 Surface',
  http_request: 'HTTP 请求',
  aibase_list_scopes: '列出 Scope',
  aibase_get_scope: '获取 Scope 详情',
  aibase_create_scope: '创建 Scope',
  aibase_update_scope: '更新 Scope',
  aibase_list_tools: '列出 Tool',
  aibase_get_tool: '获取 Tool 详情',
  aibase_create_tool: '创建 Tool',
  aibase_update_tool: '更新 Tool',
  aibase_list_skills: '列出 Skill',
  aibase_get_skill: '获取 Skill 详情',
  aibase_create_skill: '创建 Skill',
  aibase_update_skill: '更新 Skill',
  aibase_list_providers: '列出 AI 服务商',
  aibase_get_provider: '获取 AI 服务商',
  aibase_create_provider: '创建 AI 服务商',
  aibase_update_provider: '更新 AI 服务商',
  aibase_delete_provider: '停用 AI 服务商',
  aibase_list_models: '列出 AI 模型',
  aibase_get_model: '获取 AI 模型',
  aibase_create_model: '创建 AI 模型',
  aibase_update_model: '更新 AI 模型',
  aibase_delete_model: '停用 AI 模型',
};

/** @deprecated 使用 CORE_TOOL_DISPLAY_NAMES；保留别名以免旧引用断裂 */
export const TOOL_DISPLAY_NAME_FALLBACKS = CORE_TOOL_DISPLAY_NAMES;

/** 宿主 / 业务包注入的展示名（后注册覆盖同名） */
const hostDisplayNames = new Map<string, string>();

/**
 * 注册业务 Tool 展示名。返回 disposer（Fiber / Provider unmount 时调用）。
 * 同名以最后一次注册为准；dispose 只撤销本批写入的条目。
 */
export function registerToolDisplayNames(
  names: Record<string, string>,
): () => void {
  const applied: Array<{ key: string; prev?: string }> = [];
  for (const [rawKey, rawLabel] of Object.entries(names || {})) {
    const key = String(rawKey || '').trim();
    const label = String(rawLabel || '').trim();
    if (!key || !label) continue;
    applied.push({ key, prev: hostDisplayNames.get(key) });
    hostDisplayNames.set(key, label);
  }
  return () => {
    for (const { key, prev } of applied) {
      if (prev === undefined) hostDisplayNames.delete(key);
      else hostDisplayNames.set(key, prev);
    }
  };
}

/** 清空宿主注入（测试用） */
export function clearHostToolDisplayNames(): void {
  hostDisplayNames.clear();
}

/** 查展示名：宿主注入优先，再内核表；无命中返回 undefined */
export function lookupToolDisplayName(functionName: string): string | undefined {
  const key = String(functionName || '').trim();
  if (!key) return undefined;
  return hostDisplayNames.get(key) || CORE_TOOL_DISPLAY_NAMES[key];
}
