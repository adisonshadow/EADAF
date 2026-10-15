/**
 * TurnState：本回合 Agent 权威状态（plan / tool outcomes / 完成策略）。
 * 实现位于 agentPlanState（beginTurn / getCurrent）；此处提供语义别名便于 MS4 对齐文档。
 */
export type {
  AgentTurnContext as TurnState,
  AgentTurnContext,
} from '../registry/agentPlanState';
export {
  beginTurn,
  getCurrent as getTurnState,
  getPlan,
  getPlanForConversation,
  setPlan,
  recordToolOutcome,
  recordInvokedTool,
  expandAvailableTools,
} from '../registry/agentPlanState';
