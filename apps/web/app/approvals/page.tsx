import { ApprovalsApp } from '@/components/approvals/ApprovalsApp';
import { PageShell } from '@/components/layout/PageShell';
import { requireViewer } from '@/lib/auth';
import { loadOfficeSnapshot } from '@/lib/office/snapshot';
import { getServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const viewer = await requireViewer();
  const snapshot = await loadOfficeSnapshot(await getServerSupabase());
  return (
    <PageShell viewer={viewer} title="Approval aksi" active="/approvals">
      <ApprovalsApp initial={snapshot} role={viewer.role} />
    </PageShell>
  );
}
