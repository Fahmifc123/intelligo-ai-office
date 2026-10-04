'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readPublicEnv } from '../env';

let browserClient: SupabaseClient | undefined;

/** Browser Supabase client (anon key + user session). Used for reads and Realtime only. */
export function getBrowserSupabase(): SupabaseClient {
  if (!browserClient) {
    const env = readPublicEnv();
    browserClient = createBrowserClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  }
  return browserClient;
}
