import { agentsConfig, AMBIENT_LINES, type AgentActivity } from '@intelligo/shared';
import {
  ActionRow,
  AgentStateRow,
  LlmUsageRow,
  ReviewRow,
  SettingsRow,
  TaskEventRow,
  TaskRow,
  type AgentSummary,
  type OfficeSnapshot,
} from './types';

/**
 * Demo data for preview mode (no database). Facts match the sample knowledge base
 * (knowledge.seed.ts), so the preview tells the same story as a local install.
 */

const ORG = '00000000-0000-4000-8000-00000000d000';
const REQUESTER = '00000000-0000-4000-8000-00000000d001';
const TASK_CAPTION = '00000000-0000-4000-8000-00000000d101';
const TASK_WHATSAPP = '00000000-0000-4000-8000-00000000d102';
const TASK_LEADS = '00000000-0000-4000-8000-00000000d103';

const minutesAgo = (now: Date, minutes: number): Date => new Date(now.getTime() - minutes * 60_000);

export function buildDemoSnapshot(now: Date): OfficeSnapshot {
  const agents: AgentSummary[] = agentsConfig.map((agent) => ({
    id: agent.id,
    name: agent.name,
    role: agent.role,
    focus: agent.focus,
    desk_id: agent.deskId,
    appearance: agent.appearance,
    is_manager: agent.isManager,
    enabled: true,
    tools: [...agent.tools],
  }));

  const states = Object.fromEntries(
    agentsConfig.map((agent) => {
      const onTask = agent.id === 'leads';
      const row = AgentStateRow.parse({
        agent_id: agent.id,
        org_id: ORG,
        activity: 'working',
        status_text: onTask ? 'Menilai leads minggu ini' : (agent.idleLines[0] ?? 'Bekerja'),
        current_task_id: onTask ? TASK_LEADS : null,
        target_spot: 'desk',
        created_at: now,
        updated_at: now,
      });
      return [agent.id, row];
    }),
  );

  const task = (fields: {
    id: string;
    title: string;
    assignee: string;
    status: TaskRow['status'];
    createdMinutesAgo: number;
    finishedMinutesAgo?: number;
    result?: string;
  }): TaskRow =>
    TaskRow.parse({
      id: fields.id,
      org_id: ORG,
      title: fields.title,
      instructions: fields.title,
      requested_by: REQUESTER,
      assignee_id: fields.assignee,
      assign_mode: 'auto',
      parent_task_id: null,
      status: fields.status,
      priority: 2,
      result_text: fields.result ?? null,
      result_json: null,
      revision_count: 0,
      error: null,
      created_at: minutesAgo(now, fields.createdMinutesAgo),
      started_at: minutesAgo(now, fields.createdMinutesAgo - 1),
      finished_at:
        fields.finishedMinutesAgo === undefined ? null : minutesAgo(now, fields.finishedMinutesAgo),
    });

  const whatsappReply =
    'Halo Kak, terima kasih sudah menghubungi Intelligo ID. Bootcamp Data Science Batch 21 mulai 3 November 2026. Kalau berkenan, saya kirimkan link pendaftarannya ya.';
  const tasks = [
    task({
      id: TASK_CAPTION,
      title: 'Buat caption promo Bootcamp Batch 21',
      assignee: 'writer',
      status: 'done',
      createdMinutesAgo: 42,
      finishedMinutesAgo: 38,
      result:
        'Mau pindah karier ke data tanpa mulai sendirian?\n\nBelajar bareng mentor praktisi, kerjakan project nyata, dan bangun portofolio. Investasi Rp 7.500.000, mulai 3 November 2026.\n\nDaftar sekarang, kuota terbatas.',
    }),
    task({
      id: TASK_WHATSAPP,
      title: 'Balas calon peserta yang tanya jadwal Batch 21',
      assignee: 'cs',
      status: 'awaiting_approval',
      createdMinutesAgo: 20,
      result: whatsappReply,
    }),
    task({
      id: TASK_LEADS,
      title: 'Rekap leads panas minggu ini',
      assignee: 'leads',
      status: 'in_progress',
      createdMinutesAgo: 6,
    }),
  ];

  const event = (
    id: number,
    taskId: string,
    agentId: string,
    type: TaskEventRow['type'],
    payload: Record<string, unknown>,
    minutes: number,
  ): TaskEventRow =>
    TaskEventRow.parse({
      id,
      org_id: ORG,
      task_id: taskId,
      agent_id: agentId,
      type,
      payload,
      created_at: minutesAgo(now, minutes),
    });

  // Newest first, like the live feed.
  const events = [
    event(9, TASK_LEADS, 'leads', 'tool_call', { name: 'read_sheet' }, 5),
    event(8, TASK_LEADS, 'leads', 'started', {}, 6),
    event(7, TASK_LEADS, 'manager', 'routed', { assignee_id: 'leads' }, 6),
    event(
      6,
      TASK_WHATSAPP,
      'manager',
      'review',
      reviewPayload('cs', 'Jawaban sesuai knowledge base.'),
      17,
    ),
    event(5, TASK_WHATSAPP, 'cs', 'draft', {}, 18),
    event(4, TASK_WHATSAPP, 'manager', 'routed', { assignee_id: 'cs' }, 20),
    event(
      3,
      TASK_CAPTION,
      'manager',
      'review',
      reviewPayload('writer', 'Isi akurat, nada sesuai.'),
      38,
    ),
    event(2, TASK_CAPTION, 'writer', 'draft', {}, 39),
    event(1, TASK_CAPTION, 'manager', 'routed', { assignee_id: 'writer' }, 42),
  ];

  const review = (taskId: string, notes: string, minutes: number): ReviewRow =>
    ReviewRow.parse({
      id: taskId.replace(/d1(\d\d)$/, 'd2$1'),
      org_id: ORG,
      task_id: taskId,
      reviewer_id: 'manager',
      verdict: 'approved',
      notes,
      scores: { accuracy: 5, tone: 4, completeness: 4 },
      created_at: minutesAgo(now, minutes),
    });

  const action = ActionRow.parse({
    id: '00000000-0000-4000-8000-00000000d301',
    org_id: ORG,
    task_id: TASK_WHATSAPP,
    agent_id: 'cs',
    kind: 'send_whatsapp',
    payload: { to: '6281200000000', message: whatsappReply },
    status: 'proposed',
    approved_by: null,
    approved_at: null,
    executed_at: null,
    response: null,
    created_at: minutesAgo(now, 17),
  });

  const usage = (id: number, agentId: string, taskId: string, cost: number): LlmUsageRow =>
    LlmUsageRow.parse({
      id,
      org_id: ORG,
      agent_id: agentId,
      task_id: taskId,
      purpose: 'run',
      model: 'demo',
      input_tokens: 2400,
      output_tokens: 260,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      cost_usd: cost,
      created_at: minutesAgo(now, 30),
    });

  return {
    agents,
    states,
    settings: SettingsRow.parse({
      org_id: ORG,
      auto_approve_kinds: [],
      dry_run: true,
      usd_to_idr: 16000,
      meeting_until: null,
      break_mode: false,
      created_at: now,
      updated_at: now,
    }),
    tasks: Object.fromEntries(tasks.map((t) => [t.id, t])),
    events,
    actions: { [action.id]: action },
    reviews: {
      [TASK_CAPTION]: review(TASK_CAPTION, 'Isi akurat, nada sesuai, siap dipakai.', 38),
      [TASK_WHATSAPP]: review(TASK_WHATSAPP, 'Jawaban sesuai knowledge base.', 17),
    },
    usageToday: [
      usage(1, 'writer', TASK_CAPTION, 0.0061),
      usage(2, 'cs', TASK_WHATSAPP, 0.0048),
      usage(3, 'leads', TASK_LEADS, 0.0022),
    ],
  };
}

