import { MANAGER_AGENT_ID } from '@intelligo/shared';
import {
  buildRouterPrompt,
  ROUTER_JSON_SCHEMA,
  ROUTER_SYSTEM,
  RouterDecision,
} from '../agent/prompts';
import { recordUsage } from '../llm/usage';
import { readAgentState, setAgentState } from '../state/agent-state';
import { loadAgents } from '../state/agents';
import { logEvent } from '../state/events';
import { transitionTask } from '../state/tasks';
import type { TaskJob } from '../queues';
import type { JobDeps } from './deps';
import { enqueueRun } from './enqueue';

/**
 * route-task (SPEC 9): the fast model picks one agent for an "Otomatis" task.
 * Output is Zod-validated with one retry; anything unusable falls back to the manager.
 */
export async function handleRouteTask(deps: JobDeps, job: TaskJob): Promise<void> {
  const { db, llm, env, log } = deps;
  const task = await transitionTask(db, job.taskId, ['queued'], 'routing');
  if (!task) return;

  const agents = (await loadAgents(db, task.org_id)).filter((a) => a.enabled);
  const manager = agents.find((a) => a.is_manager);
  const managerState = manager ? await readAgentState(db, task.org_id, manager.id) : undefined;
  if (
    manager &&
    managerState &&
    managerState.current_task_id === null &&
    managerState.activity === 'working'
  ) {
    await setAgentState(db, {
      orgId: task.org_id,
      agentId: manager.id,
      activity: 'working',
      statusText: 'Membagi tugas baru',
      targetSpot: 'desk',
      event: { taskId: task.id, type: 'note', payload: { ambient: true } },
    });
  }

  let decision: RouterDecision | null = null;
  let fallbackReason = '';
  try {
    const result = await llm.json({
      model: env.MODEL_FAST,
      system: ROUTER_SYSTEM,
      prompt: buildRouterPrompt(task, agents),
      jsonSchema: ROUTER_JSON_SCHEMA,
      schema: RouterDecision,
      maxTokens: 512,
    });
    for (const message of result.messages) {
      await recordUsage(
        db,
        { orgId: task.org_id, agentId: manager?.id ?? null, taskId: task.id, purpose: 'route' },
        message,
        deps.prices,
        log,
      );
    }
    if (result.value && agents.some((a) => a.id === result.value?.agent_id))
      decision = result.value;
    else
      fallbackReason = result.value
        ? `agen "${result.value.agent_id}" tidak dikenal`
        : `output tidak valid (${result.error ?? '-'})`;
  } catch (error) {
    fallbackReason = `router gagal (${error instanceof Error ? error.message : String(error)})`;
    log.warn({ taskId: task.id, err: fallbackReason }, 'routing jatuh ke manager');
  }

  const assigneeId = decision?.agent_id ?? manager?.id ?? MANAGER_AGENT_ID;
  const reason = decision?.reason ?? `Dialihkan ke Manager: ${fallbackReason}`;
  const routed = await transitionTask(db, task.id, ['routing'], 'queued', { assigneeId });
  if (!routed) return;
  await logEvent(db, {
    orgId: task.org_id,
    taskId: task.id,
    agentId: manager?.id ?? null,
    type: 'routed',
    payload: { assignee_id: assigneeId, reason, fallback: decision === null },
  });
  await enqueueRun(deps.boss, routed, assigneeId);
}
