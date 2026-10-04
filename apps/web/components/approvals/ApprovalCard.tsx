'use client';

import { ACTION_KIND_LABELS, type ActionRow, type MemberRole } from '@intelligo/shared';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { approveAction, rejectAction } from '@/app/actions/approvals';
import { formatDateTimeWib } from '@/lib/format';
import type { AgentSummary, TaskRow } from '@/lib/office/types';
import { ActionPreview } from './ActionPreview';

const STATUS_LABELS: Record<ActionRow['status'], string> = {
  proposed: 'Menunggu approval',
  approved: 'Disetujui, sedang dikirim',
  rejected: 'Ditolak',
  executed: 'Terkirim',
  failed: 'Gagal',
};

/** Simple kinds get field editors; structured ones (invoice, broadcast) get a JSON editor. */
const FIELD_EDITORS: Partial<
  Record<ActionRow['kind'], { key: string; label: string; multiline?: boolean }[]>
> = {
  send_whatsapp: [
    { key: 'to', label: 'Nomor WhatsApp' },
    { key: 'message', label: 'Pesan', multiline: true },
  ],
  send_email: [
    { key: 'to', label: 'Kepada' },
    { key: 'subject', label: 'Subjek' },
    { key: 'body', label: 'Isi email', multiline: true },
  ],
  schedule_post: [
    { key: 'platform', label: 'Platform' },
    { key: 'scheduled_at', label: 'Waktu tayang (ISO 8601)' },
    { key: 'caption', label: 'Caption', multiline: true },
  ],
};

interface Props {
  action: ActionRow;
  task: TaskRow | undefined;
  agent: AgentSummary | undefined;
  role: MemberRole;
}

export function ApprovalCard({ action, task, agent, role }: Props) {
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [json, setJson] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isOwner = role === 'owner';
  const editors = FIELD_EDITORS[action.kind];

  const startEdit = (): void => {
    const payload = action.payload as Record<string, unknown>;
    setFields(
      Object.fromEntries((editors ?? []).map((f) => [f.key, String(payload[f.key] ?? '')])),
    );
    setJson(JSON.stringify(payload, null, 2));
    setError(null);
    setEditing(true);
  };

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>): void => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? 'Gagal.');
      else setEditing(false);
    });
  };

  const submitEdit = (): void => {
    let payload: unknown;
    if (editors) {
      payload = { ...(action.payload as Record<string, unknown>), ...fields };
    } else {
      try {
        payload = JSON.parse(json);
      } catch {
        setError('JSON tidak valid.');
        return;
      }
    }
    run(() => approveAction(action.id, payload));
  };

  return (
    <article
      className="grid gap-3 rounded-2xl border border-line bg-surface p-4"
      data-testid="approval-card"
      data-action-id={action.id}
      data-status={action.status}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{ACTION_KIND_LABELS[action.kind]}</p>
          <p className="text-xs text-muted">
            Diusulkan {agent ? `${agent.name} (${agent.role})` : 'agen'} ·{' '}
            {formatDateTimeWib(action.created_at)}
            {task ? (
              <>
                {' · '}
                <Link className="font-semibold text-accent" href={`/tasks/${task.id}`}>
                  {task.title}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <span
          className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold"
          data-testid="approval-status"
        >
          {STATUS_LABELS[action.status]}
        </span>
      </header>

      {editing ? (
        <div className="grid gap-2">
          {editors ? (
            editors.map((field) => (
              <label key={field.key} className="grid gap-1 text-xs font-semibold">
                {field.label}
                {field.multiline ? (
                  <textarea
                    rows={5}
                    value={fields[field.key] ?? ''}
                    onChange={(e) =>
                      setFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm font-normal"
                  />
                ) : (
                  <input
                    value={fields[field.key] ?? ''}
                    onChange={(e) =>
                      setFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm font-normal"
                  />
                )}
              </label>
            ))
          ) : (
            <label className="grid gap-1 text-xs font-semibold">
              Payload (JSON)
              <textarea
                rows={12}
                value={json}
                onChange={(e) => setJson(e.target.value)}
                className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 font-mono text-xs font-normal"
              />
            </label>
          )}
        </div>
      ) : (
        <ActionPreview kind={action.kind} payload={action.payload} />
      )}

      {action.error ? <p className="text-sm text-accent">{action.error}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      ) : null}

      {action.status === 'proposed' ? (
        isOwner ? (
          <footer className="flex flex-wrap gap-2">
            {editing ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={submitEdit}
                  className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-ink disabled:opacity-50"
                >
                  Simpan dan setujui
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setEditing(false)}
                  className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold"
                >
                  Batal
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => approveAction(action.id))}
                  className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-ink disabled:opacity-50"
                >
                  Setujui
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={startEdit}
                  className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold"
                >
                  Edit lalu setujui
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => rejectAction(action.id))}
                  className="rounded-full px-4 py-1.5 text-sm font-semibold text-muted hover:text-accent"
                >
                  Tolak
                </button>
              </>
            )}
          </footer>
        ) : (
          <p className="text-xs text-muted">Hanya Owner yang bisa menyetujui atau menolak aksi.</p>
        )
      ) : null}
    </article>
  );
}
