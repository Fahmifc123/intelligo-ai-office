import { PublicEnv } from '@intelligo/shared';

/**
 * Public (browser-safe) env. NEXT_PUBLIC_* values must be referenced literally
 * so Next.js can inline them into the client bundle.
 */
export function readPublicEnv(
  source: Record<string, string | undefined> = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
): PublicEnv {
  const parsed = PublicEnv.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY wajib diisi di .env (lihat .env.example)',
    );
  }
  return parsed.data;
}
