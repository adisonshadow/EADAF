import { Context, Service } from '@cordisjs/core';
import { surfacesRegistry } from './surfacesRegistry';
import type { AgentSurfacesApi } from './surfacesTypes';
import './types';

/**
 * Cordis Surfaces 服务：presentCall / presentResult → UI chrome + display。
 * 底层复用模块级 registry，便于无 Cordis 场景与测试使用。
 */
export class SurfacesService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'surfaces', true);
  }

  get api(): AgentSurfacesApi {
    return surfacesRegistry;
  }

  registerPresentation: AgentSurfacesApi['registerPresentation'] = (...args) => {
    const dispose = surfacesRegistry.registerPresentation(...args);
    this.ctx.effect(() => dispose);
    return dispose;
  };

  getPresentation: AgentSurfacesApi['getPresentation'] = (name) =>
    surfacesRegistry.getPresentation(name);

  listPresentations: AgentSurfacesApi['listPresentations'] = () =>
    surfacesRegistry.listPresentations();

  registerPresentCall: AgentSurfacesApi['registerPresentCall'] = (...args) => {
    const dispose = surfacesRegistry.registerPresentCall(...args);
    this.ctx.effect(() => dispose);
    return dispose;
  };

  registerPresentResult: AgentSurfacesApi['registerPresentResult'] = (...args) => {
    const dispose = surfacesRegistry.registerPresentResult(...args);
    this.ctx.effect(() => dispose);
    return dispose;
  };

  registerKind: AgentSurfacesApi['registerKind'] = (...args) => {
    const dispose = surfacesRegistry.registerKind(...args);
    this.ctx.effect(() => dispose);
    return dispose;
  };

  getKindComponent: AgentSurfacesApi['getKindComponent'] = (kind) =>
    surfacesRegistry.getKindComponent(kind);

  presentCall: AgentSurfacesApi['presentCall'] = (name, args) =>
    surfacesRegistry.presentCall(name, args);

  presentResult: AgentSurfacesApi['presentResult'] = (name, args, envelope) =>
    surfacesRegistry.presentResult(name, args, envelope);
}

export function asSurfacesApi(ctx: Context): AgentSurfacesApi {
  return ctx.surfaces;
}
