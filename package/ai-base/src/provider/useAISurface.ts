import { useEffect, useRef } from 'react';
import { subscribeAIMutation } from '../registry/aiMutationBus';
import { registerAISurface, unregisterAISurface } from '../registry/aiSurfaceRegistry';
import type { AIMutation, AISurfaceDefinition } from '../types/aiSurface';

/** 注册页面 AI Surface，mount 时注册、unmount 时注销 */
export function useAISurface(def: AISurfaceDefinition): void {
  const defRef = useRef(def);
  defRef.current = def;

  useEffect(() => {
    const surface: AISurfaceDefinition = {
      get id() {
        return defRef.current.id;
      },
      get domain() {
        return defRef.current.domain;
      },
      get label() {
        return defRef.current.label;
      },
      read: () => defRef.current.read(),
      refresh: () => defRef.current.refresh?.(),
      applyMutation: (mutation) => defRef.current.applyMutation?.(mutation),
      matchMutation: (mutation) => defRef.current.matchMutation?.(mutation) ?? true,
    };

    registerAISurface(surface);
    return () => unregisterAISurface(defRef.current.id, defRef.current.domain);
  }, [def.id, def.domain]);
}

/** 订阅指定 domain 的 mutation 事件（不注册 Surface） */
export function useAIMutationHandler(
  domain: string,
  handler: (mutation: AIMutation) => void | Promise<void>,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return subscribeAIMutation((mutation) => {
      if (mutation.domain !== domain) return;
      void handlerRef.current(mutation);
    });
  }, [domain]);
}
