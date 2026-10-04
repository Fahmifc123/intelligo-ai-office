import { TASK_STATUS_LABELS, TOOL_LABELS, type TaskEventRow } from '@intelligo/shared';
import { z } from 'zod';
import type { AgentSummary, OfficeSnapshot } from './types';

const Payload = z.record(z.string(), z.unknown());
const str = (value: unknown): string => (typeof value === 'string' ? value : '');

export const isAmbient = (event: TaskEventRow): boolean => event.payload.ambient === true;

/**
 * One Indonesian sentence for the activity feed. Returns null for events that only belong
 * in the task timeline (tool results, ambient office moves).
 */
export function describeEvent(
  event: TaskEventRow,
  snapshot: Pick<OfficeSnapshot, 'agents' | 'tasks'>,
): string | null {
  if (isAmbient(event)) return null;
  const agents = new Map<string, AgentSummary>(snapshot.agents.map((a) => [a.id, a]));
  const name = (id: unknown): string =>
    typeof id === 'string' ? (agents.get(id)?.name ?? id) : 'Sistem';
  const actor = name(event.agent_id);
  const task = event.task_id ? snapshot.tasks[event.task_id] : undefined;
  const title = task ? `"${task.title}"` : 'tugas';
  const p = Payload.parse(event.payload);

  switch (event.type) {
    case 'routed': {
      const reason = str(p.reason);
      return `${actor} menugaskan ${title} ke ${name(p.assignee_id)}${reason ? ` (${reason})` : ''}.`;
    }
    case 'started':
      return typeof p.revision === 'number' && p.revision > 0
        ? `${actor} mulai revisi ke-${p.revision} untuk ${title}.`
        : `${actor} mulai mengerjakan ${title}.`;
    case 'tool_call':
      return `${actor} ${TOOL_LABELS[str(p.name)] ?? str(p.name)}.`;
    case 'tool_result':
      return null;
    case 'draft':
      return `${actor} menyerahkan hasil ${title}.`;
    case 'review': {
      const verdict = p.verdict === 'approved' ? 'menyetujui' : 'minta revisi untuk';
      return `${actor} ${verdict} ${title} dari ${name(p.reviewed_agent_id)}: ${str(p.notes)}`;
    }
    case 'approval': {
      const decision = str(p.decision);
      const label =
        decision === 'approved'
          ? 'menyetujui'
          : decision === 'edited'
            ? 'mengedit lalu menyetujui'
            : 'menolak';
      return `${str(p.actor_email) || 'Owner'} ${label} aksi ${str(p.kind)} untuk ${title}.`;
    }
    case 'executed':
      return p.dry_run === true
        ? `Aksi ${str(p.kind)} untuk ${title} dijalankan dalam mode dry-run (tidak terkirim).`
        : `Aksi ${str(p.kind)} untuk ${title} berhasil dieksekusi.`;
    case 'failed':
      return `${title} gagal: ${str(p.error)}`;
    case 'note': {
      const message = str(p.message);
      if (message) return task ? `${message}: ${title}.` : message;
      const status = str(p.status);
      return status
        ? `${title} ${TASK_STATUS_LABELS[status as keyof typeof TASK_STATUS_LABELS] ?? status}.`
        : null;
    }
  }
}
