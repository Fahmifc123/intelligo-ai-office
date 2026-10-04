'use client';

import type { MemberRole } from '@intelligo/shared';
import { useState, type ReactNode } from 'react';
import type { OfficeSnapshot } from '@/lib/office/types';
import { ActivityTab } from './ActivityTab';
import { BoardTab } from './BoardTab';
import { Composer } from './Composer';
import { TeamTab } from './TeamTab';

export type PanelTab = 'team' | 'board' | 'activity' | 'chat';

interface Props {
  snapshot: OfficeSnapshot;
  role: MemberRole;
  selectedId: string | null;
  tab: PanelTab;
  onTab(tab: PanelTab): void;
  onSelect(agentId: string): void;
  onError(message: string): void;
  chat?: ReactNode;
}

export function OpsPanel({
  snapshot,
  role,
  selectedId,
  tab,
  onTab,
  onSelect,
  onError,
  chat,
}: Props) {
  const [lastCreated, setLastCreated] = useState<string | null>(null);
  const running = Object.values(snapshot.tasks).filter(
    (t) => !['done', 'failed', 'cancelled'].includes(t.status),
  ).length;
  const tabs: { id: PanelTab; label: string; badge?: number }[] = [
    { id: 'team', label: 'Tim' },
    { id: 'board', label: 'Papan', badge: running },
    { id: 'activity', label: 'Aktivitas' },
    ...(chat ? [{ id: 'chat' as const, label: 'Chat' }] : []),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line p-3">
        <Composer
          agents={snapshot.agents}
          role={role}
          onCreated={(id) => {
            setLastCreated(id);
            onTab('board');
          }}
          onError={onError}
        />
        {lastCreated ? (
          <span className="sr-only" data-testid="last-created">
            {lastCreated}
          </span>
        ) : null}
      </div>
      <div role="tablist" aria-label="Panel" className="flex gap-1 border-b border-line px-3 pt-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
            className="-mb-px flex items-center gap-1.5 border-b-2 border-transparent px-2.5 py-1.5 text-sm font-semibold text-muted aria-selected:border-accent aria-selected:text-ink"
          >
            {t.label}
            {t.badge ? (
              <span className="rounded-full bg-accent px-1.5 text-[11px] text-accent-ink">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-auto p-3">
        {tab === 'team' ? (
          <TeamTab snapshot={snapshot} selectedId={selectedId} onSelect={onSelect} />
        ) : null}
        {tab === 'board' ? <BoardTab snapshot={snapshot} role={role} onError={onError} /> : null}
        {tab === 'activity' ? <ActivityTab snapshot={snapshot} /> : null}
        {tab === 'chat' ? chat : null}
      </div>
    </div>
  );
}
