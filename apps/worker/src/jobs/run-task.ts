import Anthropic from '@anthropic-ai/sdk';
import { nextAfterRun, type AgentRow, type TaskRow } from '@intelligo/shared';
import { z } from 'zod';
import { runAgentLoop, type RunOutcome } from '../agent/runner';
import type { RevisionContext } from '../agent/prompts';
import type { Queryable } from '../lib/db';
import { LlmConfigError } from '../llm/types';
import type { RunTaskJob } from '../queues';
import { setAgentState } from '../state/agent-state';
import { loadAgent, loadManager, monthlyInputTokens } from '../state/agents';
import { logEvent } from '../state/events';
import { transitionTask } from '../state/tasks';
import type { JobDeps } from './deps';
import { claimResume, parseRunnerState, resumeParentIfReady, subtaskSummaries } from './delegation';
import { enqueueReview } from './enqueue';
import { afterTaskSettled } from './settle';

const idleLine = (agent: AgentRow): string => agent.idle_lines[0] ?? 'Siap menerima tugas';

export async function countProposedActions(q: Queryable, taskId: string): Promise<number> {
  const result = await q.query<{ n: number }>(
    `select count(*)::int as n from public.actions where task_id = $1 and status = 'proposed'`,
    [taskId],
  );
  return result.rows[0]?.n ?? 0;
}

async function latestRevision(q: Queryable, task: TaskRow): Promise<RevisionContext | undefined> {
  if (task.revision_count === 0) return undefined;
  const result = await q.query(
    `select notes from public.reviews where task_id = $1 and verdict = 'revise' order by created_at desc limit 1`,
    [task.id],
  );
  const notes = z.object({ notes: z.string() }).safeParse(result.rows[0]);
  return {
    round: task.revision_count,
    previousResult: task.result_text ?? '(kosong)',
    reviewerNotes: notes.success ? notes.data.notes : 'Perbaiki hasil sesuai rubrik.',
  };
}

class ResumeStateError extends Error {}

function describeError(error: unknown, timeoutMs: number): string {
  if (error instanceof LlmConfigError) return error.message;
  if (error instanceof ResumeStateError)
    return 'Percakapan Manager yang tersimpan tidak bisa dilanjutkan.';
  if (error instanceof Anthropic.APIUserAbortError)
    return `Melebihi batas waktu ${Math.round(timeoutMs / 60000)} menit per tugas.`;
  if (error instanceof Anthropic.RateLimitError)
    return 'Model sedang sibuk (rate limit) setelah 3 kali percobaan. Kirim ulang tugas nanti.';
  if (error instanceof Anthropic.APIError)
    return `Gagal memanggil model (HTTP ${error.status ?? '?'}) setelah percobaan ulang.`;
  return 'Terjadi kesalahan di worker saat mengerjakan tugas.';
}

/** Puts the agent back at its desk after a run, without a current task. */
async function releaseAgent(
  q: Queryable,
  task: TaskRow,
  agent: AgentRow,
  statusText: string,
): Promise<void> {
  await setAgentState(q, {
    orgId: task.org_id,
    agentId: agent.id,
    activity: 'working',
    statusText,
    currentTaskId: null,
    targetSpot: 'desk',
    event: { taskId: task.id, type: 'note', payload: { ambient: true } },
  });
}

/**
 * run-task (SPEC 9/10): claims the task, checks the agent's monthly budget, runs the tool-use
 * loop, and moves the task to review / approval / done.
 */
