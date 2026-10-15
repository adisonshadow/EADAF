import type { Plugin } from '@cordisjs/core';
import type { FunctionCallDef } from '../types';
import type { AgentSurfacesApi } from './surfacesTypes';

/**
 * Agent 能力平面插件：与 Cordis Plugin 对齐。
 * 宿主 / 业务包用 apply(ctx) 注册 tools；dispose 时自动撤销。
 */
export type AgentPlugin = Plugin;

export interface AgentToolsApi {
  /** 注册 client Tool；返回 disposer（Fiber 卸载时也会自动调用） */
  register(def: FunctionCallDef): () => void;
  /** 批量注册 */
  registerMany(defs: FunctionCallDef[]): () => void;
}

export type { AgentSurfacesApi };

declare module '@cordisjs/core' {
  interface Context {
    tools: AgentToolsApi;
    surfaces: AgentSurfacesApi;
  }
}
