import type { ChatToolStep } from './chatToolSteps';
import type { ToolResponse } from '../types/toolResponse';

/**
 * 将 ToolResponse 信封映射为 ThoughtChain 步骤状态。
 * business_error：蓝色「执行失败」；system_error：红色 error。
 */
export function resolveToolStepFromEnvelope(
  envelope: ToolResponse,
): Pick<ChatToolStep, 'status' | 'error'> {
  if (envelope.kind === 'system_error') {
    return {
      status: 'error',
      error: envelope.error?.message || '执行失败',
    };
  }
  // ask_user：请求已送达 UI，ThoughtChain 记成功（卡片由 user_choice segment 渲染）
  if (envelope.kind === 'user_choice_request') {
    return { status: 'success' };
  }
  if (envelope.kind === 'business_error' || envelope.verified === false) {
    return {
      status: 'business_error',
      error: envelope.error?.message || '业务校验未通过',
    };
  }
  return { status: 'success' };
}
