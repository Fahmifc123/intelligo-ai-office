'use client';

import type { MemberRole } from '@intelligo/shared';
import Link from 'next/link';
import { useTransition } from 'react';
import { setBreakMode, startMeeting } from '@/app/actions/office';
import { formatIdr, formatTimeWib, formatUsd } from '@/lib/format';
import { startOfTodayWib } from '@/lib/office/snapshot';
import { useNow } from '@/lib/use-now';
import type { RealtimeStatus } from '@/lib/office/realtime';
import type { OfficeSnapshot } from '@/lib/office/types';

interface Props {
  snapshot: OfficeSnapshot;
  role: MemberRole;
  email: string;
  realtime: RealtimeStatus;
  labelsVisible: boolean;
  onToggleLabels(): void;
  onError(message: string): void;
}

function Chip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold"
    >
      {children}
    </span>
  );
}

function Clock({ now }: { now: number | null }) {
  return (
    <span className="font-mono text-xs tabular-nums">
      {now !== null ? `${formatTimeWib(new Date(now))} WIB` : '--:-- WIB'}
    </span>
  );
}

export function Header({
  snapshot,
  role,
  email,
  realtime,
  labelsVisible,
  onToggleLabels,
  onError,
}: Props) {
  const [pending, startTransition] = useTransition();
  const now = useNow(1000);
  const states = Object.values(snapshot.states);
  const count = (activity: string): number => states.filter((s) => s.activity === activity).length;
  const todayStart = new Date(startOfTodayWib()).getTime();
  const doneToday = Object.values(snapshot.tasks).filter(
    (t) => t.status === 'done' && t.finished_at && t.finished_at.getTime() >= todayStart,
  ).length;
  const costUsd = snapshot.usageToday.reduce((sum, u) => sum + u.cost_usd, 0);
  const rate = snapshot.settings?.usd_to_idr ?? 16000;
  const pendingApprovals = Object.values(snapshot.actions).filter(
    (a) => a.status === 'proposed',
  ).length;
  const meetingUntil = snapshot.settings?.meeting_until?.getTime() ?? 0;
  const meetingOn = now !== null && meetingUntil > now;
  const breakOn = snapshot.settings?.break_mode ?? false;
  const canAct = role !== 'viewer';

  const run = (action: () => Promise<{ ok: boolean; error?: string }>): void => {
    startTransition(async () => {
      const result = await action();
      if (!result.ok && result.error) onError(result.error);
    });
  };

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Link href="/" className="flex items-center gap-3">
        <span className="grid size-[34px] place-items-center rounded-[9px] bg-navy font-display text-lg font-extrabold text-accent">
          I
        </span>
        <span>
          <span className="block font-display text-lg leading-tight font-extrabold text-navy">
            Intelligo <span className="text-accent">AI Office</span>
          </span>
          <span className="block text-[11px] font-semibold tracking-wide text-muted">
            KANTOR AI · BANDUNG
          </span>
        </span>
      </Link>

      <div className="flex flex-wrap items-center gap-1.5" aria-label="Ringkasan kantor">
        <Chip title="Agen yang sedang bekerja">
          <span className="size-2 rounded-full bg-ok" />{' '}
          <span data-testid="count-working">{count('working')}</span> bekerja
        </Chip>
        <Chip title="Agen yang sedang istirahat">
          <span className="size-2 rounded-full bg-warn" /> {count('break')} istirahat
        </Chip>
        <Chip title="Agen yang sedang rapat">
          <span className="size-2 rounded-full bg-meet" /> {count('meeting')} rapat
        </Chip>
        <Chip title="Tugas selesai hari ini">{doneToday} selesai hari ini</Chip>
        <Chip title={`Kurs ${formatIdr(rate)} per USD`}>
          Biaya hari ini <span data-testid="cost-today">{formatUsd(costUsd)}</span>
          <span className="font-normal text-muted">({formatIdr(costUsd * rate)})</span>
        </Chip>
        <Chip>
          <Clock now={now} />
        </Chip>
        <Link
          href="/approvals"
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold"
        >
          Approval
          <span
            data-testid="approval-badge"
            className={`rounded-full px-1.5 text-[11px] ${pendingApprovals > 0 ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`}
          >
            {pendingApprovals}
          </span>
        </Link>
        <Link
          href="/agents"
          className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold"
        >
          Agen
        </Link>
        <Link
          href="/settings"
          className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold"
        >
          Pengaturan
        </Link>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={!canAct || pending}
          aria-pressed={meetingOn}
          onClick={() => run(startMeeting)}
          className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold aria-pressed:border-meet aria-pressed:text-meet disabled:opacity-50"
        >
          Rapat tim
        </button>
        <button
          type="button"
          disabled={!canAct || pending}
          aria-pressed={breakOn}
          onClick={() => run(() => setBreakMode(!breakOn))}
          className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold aria-pressed:border-warn aria-pressed:text-warn disabled:opacity-50"
        >
          Jam istirahat
        </button>
        <button
          type="button"
          aria-pressed={labelsVisible}
          onClick={onToggleLabels}
          className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold aria-pressed:border-accent"
        >
          Label
        </button>
        <nav className="flex items-center gap-1.5 text-xs font-semibold">
          <Link className="rounded-full px-2 py-1.5 hover:bg-surface-2" href="/agents">
            Agen
          </Link>
          <Link className="rounded-full px-2 py-1.5 hover:bg-surface-2" href="/settings">
            Pengaturan
          </Link>
        </nav>
        <span
          title={realtime === 'live' ? 'Terhubung realtime' : 'Menyambungkan realtime'}
          className={`size-2 rounded-full ${realtime === 'live' ? 'bg-ok' : realtime === 'offline' ? 'bg-accent' : 'bg-idle'}`}
          data-testid="realtime-status"
          data-status={realtime}
        />
        <form
          action="/auth/signout"
          method="post"
          className="flex items-center gap-2 text-xs text-muted"
        >
          <span className="hidden sm:inline" title={email}>
            {role === 'owner' ? 'Owner' : role === 'staff' ? 'Staff' : 'Viewer'}
          </span>
          <button
            type="submit"
            className="rounded-full px-2 py-1.5 font-semibold hover:bg-surface-2"
          >
            Keluar
          </button>
        </form>
      </div>
    </header>
  );
}