function reviewPayload(reviewedAgentId: string, notes: string): Record<string, unknown> {
  return { verdict: 'approved', reviewed_agent_id: reviewedAgentId, notes };
}

export type Rng = () => number;

/** Chance that a free agent changes what it is doing on one preview tick. */
export const DEMO_CHANGE_PROBABILITY = 0.3;

const pick = <T>(items: readonly T[], rng: Rng, fallback: T): T =>
  items[Math.floor(rng() * items.length)] ?? fallback;

/**
 * Ambient office life for preview mode, computed in the browser (the live app gets the same
 * behaviour from the worker's idle-tick): mostly desk work, sometimes the pantry or a short walk.
 * Agents on a task stay at their desk.
 */
export function planDemoTick(snapshot: OfficeSnapshot, rng: Rng, now: Date): AgentStateRow[] {
  const changes: AgentStateRow[] = [];
  for (const agent of agentsConfig) {
    const state = snapshot.states[agent.id];
    if (!state || state.current_task_id !== null) continue;
    if (rng() >= DEMO_CHANGE_PROBABILITY) continue;

    // Away from the desk: walk back. At the desk: 60 % keep working, 20 % pantry, 20 % walk.
    const roll = state.activity === 'working' ? rng() : 0;
    let activity: AgentActivity;
    let statusText: string;
    let targetSpot: string;
    if (roll >= 0.8) {
      activity = 'idle';
      statusText = pick(AMBIENT_LINES.wander, rng, AMBIENT_LINES.backToDesk);
      targetSpot = rng() < 0.5 ? 'lounge' : 'wander';
    } else if (roll >= 0.6) {
      activity = 'break';
      statusText = pick(AMBIENT_LINES.break, rng, AMBIENT_LINES.backToDesk);
      targetSpot = 'pantry';
    } else {
      activity = 'working';
      statusText = pick(agent.idleLines, rng, AMBIENT_LINES.backToDesk);
      targetSpot = 'desk';
    }
    changes.push({
      ...state,
      activity,
      status_text: statusText,
      target_spot: targetSpot,
      updated_at: now,
    });
  }
  return changes;
}
