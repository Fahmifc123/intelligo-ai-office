'use client';

import {
  ACTION_KIND_LABELS,
  AUTO_APPROVABLE_KINDS,
  type ActionKind,
  type MemberRole,
} from '@intelligo/shared';
import { useState, useTransition } from 'react';
import { updateSettings } from '@/app/actions/admin';

interface Props {
  role: MemberRole;
  initial: { dry_run: boolean; auto_approve_kinds: ActionKind[]; usd_to_idr: number };
}

export function SettingsForm({ role, initial }: Props) {
  const [dryRun, setDryRun] = useState(initial.dry_run);
  const [kinds, setKinds] = useState<Set<ActionKind>>(new Set(initial.auto_approve_kinds));
  const [rate, setRate] = useState(String(initial.usd_to_idr));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const isOwner = role === 'owner';

  const save = (): void => {
    setMessage(null);
    startTransition(async () => {
      const result = await updateSettings({
        dry_run: dryRun,
        auto_approve_kinds: [...kinds],
        usd_to_idr: Number(rate),
      });
      setMessage(
        result.ok ? { ok: true, text: 'Pengaturan tersimpan.' } : { ok: false, text: result.error },
      );
    });
  };

  return (
    <fieldset disabled={!isOwner || pending} className="grid gap-4">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={dryRun}
          onChange={(e) => setDryRun(e.target.checked)}
          className="mt-1"
          aria-label="Mode dry-run"
        />
        <span>
          <span className="font-semibold">Mode dry-run</span>
          <span className="block text-xs text-muted">
            Aksi yang disetujui hanya dicatat, tidak dikirim ke n8n. Env DRY_RUN=true di worker
            selalu memaksa dry-run.
          </span>
        </span>
      </label>
      <div className="grid gap-1.5">
        <p className="text-sm font-semibold">Setujui otomatis tanpa approval manual</p>
        <p className="text-xs text-muted">Broadcast WhatsApp selalu wajib disetujui Owner.</p>
        <div className="flex flex-wrap gap-1.5">
          {AUTO_APPROVABLE_KINDS.map((kind) => (
            <label
              key={kind}
              className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs"
            >
              <input
                type="checkbox"
                checked={kinds.has(kind)}
                onChange={(e) =>
                  setKinds((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(kind);
                    else next.delete(kind);
                    return next;
                  })
                }
              />
              {ACTION_KIND_LABELS[kind]}
            </label>
          ))}
        </div>
      </div>
      <label className="grid gap-1 text-sm font-semibold">
        Kurs USD ke IDR (untuk tampilan biaya)
        <input
          inputMode="numeric"
          value={rate}
          onChange={(e) => setRate(e.target.value.replace(/[^\d]/g, ''))}
          className="w-40 rounded-lg border border-line bg-surface-2 px-2 py-1.5 font-normal"
          aria-label="Kurs USD ke IDR"
        />
      </label>
      {isOwner ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-ink disabled:opacity-50"
          >
            Simpan pengaturan
          </button>
          {message ? (
            <span role="status" className={`text-sm ${message.ok ? 'text-ok' : 'text-accent'}`}>
              {message.text}
            </span>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted">Hanya Owner yang bisa mengubah pengaturan.</p>
      )}
    </fieldset>
  );
}
