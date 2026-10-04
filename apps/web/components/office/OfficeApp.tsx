'use client';

import type { MemberRole } from '@intelligo/shared';
import { useCallback, useMemo, useState } from 'react';
import { OpsPanel, type PanelTab } from '@/components/panel/OpsPanel';
import { useOfficeRealtime } from '@/lib/office/realtime';
import { OfficeStore, useOfficeSnapshot } from '@/lib/office/store';
import type { OfficeSnapshot } from '@/lib/office/types';
import { Header } from './Header';
import { OfficeCanvas } from './OfficeCanvas';

interface Props {
  initial: OfficeSnapshot;
  viewer: { email: string; role: MemberRole };
}

export function OfficeApp({ initial, viewer }: Props) {
  const store = useMemo(() => new OfficeStore(initial), [initial]);
  const realtime = useOfficeRealtime(store);
  const snapshot = useOfficeSnapshot(store);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [labelsVisible, setLabelsVisible] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<PanelTab>('team');
  const select = useCallback(
    (id: string) => setSelectedId((current) => (current === id ? null : id)),
    [],
  );

  return (
    <div className="grid min-h-full grid-rows-[auto_1fr] gap-3 px-4 py-3 lg:h-full">
      <Header
        snapshot={snapshot}
        role={viewer.role}
        email={viewer.email}
        realtime={realtime}
        labelsVisible={labelsVisible}
        onToggleLabels={() => setLabelsVisible((v) => !v)}
        onError={setNotice}
      />
      {notice ? (
        <div
          role="alert"
          className="flex items-center justify-between rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent"
        >
          {notice}
          <button type="button" className="font-semibold" onClick={() => setNotice(null)}>
            Tutup
          </button>
        </div>
      ) : null}
      <main className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section
          aria-label="Kantor"
          className="h-[65vw] min-h-[260px] overflow-hidden rounded-2xl border border-line bg-surface lg:h-auto"
        >
          <OfficeCanvas
            agents={snapshot.agents}
            states={snapshot.states}
            selectedId={selectedId}
            labelsVisible={labelsVisible}
            onSelect={select}
          />
        </section>
        <aside
          aria-label="Panel operasional"
          className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-line bg-surface lg:min-h-0"
        >
          <OpsPanel
            snapshot={snapshot}
            role={viewer.role}
            selectedId={selectedId}
            tab={tab}
            onTab={setTab}
            onSelect={select}
            onError={setNotice}
          />
        </aside>
      </main>
    </div>
  );
}
