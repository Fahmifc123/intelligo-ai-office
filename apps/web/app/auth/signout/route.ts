import { NextResponse, type NextRequest } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await getServerSupabase();
  await supabase.auth.signOut();
  const target = request.nextUrl.clone();
  target.pathname = '/login';
  target.search = '';
  return NextResponse.redirect(target, { status: 303 });
}
