import { TASK_STATUS_LABELS, type TaskStatus } from '@intelligo/shared';

const TONE: Record<TaskStatus, string> = {
  queued: 'bg-surface-2 text-muted',
  routing: 'bg-surface-2 text-muted',
  in_progress: 'bg-ok/15 text-ok',
  awaiting_review: 'bg-meet/15 text-meet',
  needs_revision: 'bg-warn/15 text-warn',
  awaiting_approval: 'bg-accent-soft text-accent',
  executing: 'bg-accent-soft text-accent',
  done: 'bg-ok/15 text-ok',
  failed: 'bg-accent text-accent-ink',
  cancelled: 'bg-surface-2 text-muted',
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span
      data-status={status}
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[status]}`}
    >
      {TASK_STATUS_LABELS[status]}
    </span>
  );
}
