import { useEffect, useRef } from 'react';

export function useDebouncedEffect(
  effect: () => void | (() => void),
  deps: unknown[],
  delayMs: number,
): void {
  const cleanupRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const cleanup = effect();
      cleanupRef.current = typeof cleanup === 'function' ? cleanup : undefined;
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
      if (typeof cleanupRef.current === 'function') {
        cleanupRef.current();
        cleanupRef.current = undefined;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
