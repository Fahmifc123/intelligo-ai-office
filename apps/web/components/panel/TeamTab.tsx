'use client';

import { ACTIVITY_LABELS } from '@intelligo/shared';
import { ActivityDot } from '@/components/ui/ActivityDot';
import { Avatar } from '@/components/ui/Avatar';
import type { OfficeSnapshot } from '@/lib/office/types';

const QUEUED = new Set(['queued', 'routing', 'needs_revision']);

export function TeamTab({
  snapshot,
  selectedId,
  onSelect,
}: {
  snapshot: OfficeSnapshot;
  selectedId: string | null;
  onSelect(agentId: string): void;
}) {
  const tasks = Object.values(snapshot.tasks);
  return (
    <ul className="divide-y divide-line" aria-label="Daftar agen">
      {snapshot.agents.map((agent) => {
        const state = snapshot.states[agent.id];
        const activity = state?.activity ?? 'idle';
        const queue = tasks.filter(
          (t) => t.assignee_id === agent.id && QUEUED.has(t.status),
        ).length;
        return (
          <li key={agent.id}>
            <button
              type="button"
              onClick={() => onSelect(agent.id)}
              aria-current={selectedId === agent.id}
              data-testid={`team-${agent.id}`}
              className="grid w-full grid-cols-[32px_1fr_auto] items-center gap-2.5 rounded-xl px-1.5 py-2 text-left hover:bg-surface-2 aria-[current=true]:bg-accent-soft"
            >
              <Avatar name={agent.name} color={agent.appearance.shirt} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {agent.name} · {agent.role}
                </span>
                <span
                  className="block truncate text-xs text-muted"
                  data-testid={`status-${agent.id}`}
                >
                  {state?.status_text ?? ''}
                </span>
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <ActivityDot activity={activity} />
                {queue > 0 ? `${queue} antre` : ACTIVITY_LABELS[activity]}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
