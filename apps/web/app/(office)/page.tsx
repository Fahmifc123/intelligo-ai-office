import { OfficeApp } from '@/components/office/OfficeApp';
import { requireViewer } from '@/lib/auth';
import { loadOfficeSnapshot } from '@/lib/office/snapshot';
import { getServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function OfficePage() {
  const viewer = await requireViewer();
  const snapshot = await loadOfficeSnapshot(await getServerSupabase());
  return <OfficeApp initial={snapshot} viewer={{ email: viewer.email, role: viewer.role }} />;
}
