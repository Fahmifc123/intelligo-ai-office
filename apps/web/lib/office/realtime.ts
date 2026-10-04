'use client';

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { getBrowserSupabase } from '../supabase/client';
import { loadOfficeSnapshot } from './snapshot';
import type { OfficeStore } from './store';

export const REALTIME_TABLES = [
  'agent_states',
  'settings',
  'tasks',
  'task_events',
  'actions',
  'reviews',
  'llm_usage',
] as const;

export type RealtimeStatus = 'connecting' | 'live' | 'offline';

/**
 * Subscribes to Supabase Realtime for the office tables. RLS limits rows to the viewer's org.
 * Every (re)subscribe reloads the snapshot so nothing missed while offline is lost.
 */
export function useOfficeRealtime(store: OfficeStore): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>('connecting');

  useEffect(() => {
    const supabase: SupabaseClient = getBrowserSupabase();
    let disposed = false;
    let channel: RealtimeChannel | undefined;

    const connect = async (): Promise<void> => {
      // Realtime applies RLS with the user's JWT; without it every change is filtered out.
      const { data } = await supabase.auth.getSession();
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      if (disposed) return;
      channel = supabase.channel(`office-${Math.random().toString(36).slice(2)}`);
      for (const table of REALTIME_TABLES) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
          store.applyChange(table, payload.eventType, payload.new, payload.old);
        });
      }
      channel.subscribe((state) => {
        if (disposed) return;
        if (state === 'SUBSCRIBED') {
          setStatus('live');
          // Reload once subscribed: covers the gap since the server render or a reconnect.
          void loadOfficeSnapshot(supabase).then((snapshot) => {
            if (!disposed && snapshot.agents.length > 0) store.replace(snapshot);
          });
        } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
          setStatus('offline');
        }
      });
    };

    const { data: auth } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && session)
        void supabase.realtime.setAuth(session.access_token);
    });
    void connect();
    return () => {
      disposed = true;
      auth.subscription.unsubscribe();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [store]);

  return status;
}
