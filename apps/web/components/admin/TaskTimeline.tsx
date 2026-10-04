'use client';

import { TOOL_LABELS, type TaskEventRow } from '@intelligo/shared';
import { useState } from 'react';
import { formatDateTimeWib } from '@/lib/format';

const TYPE_LABELS: Record<string, string> = {
  routed: 'Dibagi',
  started: 'Mulai',
  tool_call: 'Tool',
  tool_result: 'Hasil tool',
  draft: 'Hasil diserahkan',
  review: 'Review',
  approval: 'Approval',
  executed: 'Dieksekusi',
  failed: 'Gagal',
  note: 'Catatan',
};

function line(event: TaskEventRow, names: Record<string, string>): string {
  const p = event.payload;
  const s = (v: unknown): string => (typeof v === 'string' ? v : '');
  switch (event.type) {
    case 'routed':
      return `Ditugaskan ke ${names[s(p.assignee_id)] ?? s(p.assignee_id)}: ${s(p.reason)}`;
    case 'started':
      return p.resumed === true
        ? 'Melanjutkan setelah subtugas selesai'
        : typeof p.revision === 'number' && p.revision > 0
          ? `Revisi ke-${p.revision}`
          : 'Mulai mengerjakan';
    case 'tool_call':
      return `${TOOL_LABELS[s(p.name)] ?? s(p.name)}`;
    case 'tool_result':
      return `${s(p.name)}: ${s(p.summary)}`;
    case 'draft':
      return s(p.summary);
    case 'review':
      return `${p.verdict === 'approved' ? 'Disetujui' : 'Minta revisi'}: ${s(p.notes)}`;
    case 'approval':
      return `${s(p.decision)} ${s(p.kind)} oleh ${s(p.actor_email) || 'otomatis'}`;
    case 'executed':
      return `${s(p.kind)} ${p.dry_run === true ? '(dry-run)' : 'terkirim'}`;
    case 'failed':
      return s(p.error);
    default:
      return s(p.message) || s(p.status) || '';
  }
}

/** Full task timeline; tool calls and results expand to show their input / output. */
export function TaskTimeline({
  events,
  names,
}: {
  events: TaskEventRow[];
  names: Record<string, string>;
}) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const visible = events.filter((e) => e.payload.ambient !== true);
  if (visible.length === 0) return <p className="text-sm text-muted">Belum ada catatan.</p>;
  return (
    <ol className="grid gap-2" aria-label="Timeline">
      {visible.map((event) => {
        const expandable =
          event.type === 'tool_call' || event.type === 'tool_result' || event.type === 'approval';
        const isOpen = open.has(event.id);
        return (
          <li
            key={event.id}
            className="grid grid-cols-[110px_1fr] gap-3 text-sm"
            data-testid="timeline-item"
            data-type={event.type}
          >
            <time
              className="font-mono text-xs text-muted"
              dateTime={event.created_at.toISOString()}
            >
              {formatDateTimeWib(event.created_at)}
            </time>
            <div className="min-w-0">
              <p>
                <span className="mr-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold">
                  {TYPE_LABELS[event.type] ?? event.type}
                </span>
                {event.agent_id ? (
                  <span className="font-semibold">{names[event.agent_id] ?? event.agent_id}: </span>
                ) : null}
                {line(event, names)}
                {expandable ? (
                  <button
                    type="button"
                    className="ml-2 text-xs font-semibold text-accent"
                    aria-expanded={isOpen}
                    onClick={() =>
                      setOpen((prev) => {
                        const next = new Set(prev);
                        if (next.has(event.id)) next.delete(event.id);
                        else next.add(event.id);
                        return next;
                      })
                    }
                  >
                    {isOpen ? 'Tutup' : 'Detail'}
                  </button>
                ) : null}
              </p>
              {expandable && isOpen ? (
                <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-surface-2 p-2 text-xs">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
