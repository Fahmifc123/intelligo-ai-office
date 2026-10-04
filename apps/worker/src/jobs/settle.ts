import type { TaskRow } from '@intelligo/shared';
import type { JobDeps } from './deps';

/**
 * Follow-ups once a task leaves the worker's hands (done, failed, or waiting for approval):
 * auto-approval of allowed action kinds (Fase 5) and resuming a parent task (Fase 6).
 */
export async function afterTaskSettled(deps: JobDeps, task: TaskRow): Promise<void> {
  deps.log.debug({ taskId: task.id, status: task.status }, 'tugas selesai diproses');
}
