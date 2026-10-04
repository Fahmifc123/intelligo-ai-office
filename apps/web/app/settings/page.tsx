import { SettingsRow } from '@intelligo/shared';
import { KnowledgeManager } from '@/components/admin/KnowledgeManager';
import { MembersManager } from '@/components/admin/MembersManager';
import { SettingsForm } from '@/components/admin/SettingsForm';
import { PageShell } from '@/components/layout/PageShell';
import { loadSettingsAdmin } from '@/lib/admin/queries';
import { requireViewer } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4" aria-label={title}>
      <h2 className="mb-3 font-display text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function SettingsPage() {
  const viewer = await requireViewer();
  const supabase = await getServerSupabase();
  const [{ docs, members }, settingsResult] = await Promise.all([
    loadSettingsAdmin(supabase),
    supabase.from('settings').select('*').maybeSingle(),
  ]);
  const settings = SettingsRow.safeParse(settingsResult.data).data;
  return (
    <PageShell viewer={viewer} title="Pengaturan" active="/settings">
      <Section title="Aksi dan biaya">
        <SettingsForm
          role={viewer.role}
          initial={{
            dry_run: settings?.dry_run ?? true,
            auto_approve_kinds: settings?.auto_approve_kinds ?? [],
            usd_to_idr: settings?.usd_to_idr ?? 16000,
          }}
        />
      </Section>
      <Section title="Knowledge base">
        <KnowledgeManager docs={docs} role={viewer.role} />
      </Section>
      <Section title="Anggota">
        <MembersManager members={members} role={viewer.role} />
      </Section>
    </PageShell>
  );
}
