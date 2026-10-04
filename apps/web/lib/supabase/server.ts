import 'server-only';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { readPublicEnv } from '../env';

/** Server Supabase client bound to the request's auth cookies (RLS applies). */
export async function getServerSupabase(): Promise<SupabaseClient> {
  const env = readPublicEnv();
  const cookieStore = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component where cookies are read-only; middleware refreshes the session.
        }
      },
    },
  });
}
