'use client';

import { MemberRole } from '@intelligo/shared';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { removeMember, saveMember } from '@/app/actions/admin';
import type { Member } from '@/lib/admin/queries';

const ROLE_LABEL: Record<MemberRole, string> = { owner: 'Owner', staff: 'Staff', viewer: 'Viewer' };

export function MembersManager({ members, role }: { members: Member[]; role: MemberRole }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<MemberRole>('staff');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isOwner = role === 'owner';

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>): void => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? 'Gagal.');
      else router.refresh();
    });
  };

  return (
    <div className="grid gap-3">
      <ul className="divide-y divide-line" aria-label="Anggota">
        {members.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="text-sm">
              {member.email}
              {member.user_id ? null : (
                <span className="ml-2 text-xs text-muted">(belum pernah masuk)</span>
              )}
            </span>
            {isOwner ? (
              <span className="flex items-center gap-2">
                <select
                  value={member.role}
                  disabled={pending}
                  onChange={(e) =>
                    run(() =>
                      saveMember({ email: member.email, role: MemberRole.parse(e.target.value) }),
                    )
                  }
                  aria-label={`Peran ${member.email}`}
                  className="rounded-lg border border-line bg-surface px-2 py-1 text-xs"
                >
                  {MemberRole.options.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => removeMember(member.id))}
                  className="text-xs font-semibold text-muted hover:text-accent"
                >
                  Hapus
                </button>
              </span>
            ) : (
              <span className="text-xs text-muted">{ROLE_LABEL[member.role]}</span>
            )}
          </li>
        ))}
      </ul>
      {isOwner ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              const result = await saveMember({ email, role: newRole });
              if (result.ok) setEmail('');
              return result;
            });
          }}
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@intelligo.id"
            aria-label="Email anggota baru"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(MemberRole.parse(e.target.value))}
            aria-label="Peran anggota baru"
            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
          >
            {MemberRole.options.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-ink disabled:opacity-50"
          >
            Tambah anggota
          </button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      ) : null}
    </div>
  );
}
