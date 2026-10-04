import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readServerEnv } from '../server-env';

let adminClient: SupabaseClient | undefined;

/**
 * Service-role client for server actions and route handlers. Bypasses RLS, so every caller
 * must authorize the user first (see lib/auth.ts) and scope queries to ORG_ID.
 */
export function getAdminSupabase(): SupabaseClient {
  if (!adminClient) {
    const env = readServerEnv();
    adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}
