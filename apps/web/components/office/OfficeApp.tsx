'use client';

import type { MemberRole } from '@intelligo/shared';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ChatPanel } from '@/components/panel/ChatPanel';
import { OpsPanel, type PanelTab } from '@/components/panel/OpsPanel';
import { Avatar } from '@/components/ui/Avatar';
import { useDemoFeed } from '@/lib/office/demo-feed';
import { useOfficeRealtime, type RealtimeStatus } from '@/lib/office/realtime';
import { OfficeStore, useOfficeSnapshot } from '@/lib/office/store';
import type { AgentSummary, OfficeSnapshot } from '@/lib/office/types';
import { Header } from './Header';
import { OfficeCanvas } from './OfficeCanvas';

interface Props {
  initial: OfficeSnapshot;
  viewer: { email: string; role: MemberRole };
}

/** The live office: Supabase Realtime feeds the store. */
export function OfficeApp({ initial, viewer }: Props) {
  const store = useMemo(() => new OfficeStore(initial), [initial]);
  const realtime = useOfficeRealtime(store);
  return (
    <OfficeView
      store={store}
      realtime={realtime}
      viewer={viewer}
      renderChat={(agent) => <ChatPanel key={agent.id} agent={agent} role={viewer.role} />}
    />
  );
}

const PREVIEW_VIEWER = { email: 'pratinjau', role: 'viewer' } as const;

/** Preview mode (no database): demo data, simulated office life, everything read-only. */
export function PreviewOfficeApp({ initial }: { initial: OfficeSnapshot }) {
  const store = useMemo(() => new OfficeStore(initial), [initial]);
  const realtime = useDemoFeed(store);
  return (
    <OfficeView
      store={store}
      realtime={realtime}
      viewer={PREVIEW_VIEWER}
      banner="Mode pratinjau: database belum terhubung. Data di bawah adalah contoh; kirim tugas, chat, dan approval aktif setelah Supabase disambungkan."
      renderChat={(agent) => <PreviewChat agent={agent} />}
    />
  );
}

function PreviewChat({ agent }: { agent: AgentSummary }) {
  return (
    <div className="grid content-start gap-3 p-4 text-sm" data-testid="chat-panel">
      <div className="flex items-center gap-3">
        <Avatar name={agent.name} color={agent.appearance.shirt} />
        <div>
          <p className="font-semibold">{agent.name}</p>
          <p className="text-xs text-muted">{agent.role}</p>
        </div>
      </div>
      <p className="text-muted">{agent.focus}</p>
      <p className="rounded-xl bg-surface-2 px-3 py-2 text-muted">
        Chat dengan {agent.name} aktif setelah database dan API key terhubung.
      </p>
    </div>
  );
}

interface ViewProps {
  store: OfficeStore;
  realtime: RealtimeStatus;
  viewer: { email: string; role: MemberRole };
  banner?: string;
  renderChat: (agent: AgentSummary) => ReactNode;
}

function OfficeView({ store, realtime, viewer, banner, renderChat }: ViewProps) {
  const snapshot = useOfficeSnapshot(store);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [labelsVisible, setLabelsVisible] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<PanelTab>('team');
  const select = useCallback((id: string) => {
    // Clicking a character or a team row opens the chat with that agent.
    setSelectedId(id);
    setTab('chat');
  }, []);
  const selectedAgent = snapshot.agents.find((a) => a.id === selectedId);

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
      {banner ? (
        <p
          data-testid="preview-banner"
          className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-muted"
        >
          {banner}
        </p>
      ) : null}
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
            chat={selectedAgent ? renderChat(selectedAgent) : undefined}
          />
        </aside>
      </main>
    </div>
  );
}
