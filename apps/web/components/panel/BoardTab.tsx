'use client';

import type { MemberRole, TaskRow, TaskStatus } from '@intelligo/shared';
import type { AgentSummary, OfficeSnapshot } from '@/lib/office/types';
import { TaskCard } from './TaskCard';

const COLUMNS: { title: string; statuses: TaskStatus[]; limit?: number }[] = [
  {
    title: 'Berjalan',
    statuses: ['queued', 'routing', 'in_progress', 'awaiting_review', 'needs_revision'],
  },
  { title: 'Menunggu approval', statuses: ['awaiting_approval', 'executing'] },
  { title: 'Selesai', statuses: ['done', 'failed', 'cancelled'], limit: 30 },
];

export function BoardTab({
  snapshot,
  role,
  onError,
}: {
  snapshot: OfficeSnapshot;
  role: MemberRole;
  onError(message: string): void;
}) {
  const agentsById = new Map<string, AgentSummary>(snapshot.agents.map((a) => [a.id, a]));
  const tasks = Object.values(snapshot.tasks);
  const children = new Map<string, TaskRow[]>();
  for (const task of tasks) {
    if (!task.parent_task_id) continue;
    children.set(task.parent_task_id, [...(children.get(task.parent_task_id) ?? []), task]);
  }
  // Subtasks show under their parent; they appear on their own only if the parent is not loaded.
  const topLevel = tasks.filter((t) => !t.parent_task_id || !snapshot.tasks[t.parent_task_id]);

  return (
    <div className="grid gap-4">
      {COLUMNS.map((column) => {
        const list = topLevel
          .filter((t) => column.statuses.includes(t.status))
          .sort(
            (a, b) => a.priority - b.priority || b.created_at.getTime() - a.created_at.getTime(),
          )
          .slice(0, column.limit);
        return (
          <section key={column.title} aria-label={column.title}>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
              {column.title}
              <span className="rounded-full bg-surface-2 px-1.5">{list.length}</span>
            </h3>
            {list.length === 0 ? (
              <p className="text-xs text-muted">Belum ada.</p>
            ) : (
              <div className="grid gap-2">
                {list.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    agent={task.assignee_id ? agentsById.get(task.assignee_id) : undefined}
                    review={snapshot.reviews[task.id]}
                    role={role}
                    childTasks={children.get(task.id)}
                    agentsById={agentsById}
                    onError={onError}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
