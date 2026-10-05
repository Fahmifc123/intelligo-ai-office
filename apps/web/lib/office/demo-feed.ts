'use client';

import { useEffect } from 'react';
import { planDemoTick } from './demo';
import type { RealtimeStatus } from './realtime';
import type { OfficeStore } from './store';

/** Preview ticks run faster than the worker's 20 s idle-tick so the demo office feels alive. */
export const DEMO_TICK_MS = 6_000;

/** Preview mode replacement for useOfficeRealtime: simulates ambient office life locally. */
export function useDemoFeed(store: OfficeStore): RealtimeStatus {
  useEffect(() => {
    const timer = setInterval(() => {
      for (const row of planDemoTick(store.getSnapshot(), Math.random, new Date())) {
        store.applyChange('agent_states', 'UPDATE', row, null);
      }
    }, DEMO_TICK_MS);
    return () => clearInterval(timer);
  }, [store]);
  return 'live';
}
