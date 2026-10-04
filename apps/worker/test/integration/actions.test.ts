import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handleActionDecision, handleExecuteAction } from '../../src/jobs/actions';
import { handleReviewTask } from '../../src/jobs/review-task';
import { handleRunTask } from '../../src/jobs/run-task';
import type { LlmMessage } from '../../src/llm/types';
import { QUEUES } from '../../src/queues';
import { loadTask } from '../../src/state/tasks';
import { createTestDatabase, TEST_ORG_ID, type TestDatabase } from '../helpers/db';
import { hasTestDatabase } from '../helpers/env';
import { FixtureLlm, loadFixture } from '../helpers/fixture-llm';
import { startMockN8n, type MockN8n } from '../helpers/mock-n8n';
import { insertTask, jobDeps, queuedJobs, startBoss, testEnv } from '../helpers/worker';

const SECRET = 'rahasia-uji';
const USER = '33333333-3333-4333-8333-333333333333';
const approve = JSON.stringify({
  verdict: 'approved',
  notes: 'Nomor valid, isi sesuai.',
  scores: { accuracy: 5, tone: 5, completeness: 5 },
});

describe.skipIf(!hasTestDatabase)('external actions and approval (database, mock n8n)', () => {
  let t: TestDatabase;
  let boss: PgBoss;
  let n8n: MockN8n;

  beforeAll(async () => {
    t = await createTestDatabase();
    boss = await startBoss(t.url);
    n8n = await startMockN8n(SECRET);
    await t.db.query(`insert into auth.users (id, email) values ($1, 'owner@uji.test')`, [USER]);
    await t.db.query(
      `insert into public.org_members (org_id, email, role) values ($1, 'owner@uji.test', 'owner')`,
      [TEST_ORG_ID],
    );
  });
  afterAll(async () => {
    await n8n?.close();
    await boss?.stop({ graceful: false, close: true });
    await t?.drop();
  });
  beforeEach(async () => {
    n8n.calls.length = 0;
    n8n.respondWith(200);
    await t.db.query(`delete from pgboss.job`);
    await t.db.query(`update public.agent_states set current_task_id = null`);
    await t.db.query(`delete from public.tasks`);
    await t.db.query(`update public.settings set dry_run = false, auto_approve_kinds = '{}'`);
  });

  const live = () =>
    testEnv(t.url, { DRY_RUN: 'false', N8N_BASE_URL: n8n.url, N8N_WEBHOOK_SECRET: SECRET });

  /** Runs the CS fixture and the review: the task ends waiting for approval. */
  const proposeViaCs = async (): Promise<{ taskId: string; actionId: string }> => {
    const taskId = await insertTask(t, {
      title: 'Balas calon peserta 081234567890 yang tanya jadwal Batch 21',
      assignee: 'cs',
    });
    await handleRunTask(
      jobDeps(t, boss, new FixtureLlm(loadFixture<LlmMessage[]>('run-cs-whatsapp.json')), live()),
      { taskId, agentId: 'cs' },
    );
    expect((await loadTask(t.db, taskId))?.status).toBe('awaiting_review');
    await handleReviewTask(jobDeps(t, boss, new FixtureLlm([], [approve]), live()), { taskId });
    const action = await t.db.query<{ id: string }>(
      `select id::text from public.actions where task_id = $1`,
      [taskId],
    );
    return { taskId, actionId: action.rows[0]?.id ?? '' };
  };

  const runQueuedExecutions = async (): Promise<void> => {
    for (const job of await queuedJobs(t, QUEUES.executeAction)) {
      await handleExecuteAction(jobDeps(t, boss, new FixtureLlm(), live()), {
        actionId: String(job.data.actionId),
      });
    }
  };

  it('proposes a normalized WhatsApp action and waits for approval; nothing is sent without it', async () => {
    const { taskId, actionId } = await proposeViaCs();
    expect((await loadTask(t.db, taskId))?.status).toBe('awaiting_approval');
    const action = await t.db.query(
      `select kind, status, payload from public.actions where id = $1`,
      [actionId],
    );
    expect(action.rows[0]).toMatchObject({
      kind: 'send_whatsapp',
      status: 'proposed',
      payload: { to: '6281234567890' },
    });
    await runQueuedExecutions();
    expect(await queuedJobs(t, QUEUES.executeAction)).toEqual([]);
    expect(n8n.calls).toHaveLength(0);
  });

  it('after approval with DRY_RUN=false, n8n receives a payload with a valid signature', async () => {
    const { taskId, actionId } = await proposeViaCs();
    await t.db.query(
      `update public.actions set status = 'approved', approved_by = $2, approved_at = now() where id = $1`,
      [actionId, USER],
    );
    await handleActionDecision(jobDeps(t, boss, new FixtureLlm(), live()), actionId);
    await runQueuedExecutions();

    expect(n8n.calls).toHaveLength(1);
    const call = n8n.calls[0];
    expect(call?.path).toBe('/webhook/wa-send');
    expect(call?.signatureValid).toBe(true);
    expect(call?.json).toMatchObject({
      action_id: actionId,
      task_id: taskId,
      kind: 'send_whatsapp',
      payload: { to: '6281234567890' },
    });

    expect((await loadTask(t.db, taskId))?.status).toBe('done');
    const events = await t.db.query<{ type: string; payload: Record<string, unknown> }>(
      `select type, payload from public.task_events where task_id = $1 and type in ('approval', 'executed') order by id`,
      [taskId],
    );
    expect(events.rows.map((e) => e.type)).toEqual(['approval', 'executed']);
    expect(events.rows[0]?.payload).toMatchObject({
      decision: 'approved',
      actor_email: 'owner@uji.test',
      auto: false,
    });
  });

  it('records an edit as an approval with a diff', async () => {
    const { taskId, actionId } = await proposeViaCs();
    await t.db.query(
      `update public.actions set payload = jsonb_set(payload, '{message}', '"Halo Kak, versi edit Owner."'), status = 'approved', approved_by = $2, approved_at = now()
        where id = $1`,
      [actionId, USER],
    );
    await handleActionDecision(jobDeps(t, boss, new FixtureLlm(), live()), actionId);
    const event = await t.db.query<{ payload: Record<string, unknown> }>(
      `select payload from public.task_events where task_id = $1 and type = 'approval'`,
      [taskId],
    );
    expect(event.rows[0]?.payload).toMatchObject({
      decision: 'edited',
      diff: { message: { after: 'Halo Kak, versi edit Owner.' } },
    });
  });

  it('a rejected action is never sent and the task closes', async () => {
    const { taskId, actionId } = await proposeViaCs();
    await t.db.query(
      `update public.actions set status = 'rejected', rejected_by = $2, rejected_at = now() where id = $1`,
      [actionId, USER],
    );
    await handleActionDecision(jobDeps(t, boss, new FixtureLlm(), live()), actionId);
    await runQueuedExecutions();
    expect(n8n.calls).toHaveLength(0);
    expect((await loadTask(t.db, taskId))?.status).toBe('done');
  });

  it('a non-2xx reply from n8n fails the action and the task', async () => {
    n8n.respondWith(500, { message: 'provider down' });
    const { taskId, actionId } = await proposeViaCs();
    await t.db.query(
      `update public.actions set status = 'approved', approved_by = $2, approved_at = now() where id = $1`,
      [actionId, USER],
    );
    await handleActionDecision(jobDeps(t, boss, new FixtureLlm(), live()), actionId);
    await runQueuedExecutions();
    const action = await t.db.query(
      `select status, error, response from public.actions where id = $1`,
      [actionId],
    );
    expect(action.rows[0]).toMatchObject({
      status: 'failed',
      error: 'n8n membalas HTTP 500',
      response: { message: 'provider down' },
    });
    const task = await loadTask(t.db, taskId);
    expect(task?.status).toBe('failed');
    expect(task?.error).toContain('Balasan WhatsApp');
  });

  it('dry-run logs instead of calling n8n', async () => {
    await t.db.query(`update public.settings set dry_run = true`);
    const { taskId, actionId } = await proposeViaCs();
    await t.db.query(
      `update public.actions set status = 'approved', approved_by = $2, approved_at = now() where id = $1`,
      [actionId, USER],
    );
    await handleActionDecision(jobDeps(t, boss, new FixtureLlm(), live()), actionId);
    await runQueuedExecutions();
    expect(n8n.calls).toHaveLength(0);
    const action = await t.db.query(`select status, response from public.actions where id = $1`, [
      actionId,
    ]);
    expect(action.rows[0]).toMatchObject({
      status: 'executed',
      response: { dry_run: true, workflow: 'wa-send' },
    });
    expect((await loadTask(t.db, taskId))?.status).toBe('done');
  });

  it('auto-approves allowed kinds after review, but never broadcasts', async () => {
    await t.db.query(`update public.settings set auto_approve_kinds = '{send_whatsapp}'`);
    const { taskId, actionId } = await proposeViaCs();
    const status = await t.db.query(`select status from public.actions where id = $1`, [actionId]);
    expect(status.rows[0]?.status).toBe('approved');
    await runQueuedExecutions();
    expect(n8n.calls).toHaveLength(1);
    expect((await loadTask(t.db, taskId))?.status).toBe('done');
    await expect(
      t.db.query(`update public.settings set auto_approve_kinds = '{send_whatsapp_bulk}'`),
    ).rejects.toThrow(/settings_no_auto_broadcast/);
  });
});
