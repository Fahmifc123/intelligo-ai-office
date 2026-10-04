import { NextResponse, type NextRequest } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

/** Magic link landing: exchanges the PKCE code for a session cookie. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const target = request.nextUrl.clone();
  target.search = '';
  if (!code) {
    target.pathname = '/login';
    target.searchParams.set('error', 'link');
    return NextResponse.redirect(target);
  }
  const supabase = await getServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  target.pathname = error ? '/login' : '/';
  if (error) target.searchParams.set('error', 'link');
  return NextResponse.redirect(target);
}
