'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerSupabase } from '@/lib/supabase/server';

export interface LoginState {
  status: 'idle' | 'sent' | 'error';
  message: string;
}

const Email = z.email('Format email tidak valid.').transform((v) => v.trim().toLowerCase());

/** Sends a magic link, but only to emails on the org allowlist (org_members). */
export async function requestMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = Email.safeParse(formData.get('email'));
  if (!parsed.success)
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Email tidak valid.' };
  const email = parsed.data;

  const { data: member } = await getAdminSupabase()
    .from('org_members')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (!member) {
    return {
      status: 'error',
      message: 'Email belum terdaftar. Minta Owner menambahkan email Anda.',
    };
  }

  const headerList = await headers();
  const origin = headerList.get('origin') ?? `http://${headerList.get('host') ?? 'localhost:3000'}`;
  const supabase = await getServerSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback`, shouldCreateUser: true },
  });
  if (error) {
    return { status: 'error', message: 'Gagal mengirim link masuk. Coba lagi beberapa saat lagi.' };
  }
  return {
    status: 'sent',
    message: `Link masuk sudah dikirim ke ${email}. Buka email lalu klik link tersebut.`,
  };
}
