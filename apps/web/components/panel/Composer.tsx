'use client';

import type { MemberRole } from '@intelligo/shared';
import { useState, useTransition } from 'react';
import { createTask } from '@/app/actions/tasks';
import type { AgentSummary } from '@/lib/office/types';

const IDEAS = [
  'Buat caption promo Bootcamp Batch 21 untuk Instagram',
  'Balas calon peserta yang tanya harga private course',
  'Outline proposal training n8n untuk perusahaan logistik',
  'Pesan pengingat invoice yang jatuh tempo besok',
];

interface Props {
  agents: AgentSummary[];
  role: MemberRole;
  onCreated(taskId: string): void;
  onError(message: string): void;
}

export function Composer({ agents, role, onCreated, onError }: Props) {
  const [text, setText] = useState('');
  const [assignee, setAssignee] = useState<string>('auto');
  const [priority, setPriority] = useState('2');
  const [pending, startTransition] = useTransition();
  const disabled = role === 'viewer';

  const submit = (): void => {
    if (disabled || pending || text.trim().length < 3) return;
    startTransition(async () => {
      const result = await createTask({ text, assignee, priority });
      if (result.ok) {
        setText('');
        onCreated(result.data.id);
      } else {
        onError(result.error);
      }
    });
  };

  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      aria-label="Kirim tugas"
    >
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            submit();
          }
        }}
        disabled={disabled}
        rows={3}
        placeholder={
          disabled
            ? 'Mode lihat saja: Viewer tidak bisa mengirim tugas.'
            : 'Tulis tugas untuk tim AI...'
        }
        aria-label="Isi tugas"
        className="w-full resize-y rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="assignee">
          Penerima
        </label>
        <select
          id="assignee"
          value={assignee}
          onChange={(event) => setAssignee(event.target.value)}
          disabled={disabled}
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
        >
          <option value="auto">Otomatis</option>
          {agents
            .filter((a) => a.enabled)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.role}
              </option>
            ))}
        </select>
        <label className="sr-only" htmlFor="priority">
          Prioritas
        </label>
        <select
          id="priority"
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
          disabled={disabled}
          className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
        >
          <option value="1">Tinggi</option>
          <option value="2">Normal</option>
          <option value="3">Rendah</option>
        </select>
        <button
          type="submit"
          disabled={disabled || pending || text.trim().length < 3}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink disabled:opacity-50"
        >
          {pending ? 'Mengirim...' : 'Kirim'}
        </button>
      </div>
      {!disabled ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Contoh tugas">
          {IDEAS.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => setText(idea)}
              className="rounded-full border border-line px-2.5 py-1 text-left text-xs text-muted hover:border-accent hover:text-ink"
            >
              {idea}
            </button>
          ))}
        </div>
      ) : null}
      <p className="text-[11px] text-muted">Ctrl/Cmd + Enter untuk kirim.</p>
    </form>
  );
}
