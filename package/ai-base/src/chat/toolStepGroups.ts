import type { ChatToolStep } from './chatToolSteps';

/** Tool 调用在 UI 上归属的阶段分组（同一组渲染为一条 ThoughtChain） */
export type ToolStepGroupKey =
  | 'materialization'
  | 'mock_data'
  | 'api_service'
  | 'modeling'
  | 'metadata'
  | 'metrics'
  | 'collection_pipeline'
  | 'general';

const MATERIALIZATION_TOOLS = new Set([
  'bizdata_get_materialization_status',
  'bizdata_preview_materialization',
  'bizdata_execute_materialization',
  'bizdata_list_materialization_runs',
  'bizdata_browse_materialized_schema',
  'bizdata_browse_materialized_rows',
]);

/** 将 functionName 映射为 ThoughtChain 分组键 */
export function resolveToolStepGroup(functionName: string): ToolStepGroupKey {
  if (MATERIALIZATION_TOOLS.has(functionName)) return 'materialization';
  if (functionName === 'bizdata_insert_mock_data') return 'mock_data';
  if (functionName.startsWith('apiservice_')) return 'api_service';
  if (functionName.startsWith('collection_pipeline_')) return 'collection_pipeline';
  if (functionName.startsWith('metric_') || functionName.startsWith('bizdata_metric')) {
    return 'metrics';
  }
  if (functionName.includes('metadata')) return 'metadata';
  if (functionName.startsWith('bizdata_')) return 'modeling';
  return 'general';
}

export interface ToolStepGroup {
  key: ToolStepGroupKey;
  steps: ChatToolStep[];
}

/** 按阶段顺序拆分 Tool 步骤；相邻且同阶段的步骤归入同一条 ThoughtChain */
export function splitToolStepsIntoGroups(steps: ChatToolStep[]): ToolStepGroup[] {
  if (!steps.length) return [];

  const groups: ToolStepGroup[] = [];
  for (const step of steps) {
    const key = resolveToolStepGroup(step.functionName);
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.steps.push(step);
    } else {
      groups.push({ key, steps: [step] });
    }
  }
  return groups;
}
