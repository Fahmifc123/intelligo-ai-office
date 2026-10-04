import type { TaskRow } from '@intelligo/shared';
import { autoApproveActions } from './actions';
import type { JobDeps } from './deps';

/**
 * Follow-ups once a task leaves an agent's hands: auto-approval of the action kinds the Owner
 * allowed (Fase 5). Parent tasks waiting on this one are resumed in Fase 6.
 */
export async function afterTaskSettled(deps: JobDeps, task: TaskRow): Promise<void> {
  if (task.status === 'awaiting_approval') {
    const approved = await autoApproveActions(deps, task.id, task.org_id);
    if (approved > 0) deps.log.info({ taskId: task.id, approved }, 'aksi disetujui otomatis');
  }
}
