import {
  estimateWalkMs,
  formatKnowledgeSnippet,
  nextAfterReview,
  officeLayout,
  seatOf,
  type AgentRow,
  type TaskRow,
} from '@intelligo/shared';
import { z } from 'zod';
import {
  buildReviewPrompt,
  REVIEW_JSON_SCHEMA,
  ReviewDecision,
  reviewSystem,
} from '../agent/prompts';
import { searchKnowledge } from '../knowledge/search';
import type { Queryable } from '../lib/db';
import { recordUsage } from '../llm/usage';
import type { TaskJob } from '../queues';
import { readAgentState, setAgentState } from '../state/agent-state';
import { loadAgent, loadManager } from '../state/agents';
import { logEvent } from '../state/events';
import { loadTask, transitionTask } from '../state/tasks';
import type { JobDeps } from './deps';
import { enqueueRun } from './enqueue';
import { afterTaskSettled } from './settle';

const ProposedAction = z.object({ kind: z.string(), payload: z.unknown() });

async function proposedActions(
  q: Queryable,
  taskId: string,
): Promise<{ kind: string; payload: unknown }[]> {
  const result = await q.query(
    `select kind, payload from public.actions where task_id = $1 and status = 'proposed'`,
    [taskId],
  );
  return result.rows.map((row) => ProposedAction.parse(row));
}

/** Besides the reviewed agent's desk (same offset as the client: seat + (0.75, 0.15)). */
function besideDesk(deskId: string): [number, number] {
  const seat = seatOf(officeLayout, deskId);
  return [seat[0] + 0.75, seat[1] + 0.15];
}

/** Writes the review, decides the next status, and re-queues revisions. */
async function applyReview(
  deps: JobDeps,
  task: TaskRow,
  agent: AgentRow,
  manager: AgentRow,
  decision: ReviewDecision,
  actionCount: number,
): Promise<void> {
  const outcome = nextAfterReview(decision.verdict, task.revision_count, actionCount > 0);
  const updated = await deps.db.tx(async (q) => {
    await q.query(
      `insert into public.reviews (org_id, task_id, reviewer_id, verdict, notes, scores) values ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        task.org_id,
        task.id,
        manager.id,
        decision.verdict,
        decision.notes,
        JSON.stringify(decision.scores),
      ],
    );
    const next = await transitionTask(q, task.id, ['awaiting_review'], outcome.status, {
      revisionCount: outcome.revisionCount,
      resultJson: outcome.manualCheck ? { manual_check: true } : undefined,
      finished: outcome.status === 'done',
    });
    await logEvent(q, {
      orgId: task.org_id,
      taskId: task.id,
      agentId: manager.id,
      type: 'review',
      payload: {
        verdict: decision.verdict,
        notes: decision.notes,
        scores: decision.scores,
        reviewed_agent_id: agent.id,
        next: outcome.status,
        manual_check: outcome.manualCheck,
      },
    });
    if (next && outcome.status === 'needs_revision') {
      await setAgentState(q, {
        orgId: task.org_id,
        agentId: agent.id,
        activity: 'working',
        statusText: `Revisi: ${task.title}`,
        targetSpot: 'desk',
        event: { taskId: task.id, type: 'note', payload: { ambient: true } },
      });
    }
    return next;
  });
  if (!updated) return;
  if (updated.status === 'needs_revision') await enqueueRun(deps.boss, updated, agent.id);
  else await afterTaskSettled(deps, updated);
}

/**
 * review-task (SPEC 9, Fase 3): the manager walks to the agent's desk, reviews with the fast
 * model, writes `reviews`, and walks back. The queue runs one review at a time.
 */
export async function handleReviewTask(deps: JobDeps, job: TaskJob): Promise<void> {
  const { db, llm, env, log } = deps;
  const task = await loadTask(db, job.taskId);
  if (!task || task.status !== 'awaiting_review' || !task.assignee_id) return;
  const agent = await loadAgent(db, task.assignee_id);
  const manager = await loadManager(db, task.org_id);
  if (!agent || !manager) return;

  const managerState = await readAgentState(db, task.org_id, manager.id);
  // A manager busy with its own task reviews from its desk instead of walking over.
  const walks = managerState?.current_task_id === null && managerState.activity !== 'offline';
  const walkMs = estimateWalkMs(seatOf(officeLayout, manager.desk_id), besideDesk(agent.desk_id));

  if (walks) {
    await setAgentState(db, {
      orgId: task.org_id,
      agentId: manager.id,
      activity: 'walking_to_review',
      statusText: `Menuju meja ${agent.name}`,
      targetSpot: `desk:${agent.id}`,
      event: { taskId: task.id, type: 'note', payload: { ambient: true } },
    });
    await deps.sleep(walkMs);
    await setAgentState(db, {
      orgId: task.org_id,
      agentId: manager.id,
      activity: 'reviewing',
      statusText: `Review hasil ${agent.name}`,
      targetSpot: `desk:${agent.id}`,
      event: { taskId: task.id, type: 'note', payload: { ambient: true } },
    });
  }

  const actions = await proposedActions(db, task.id);
  const knowledge = await searchKnowledge(
    db,
    task.org_id,
    `${task.title} ${task.instructions ?? ''} ${task.result_text ?? ''}`.slice(0, 2000),
  );
  let decision: ReviewDecision;
  try {
    const result = await llm.json({
      model: env.MODEL_FAST,
      system: reviewSystem(manager.name),
      prompt: buildReviewPrompt({
        task,
        agent,
        result: task.result_text ?? '(kosong)',
        proposedActions: actions,
        knowledge: knowledge.map((doc) => formatKnowledgeSnippet(doc)),
      }),
      jsonSchema: REVIEW_JSON_SCHEMA,
      schema: ReviewDecision,
      maxTokens: 1024,
    });
    for (const message of result.messages) {
      await recordUsage(
        db,
        { orgId: task.org_id, agentId: manager.id, taskId: task.id, purpose: 'review' },
        message,
        deps.prices,
        log,
      );
    }
    decision = result.value ?? {
      verdict: 'revise',
      notes:
        'Review otomatis tidak menghasilkan penilaian yang valid. Periksa ulang hasil sesuai rubrik.',
      scores: { accuracy: 3, tone: 3, completeness: 3 },
    };
  } catch (error) {
    log.warn(
      { taskId: task.id, err: error instanceof Error ? error.message : String(error) },
      'review gagal',
    );
    decision = {
      verdict: 'revise',
      notes: 'Review otomatis gagal dijalankan. Periksa ulang hasil sebelum dipakai.',
      scores: { accuracy: 3, tone: 3, completeness: 3 },
    };
  }

  await applyReview(deps, task, agent, manager, decision, actions.length);

  if (walks) {
    await setAgentState(db, {
      orgId: task.org_id,
      agentId: manager.id,
      activity: 'working',
      statusText: 'Balik ke meja',
      currentTaskId: null,
      targetSpot: 'desk',
      event: { taskId: task.id, type: 'note', payload: { ambient: true } },
    });
  }
}
