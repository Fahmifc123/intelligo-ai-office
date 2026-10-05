import { OfficeApp, PreviewOfficeApp } from '@/components/office/OfficeApp';
import { requireViewer } from '@/lib/auth';
import { buildDemoSnapshot } from '@/lib/office/demo';
import { loadOfficeSnapshot } from '@/lib/office/snapshot';
import { isPreviewMode } from '@/lib/preview';
import { getServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function OfficePage() {
  if (isPreviewMode()) return <PreviewOfficeApp initial={buildDemoSnapshot(new Date())} />;
  const viewer = await requireViewer();
  const snapshot = await loadOfficeSnapshot(await getServerSupabase());
  return <OfficeApp initial={snapshot} viewer={{ email: viewer.email, role: viewer.role }} />;
}
