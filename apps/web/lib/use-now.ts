'use client';

import { useSyncExternalStore } from 'react';

/**
 * Current time quantized to `intervalMs`, re-rendering on each tick. Returns null during
 * server rendering so clocks never cause hydration mismatches.
 */
export function useNow(intervalMs = 1000): number | null {
  return useSyncExternalStore(
    (notify) => {
      const timer = setInterval(notify, intervalMs);
      return () => clearInterval(timer);
    },
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    () => null,
  );
}
