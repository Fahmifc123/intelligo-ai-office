import type { TaskStatus } from './schemas';

/** Task lifecycle (SPEC section 9). The worker refuses any transition not listed here. */
export const TASK_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  queued: ['routing', 'in_progress', 'failed', 'cancelled'],
  routing: ['queued', 'failed', 'cancelled'],
  // queued: requeued after a worker restart.
  in_progress: ['awaiting_review', 'awaiting_approval', 'done', 'failed', 'cancelled', 'queued'],
  awaiting_review: ['done', 'needs_revision', 'awaiting_approval', 'failed', 'cancelled'],
  needs_revision: ['in_progress', 'failed', 'cancelled'],
  awaiting_approval: ['executing', 'done', 'failed', 'cancelled'],
  executing: ['done', 'failed'],
  done: [],
  failed: [],
  cancelled: [],
};

export const TERMINAL_STATUSES: readonly TaskStatus[] = ['done', 'failed', 'cancelled'];
export const ACTIVE_STATUSES: readonly TaskStatus[] = [
  'queued',
  'routing',
  'in_progress',
  'awaiting_review',
  'needs_revision',
];

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

export function isTerminal(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** SPEC: at most 2 revision rounds, then done with a "perlu cek manual" flag. */
export const MAX_REVISIONS = 2;

export interface ReviewOutcome {
  status: TaskStatus;
  revisionCount: number;
  manualCheck: boolean;
}

export function nextAfterReview(
  verdict: 'approved' | 'revise',
  revisionCount: number,
  hasProposedActions: boolean,
): ReviewOutcome {
  if (verdict === 'approved') {
    return {
      status: hasProposedActions ? 'awaiting_approval' : 'done',
      revisionCount,
      manualCheck: false,
    };
  }
  if (revisionCount < MAX_REVISIONS) {
    return { status: 'needs_revision', revisionCount: revisionCount + 1, manualCheck: false };
  }
  return {
    status: hasProposedActions ? 'awaiting_approval' : 'done',
    revisionCount,
    manualCheck: true,
  };
}

/** After the runner submits: manager tasks skip review (the manager never reviews itself). */
export function nextAfterRun(isManagerTask: boolean, hasProposedActions: boolean): TaskStatus {
  if (!isManagerTask) return 'awaiting_review';
  return hasProposedActions ? 'awaiting_approval' : 'done';
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  queued: 'Antre',
  routing: 'Dibagi',
  in_progress: 'Dikerjakan',
  awaiting_review: 'Menunggu review',
  needs_revision: 'Revisi',
  awaiting_approval: 'Menunggu approval',
  executing: 'Dieksekusi',
  done: 'Selesai',
  failed: 'Gagal',
  cancelled: 'Dibatalkan',
};

/** Human labels for tools in the activity feed and task timeline. */
export const TOOL_LABELS: Record<string, string> = {
  submit_result: 'menyerahkan hasil',
  search_knowledge: 'mencari di knowledge base',
  save_draft: 'menyimpan draft',
  list_tasks: 'mengecek papan tugas',
  delegate_task: 'mendelegasikan tugas',
  read_sheet: 'membaca Google Sheet',
  score_leads: 'menilai leads',
  run_analysis: 'menganalisis data',
  create_google_doc: 'membuat Google Doc',
  propose_whatsapp_reply: 'mengusulkan balasan WhatsApp',
  propose_whatsapp_broadcast: 'mengusulkan broadcast WhatsApp',
  propose_email: 'mengusulkan email',
  propose_invoice: 'mengusulkan invoice',
  propose_schedule_post: 'mengusulkan jadwal posting',
};

/** Rate limit for sending tasks (SPEC Fase 7: 20 per hour per user). */
export const TASKS_PER_HOUR_LIMIT = 20;

/** First line of the composer text, used as the task title. */
export function deriveTitle(text: string, max = 120): string {
  const firstLine = text.trim().split('\n')[0]?.trim() ?? '';
  return firstLine.length > max ? `${firstLine.slice(0, max - 1).trimEnd()}…` : firstLine;
}
