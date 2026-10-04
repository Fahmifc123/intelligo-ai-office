import { agentsConfig, SettingsRow } from '@intelligo/shared';
import { AgentsAdmin } from '@/components/admin/AgentsAdmin';
import { DailyCost } from '@/components/admin/DailyCost';
import { PageShell } from '@/components/layout/PageShell';
import { loadAgentsAdmin } from '@/lib/admin/queries';
import { requireViewer } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AgentsPage() {
  const viewer = await requireViewer();
  const supabase = await getServerSupabase();
  const [{ agents, usage, days }, settings] = await Promise.all([
    loadAgentsAdmin(supabase),
    supabase.from('settings').select('*').maybeSingle(),
  ]);
  const rate = SettingsRow.safeParse(settings.data).data?.usd_to_idr ?? 16000;
  const order = new Map(agentsConfig.map((a, i) => [a.id, i]));
  agents.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
  const usageByAgent = Object.fromEntries(
    usage.filter((u) => u.agent_id).map((u) => [u.agent_id as string, u]),
  );
  return (
    <PageShell viewer={viewer} title="Agen" active="/agents">
      <AgentsAdmin agents={agents} usage={usageByAgent} role={viewer.role} rate={rate} />
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-2 font-display text-lg font-semibold">Biaya per hari</h2>
        <DailyCost days={days} rate={rate} />
      </section>
    </PageShell>
  );
}
