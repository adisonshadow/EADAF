import type { ComponentType } from 'react';
import type { ToolDisplay, ToolDisplayKind, ToolResponse } from '../types/toolResponse';

/** 调用卡片图标语义（UI 映射具体 ant icon） */
export type InvocationIcon =
  | 'skill'
  | 'http'
  | 'code'
  | 'plan'
  | 'table'
  | 'write'
  | 'nav'
  | 'generic';

/** 内容区布局模式（与 display.kind 正交） */
export type InvocationContentMode = 'in_out' | 'name_output' | 'request_response';

export type InvocationCategory = 'technical' | 'business';

/**
 * 每个 tool/action 的壳配置（插件注册清单）。
 * UI 只读本配置，禁止按 tool 名特判折叠/高度。
 */
export interface InvocationPresentation {
  category: InvocationCategory;
  icon: InvocationIcon;
  /** 静态动词标题，如「加载 Skill」 */
  title: string;
  contentMode: InvocationContentMode;
  /** 执行中是否收起内容区 */
  collapseDuring: boolean;
  /** 结束后是否收起内容区 */
  collapseAfter: boolean;
  /** 折叠时保留行数；0 = 全收 */
  collapsedPreviewLines: number;
  /** 内容区最大高度（px），内部 scroll */
  maxHeight: number;
}

export type InvocationPresentationInput = Partial<InvocationPresentation> &
  Pick<InvocationPresentation, 'title'>;

export interface PresentCallView {
  title: string;
  subtitle?: string;
  presentation: InvocationPresentation;
  args?: Record<string, unknown>;
}

export interface PresentResultView {
  title: string;
  subtitle?: string;
  presentation: InvocationPresentation;
  display?: ToolDisplay;
  args?: Record<string, unknown>;
}

export type PresentCallFn = (args: Record<string, unknown>) => Partial<PresentCallView> | void;
export type PresentResultFn = (
  args: Record<string, unknown>,
  envelope: Pick<ToolResponse, 'ok' | 'kind' | 'data' | 'error' | 'verified' | 'display' | 'meta'>,
) => Partial<PresentResultView> | ToolDisplay | void;

export type SurfaceKindComponent = ComponentType<{ display: ToolDisplay }>;

export interface AgentSurfacesApi {
  registerPresentation(name: string, profile: InvocationPresentationInput): () => void;
  getPresentation(name: string): InvocationPresentation;
  listPresentations(): Array<{ name: string; presentation: InvocationPresentation }>;
  registerPresentCall(name: string, fn: PresentCallFn): () => void;
  registerPresentResult(name: string, fn: PresentResultFn): () => void;
  registerKind(kind: ToolDisplayKind | string, component: SurfaceKindComponent): () => void;
  getKindComponent(kind: string): SurfaceKindComponent | undefined;
  presentCall(name: string, args?: Record<string, unknown>): PresentCallView;
  presentResult(
    name: string,
    args: Record<string, unknown> | undefined,
    envelope: Pick<ToolResponse, 'ok' | 'kind' | 'data' | 'error' | 'verified' | 'display' | 'meta'>,
  ): PresentResultView;
}
