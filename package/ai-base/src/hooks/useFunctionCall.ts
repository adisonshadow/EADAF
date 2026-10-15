import { useEffect, useRef } from 'react';
import {
  registerFunctionCall,
  unregisterFunctionCall,
} from '../registry/functionRegistry';
import type { FunctionCallDef } from '../types';

export interface UseFunctionCallOptions {
  /** 命名空间隔离（默认 'default'）。页面级注册可传应用/路由 scope，避免跨页面冲突。 */
  namespace?: string;
  /** 默认 true：禁用时跳过注册（便于按条件挂载工具）。 */
  enabled?: boolean;
}

/**
 * 声明式注册本地 client Tool：挂载时注册，卸载时自动注销。
 *
 * 适用场景：页面/组件级专属工具（生命周期跟随组件），避免在应用启动时一次性注册
 * 所有工具导致卸载后仍残留、HMR/多面板下覆盖同名 Tool。
 *
 * 注意：依赖仅取 `def.name` 与 `namespace`，不把 `def.handler` 进依赖，
 * 避免每次渲染重建注册（handler 一般是稳定闭包或用 useCallback 包裹）。
 * 如需更新 handler/description/parameters，传入新的 def 引用并把它加入额外依赖即可。
 */
export function useFunctionCall(
  def: FunctionCallDef,
  options: UseFunctionCallOptions = {},
): void {
  const { namespace, enabled = true } = options;
  // 持有最新 def，避免 effect 内闭包捕获到过期 handler（依赖只认 name/namespace）。
  const defRef = useRef(def);
  defRef.current = def;

  useEffect(() => {
    if (!enabled) return;
    registerFunctionCall(defRef.current, { namespace });
    return () => unregisterFunctionCall(defRef.current.name, namespace);
  }, [def.name, namespace, enabled]);
}
