'use client';

import { formatTimeWib } from '@/lib/format';
import { describeEvent } from '@/lib/office/describe';
import type { OfficeSnapshot } from '@/lib/office/types';

export function ActivityTab({ snapshot }: { snapshot: OfficeSnapshot }) {
  const items = snapshot.events
    .map((event) => ({ event, text: describeEvent(event, snapshot) }))
    .filter(
      (item): item is { event: (typeof snapshot.events)[number]; text: string } =>
        item.text !== null,
    );
  if (items.length === 0) return <p className="text-sm text-muted">Belum ada aktivitas.</p>;
  return (
    <ol className="divide-y divide-line" aria-label="Aktivitas">
      {items.map(({ event, text }) => (
        <li
          key={event.id}
          className="grid grid-cols-[46px_1fr] gap-2 py-1.5 text-[13px]"
          data-testid="activity-item"
        >
          <time
            className="font-mono text-xs text-muted tabular-nums"
            dateTime={event.created_at.toISOString()}
          >
            {formatTimeWib(event.created_at)}
          </time>
          <span>{text}</span>
        </li>
      ))}
    </ol>
  );
}
