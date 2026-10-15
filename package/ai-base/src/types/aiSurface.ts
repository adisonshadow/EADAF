/** Tool 写操作成功后携带的 UI 同步事件 */
export interface AIMutation {
  domain: string;
  type: string;
  resourceId?: string;
  payload?: unknown;
  /** 可选：提示应由哪个 Surface 优先处理 */
  scope?: string;
}

/** Tool 返回体：业务数据 + 可选 mutation */
export interface ToolMutationResult<T = unknown> {
  data: T;
  mutation?: AIMutation;
}

export interface AISurfaceDefinition {
  id: string;
  domain: string;
  label: string;
  read: () => unknown | Promise<unknown>;
  refresh?: () => void | Promise<void>;
  applyMutation?: (mutation: AIMutation) => void | Promise<void>;
  matchMutation?: (mutation: AIMutation) => boolean;
}

export interface AISurfaceSnapshot {
  id: string;
  domain: string;
  label: string;
  data: unknown;
}
