'use client';

import { isTerminal, type MemberRole, type TaskRow } from '@intelligo/shared';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { cancelTask } from '@/app/actions/tasks';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { AgentSummary, ReviewRow } from '@/lib/office/types';

interface Props {
  task: TaskRow;
  agent: AgentSummary | undefined;
  review: ReviewRow | undefined;
  role: MemberRole;
  childTasks?: TaskRow[];
  pendingActions?: number;
  agentsById: Map<string, AgentSummary>;
  onError(message: string): void;
}

const PRIORITY: Record<number, string> = { 1: 'Prioritas tinggi', 3: 'Prioritas rendah' };

export function TaskCard({
  task,
  agent,
  review,
  role,
  childTasks = [],
  pendingActions = 0,
  agentsById,
  onError,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const result = task.result_text ?? '';
  const streaming = task.status === 'in_progress' && result.length > 0;
  const manualCheck =
    (task.result_json as { manual_check?: unknown } | null)?.manual_check === true;
  const canCancel = role !== 'viewer' && !isTerminal(task.status) && task.status !== 'executing';

  return (
    <article
      className="rounded-xl border border-line bg-surface p-3"
      data-testid="task-card"
      data-task-id={task.id}
      data-status={task.status}
    >
      <header className="flex items-start gap-2">
        {agent ? (
          <Avatar name={agent.name} color={agent.appearance.shirt} size={26} />
        ) : (
          <Avatar name="?" color="#8b97ad" size={26} />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug font-semibold">{task.title}</p>
          <p className="text-xs text-muted">
            {agent
              ? `${agent.name} · ${agent.role}`
              : task.status === 'routing'
                ? 'Sedang dibagi oleh Manager'
                : 'Menunggu penerima'}
            {PRIORITY[task.priority] ? ` · ${PRIORITY[task.priority]}` : ''}
          </p>
        </div>
        <StatusBadge status={task.status} />
      </header>

      {result ? (
        <div className="mt-2">
          <p
            data-testid="task-result"
            className={`text-sm whitespace-pre-wrap text-ink/90 ${expanded ? '' : 'line-clamp-6'} ${streaming ? 'after:ml-0.5 after:animate-pulse after:content-["▍"]' : ''}`}
          >
            {result}
          </p>
          {result.length > 280 ? (
            <button
              type="button"
              className="mt-1 text-xs font-semibold text-accent"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Ringkas' : 'Lihat semua'}
            </button>
          ) : null}
        </div>
      ) : null}

      {task.error ? <p className="mt-2 text-sm text-accent">{task.error}</p> : null}

      {review ? (
        <p className="mt-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs" data-testid="review-note">
          <span className="font-semibold">
            {review.verdict === 'approved' ? 'Disetujui' : 'Perlu revisi'}:
          </span>{' '}
          {review.notes}
          {task.revision_count > 0 ? (
            <span className="text-muted"> · revisi {task.revision_count}x</span>
          ) : null}
        </p>
      ) : null}
      {pendingActions > 0 ? (
        <Link
          href="/approvals"
          className="mt-2 block rounded-lg bg-accent-soft px-2.5 py-1.5 text-xs font-semibold text-accent"
          data-testid="pending-actions"
        >
          {pendingActions} aksi menunggu approval Owner
        </Link>
      ) : null}
      {manualCheck ? (
        <p className="mt-2 text-xs font-semibold text-warn">
          Perlu cek manual: batas revisi tercapai.
        </p>
      ) : null}

      {childTasks.length > 0 ? (
        <ul className="mt-2 grid gap-1 border-l-2 border-line pl-2.5" aria-label="Subtugas">
          {childTasks.map((child) => (
            <li key={child.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate">
                {agentsById.get(child.assignee_id ?? '')?.name ?? '?'}: {child.title}
              </span>
              <StatusBadge status={child.status} />
            </li>
          ))}
        </ul>
      ) : null}

      <footer className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
        {result ? (
          <button
            type="button"
            className="rounded-full border border-line px-2.5 py-1 hover:border-accent"
            onClick={() => {
              void navigator.clipboard.writeText(result).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? 'Tersalin' : 'Salin'}
          </button>
        ) : null}
        <Link
          href={`/tasks/${task.id}`}
          className="rounded-full border border-line px-2.5 py-1 hover:border-accent"
        >
          Detail
        </Link>
        {canCancel ? (
          <button
            type="button"
            disabled={pending}
            className="ml-auto rounded-full px-2.5 py-1 text-muted hover:text-accent disabled:opacity-50"
            onClick={() =>
              startTransition(async () => {
                const res = await cancelTask(task.id);
                if (!res.ok) onError(res.error);
              })
            }
          >
            Batalkan
          </button>
        ) : null}
      </footer>
    </article>
  );
}
