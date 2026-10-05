/**
 * Preview mode: the site runs without Supabase (for example a first Vercel deploy before the
 * database exists) and shows the office with demo data instead of failing. It switches off
 * automatically once both public Supabase variables are set.
 *
 * NEXT_PUBLIC_* values are referenced literally so Next.js inlines them in client and edge code.
 */
export function isPreviewMode(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
  return url.length === 0 || anonKey.length === 0;
}

/** Paths that work in preview mode; everything else redirects to the office. */
export function isPreviewPath(pathname: string): boolean {
  return pathname === '/' || pathname === '/api/health';
}
