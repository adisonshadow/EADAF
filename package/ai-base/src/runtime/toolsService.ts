import { Context, Service } from '@cordisjs/core';
import type { FunctionCallDef } from '../types';
import {
  registerFunctionCall,
  registerFunctionCalls,
  unregisterFunctionCall,
  unregisterFunctionCalls,
} from '../registry/functionRegistry';
import type { AgentToolsApi } from './types';
import './types';

/**
 * Cordis Tools 服务：把现有 functionRegistry 包成 ctx.tools，
 * 注册即 effect，Fiber dispose 时自动注销。
 * FunctionCallDef.presentation / present* 由 functionRegistry 同步到 surfaces。
 */
export class ToolsService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'tools', true);
  }

  register(def: FunctionCallDef): () => void {
    registerFunctionCall(def);
    const dispose = () => unregisterFunctionCall(def.name);
    this.ctx.effect(() => dispose);
    return dispose;
  }

  registerMany(defs: FunctionCallDef[]): () => void {
    if (!defs.length) return () => undefined;
    registerFunctionCalls(defs);
    const names = defs.map((d) => d.name);
    const dispose = () => unregisterFunctionCalls(names);
    this.ctx.effect(() => dispose);
    return dispose;
  }
}

/** 确保 Context 上的 tools 类型可用（运行时由 Service provide） */
export function asToolsApi(ctx: Context): AgentToolsApi {
  return ctx.tools;
}
