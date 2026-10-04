import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

const OTP_TYPES = new Set<EmailOtpType>(['email', 'magiclink', 'signup', 'invite']);

/** Magic link from the email template: verifies token_hash and sets the session cookie. */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type') as EmailOtpType | null;
  const target = request.nextUrl.clone();
  target.search = '';
  if (tokenHash && type && OTP_TYPES.has(type)) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      target.pathname = '/';
      return NextResponse.redirect(target);
    }
  }
  target.pathname = '/login';
  target.searchParams.set('error', 'link');
  return NextResponse.redirect(target);
}
