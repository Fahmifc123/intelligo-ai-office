import 'server-only';
import { MemberRole } from '@intelligo/shared';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { z } from 'zod';
import { readServerEnv } from './server-env';
import { getAdminSupabase } from './supabase/admin';
import { getServerSupabase } from './supabase/server';

export interface Viewer {
  userId: string;
  email: string;
  orgId: string;
  role: MemberRole;
}

const MemberRow = z.object({ org_id: z.guid(), role: MemberRole, email: z.string() });

/** Signed-in user with their membership, or null. Role comes from org_members, not the JWT. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const { data: member } = await getAdminSupabase()
    .from('org_members')
    .select('org_id, role, email')
    .eq('user_id', data.user.id)
    .maybeSingle();
  const parsed = MemberRow.safeParse(member);
  if (!parsed.success || parsed.data.org_id !== readServerEnv().ORG_ID) return null;
  return {
    userId: data.user.id,
    email: parsed.data.email,
    orgId: parsed.data.org_id,
    role: parsed.data.role,
  };
});

/** For pages: redirects to /login when there is no member session. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect('/login');
  return viewer;
}

export class AuthError extends Error {}

/** For server actions: throws unless the user has one of the roles. */
export async function authorize(roles: readonly MemberRole[]): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw new AuthError('Sesi berakhir. Silakan masuk lagi.');
  if (!roles.includes(viewer.role))
    throw new AuthError('Peran Anda tidak punya akses untuk aksi ini.');
  return viewer;
}

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Owner',
  staff: 'Staff',
  viewer: 'Viewer',
};
