'use client';

import type { MemberRole } from '@intelligo/shared';
import { useMemo } from 'react';
import { useOfficeRealtime } from '@/lib/office/realtime';
import { OfficeStore, useOfficeSnapshot } from '@/lib/office/store';
import type { OfficeSnapshot } from '@/lib/office/types';
import { ApprovalCard } from './ApprovalCard';

export function ApprovalsApp({ initial, role }: { initial: OfficeSnapshot; role: MemberRole }) {
  const store = useMemo(() => new OfficeStore(initial), [initial]);
  useOfficeRealtime(store);
  const snapshot = useOfficeSnapshot(store);
  const agents = new Map(snapshot.agents.map((a) => [a.id, a]));
  const actions = Object.values(snapshot.actions).sort(
    (a, b) => b.created_at.getTime() - a.created_at.getTime(),
  );
  const pending = actions.filter((a) => a.status === 'proposed').reverse();
  const history = actions.filter((a) => a.status !== 'proposed').slice(0, 20);

  const dryRun = snapshot.settings?.dry_run ?? true;
  return (
    <div className="grid gap-6">
      {dryRun ? (
        <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent">
          Mode dry-run aktif: aksi yang disetujui hanya dicatat, tidak benar-benar dikirim. Ubah di
          Pengaturan.
        </p>
      ) : null}
      <section aria-label="Menunggu approval" className="grid gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">
          Menunggu approval ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted">Tidak ada aksi yang menunggu.</p>
        ) : null}
        {pending.map((action) => (
          <ApprovalCard
            key={action.id}
            action={action}
            task={snapshot.tasks[action.task_id]}
            agent={agents.get(action.agent_id)}
            role={role}
          />
        ))}
      </section>
      <section aria-label="Riwayat" className="grid gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Riwayat</h2>
        {history.length === 0 ? <p className="text-sm text-muted">Belum ada riwayat.</p> : null}
        {history.map((action) => (
          <ApprovalCard
            key={action.id}
            action={action}
            task={snapshot.tasks[action.task_id]}
            agent={agents.get(action.agent_id)}
            role={role}
          />
        ))}
      </section>
    </div>
  );
}
