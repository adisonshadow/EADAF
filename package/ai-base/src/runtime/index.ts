export type { AgentPlugin, AgentToolsApi, AgentSurfacesApi } from './types';
export { createAgentContext } from './createAgentContext';
export type { CreateAgentContextOptions, AgentContextHandle } from './createAgentContext';
export { ToolsService } from './toolsService';
export { SurfacesService } from './surfacesService';
export {
  surfacesRegistry,
  registerInvocationPresentation,
  getInvocationPresentation,
  presentToolCall,
  presentToolResult,
  clearSurfacesOverrides,
  heuristicPresentation,
} from './surfacesRegistry';
export type {
  InvocationIcon,
  InvocationContentMode,
  InvocationCategory,
  InvocationPresentation,
  InvocationPresentationInput,
  PresentCallView,
  PresentResultView,
  PresentCallFn,
  PresentResultFn,
  SurfaceKindComponent,
} from './surfacesTypes';
export { runJavaScriptCode } from './runJavaScript';
export type { RunCodeToolsBridge } from './runJavaScript';
export { runSubagentFanout, runSubagentSequence } from './runSubagent';
export type {
  RunSubagentFanoutOptions,
  RunSubagentSequenceOptions,
  SubagentFanoutItemResult,
} from './runSubagent';
export type { TurnState, AgentTurnContext } from './turnState';
export {
  beginTurn,
  getTurnState,
  getPlan,
  setPlan,
  recordToolOutcome,
  recordInvokedTool,
  expandAvailableTools,
} from './turnState';
export {
  resolveRunnableClientToolNames,
  assertRunnableClientTool,
} from './resolveRunnableClientTools';