export async function handleRunTask(deps: JobDeps, job: RunTaskJob): Promise<void> {
  const { db, env, log } = deps;
  const task = job.resume
    ? await claimResume(db, job.taskId)
    : await transitionTask(db, job.taskId, ['queued', 'needs_revision'], 'in_progress', {
        started: true,
      });
  if (!task) return;
  const agentId = task.assignee_id ?? job.agentId;
  const agent = await loadAgent(db, agentId);

  const fail = async (error: string): Promise<void> => {
    const failed = await transitionTask(db, task.id, ['in_progress'], 'failed', {
      error,
      finished: true,
    });
    if (!failed) return;
    await logEvent(db, {
      orgId: task.org_id,
      taskId: task.id,
      agentId,
      type: 'failed',
      payload: { error },
    });
    if (agent) await releaseAgent(db, task, agent, `Gagal: ${task.title}`);
    await afterTaskSettled(deps, failed);
  };

  if (!agent || !agent.enabled) {
    await fail(`Agen ${agent?.name ?? agentId} sedang nonaktif.`);
    return;
  }
  if (agent.monthly_token_budget !== null) {
    const used = await monthlyInputTokens(db, agent.id);
    if (used >= agent.monthly_token_budget) {
      await fail(
        `Budget token bulanan ${agent.name} habis (${used.toLocaleString('id-ID')} dari ${agent.monthly_token_budget.toLocaleString('id-ID')} token input). Naikkan budget di halaman Agen atau tunggu bulan berikutnya.`,
      );
      return;
    }
  }

  await setAgentState(db, {
    orgId: task.org_id,
    agentId: agent.id,
    activity: 'working',
    statusText: `Mengerjakan: ${task.title}`,
    currentTaskId: task.id,
    targetSpot: 'desk',
    event: {
      taskId: task.id,
      type: 'started',
      payload: { revision: task.revision_count, resumed: job.resume === true },
    },
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.TASK_TIMEOUT_MS);
  let outcome: RunOutcome;
  try {
    const resume = job.resume ? parseRunnerState(task.result_json) : undefined;
    if (job.resume && !resume) throw new ResumeStateError();
    outcome = await runAgentLoop(deps, task, agent, {
      revision: resume ? undefined : await latestRevision(db, task),
      resume,
      subtasks: resume ? await subtaskSummaries(db, task.id) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    log.error(
      { taskId: task.id, err: error instanceof Error ? error.message : String(error) },
      'run-task gagal',
    );
    outcome = { kind: 'failed', error: describeError(error, env.TASK_TIMEOUT_MS) };
  } finally {
    clearTimeout(timer);
  }

  if (outcome.kind === 'cancelled') {
    await releaseAgent(db, task, agent, idleLine(agent));
    return;
  }
  if (outcome.kind === 'failed') {
    await fail(outcome.error);
    return;
  }
  if (outcome.kind === 'suspended') {
    const { waitingOn, state } = outcome;
    await db.tx(async (q) => {
      await q.query(
        `update public.tasks set result_json = coalesce(result_json, '{}'::jsonb)
           || jsonb_build_object('runner_state', $2::jsonb, 'waiting_on', $3::jsonb)
          where id = $1 and status = 'in_progress'`,
        [task.id, JSON.stringify(state), JSON.stringify(waitingOn)],
      );
      const names = await q.query<{ name: string }>(
        `select a.name from public.tasks t join public.agents a on a.id = t.assignee_id where t.id = any($1::uuid[])`,
        [waitingOn],
      );
      const who = names.rows.map((r) => r.name).join(', ');
      await logEvent(q, {
        orgId: task.org_id,
        taskId: task.id,
        agentId: agent.id,
        type: 'note',
        payload: { message: `Menunggu hasil subtugas dari ${who}`, waiting_on: waitingOn },
      });
      await releaseAgent(q, task, agent, `Menunggu hasil ${who}`);
    });
    // A subtask may already have finished while the run was suspending.
    await resumeParentIfReady(deps, task.id);
    return;
  }

  const proposed = await countProposedActions(db, task.id);
  const next = nextAfterRun(agent.is_manager, proposed > 0);
  const manager = await loadManager(db, task.org_id);
  const finished = await db.tx(async (q) => {
    const updated = await transitionTask(q, task.id, ['in_progress'], next, {
      resultText: outcome.result.content,
      resultJson: { summary: outcome.result.summary, format: outcome.result.format },
      finished: next === 'done',
    });
    if (!updated) return undefined;
    await q.query(
      `update public.tasks set result_json = result_json - 'runner_state' where id = $1`,
      [task.id],
    );
    await logEvent(q, {
      orgId: task.org_id,
      taskId: task.id,
      agentId: agent.id,
      type: 'draft',
      payload: { summary: outcome.result.summary, steps: outcome.steps, next },
    });
    const status =
      next === 'awaiting_review'
        ? `Menunggu review ${manager?.name ?? 'Manager'}`
        : `Selesai: ${task.title}`;
    await releaseAgent(q, task, agent, status);
    return updated;
  });
  if (!finished) return;
  if (next === 'awaiting_review') await enqueueReview(deps.boss, finished);
  else await afterTaskSettled(deps, finished);
}
