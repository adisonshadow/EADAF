import { useEffect, useState } from 'react';
import type { PlanItem } from '../types';
import { getPlanForConversation, subscribePlan } from '../registry/agentPlanState';

/**
 * 读取某个会话的实时任务清单。
 *
 * - 初始值来自会话级 store（跨 turn / 刷新后仍在，换会话即换清单）
 * - `update_plan`、自动对账、回合初始化都会触发 `subscribePlan` 更新
 * - 新会话（新的 conversationKey）没有 plan ⇒ 返回空数组，调用方可据此隐藏入口
 */
export function useLivePlan(conversationKey: string): PlanItem[] {
  const [plan, setPlan] = useState<PlanItem[]>(() => getPlanForConversation(conversationKey));

  useEffect(() => {
    setPlan(getPlanForConversation(conversationKey));
    return subscribePlan((key, next) => {
      if (key === conversationKey) setPlan(next);
    });
  }, [conversationKey]);

  return plan;
}
