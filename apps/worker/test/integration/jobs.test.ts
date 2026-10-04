import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handleReviewTask } from '../../src/jobs/review-task';
import { handleRouteTask } from '../../src/jobs/route-task';
import { handleRunTask } from '../../src/jobs/run-task';
import type { LlmMessage } from '../../src/llm/types';
import { QUEUES } from '../../src/queues';
import { readAgentState } from '../../src/state/agent-state';
import { loadTask } from '../../src/state/tasks';
import { createTestDatabase, TEST_ORG_ID, type TestDatabase } from '../helpers/db';
import { hasTestDatabase } from '../helpers/env';
import { FixtureLlm, loadFixture } from '../helpers/fixture-llm';
import { insertTask, jobDeps, queuedJobs, startBoss, testEnv } from '../helpers/worker';

const review = (verdict: 'approved' | 'revise', notes: string): string =>
  JSON.stringify({
    verdict,
    notes,
    scores: { accuracy: verdict === 'approved' ? 5 : 2, tone: 4, completeness: 4 },
  });

describe.skipIf(!hasTestDatabase)('task jobs (database, fixture LLM)', () => {
  let t: TestDatabase;
  let boss: PgBoss;

  beforeAll(async () => {
    t = await createTestDatabase();
    boss = await startBoss(t.url);
  });
  afterAll(async () => {
    await boss?.stop({ graceful: false, close: true });
    await t?.drop();
  });
  beforeEach(async () => {
    await t.db.query(`delete from pgboss.job`);
    await t.db.query(
      `update public.agent_states set current_task_id = null, activity = 'working', target_spot = 'desk'`,
    );
    await t.db.query(`delete from public.tasks`);
    await t.db.query(`update public.agents set enabled = true, monthly_token_budget = 2000000`);
  });

  it('routes an "Otomatis" task with the fast model and queues it for the chosen agent', async () => {
    const id = await insertTask(t, { title: 'Buat caption promo Bootcamp Batch 21' });
    const llm = new FixtureLlm([], [JSON.stringify(loadFixture('router-writer.json'))]);
    await handleRouteTask(jobDeps(t, boss, llm), { taskId: id });

    const task = await loadTask(t.db, id);
    expect(task?.status).toBe('queued');
    expect(task?.assignee_id).toBe('writer');
    const jobs = await queuedJobs(t, QUEUES.runTask);
    expect(jobs).toEqual([{ data: { taskId: id, agentId: 'writer' }, singleton_key: 'writer' }]);
    const usage = await t.db.query(
      `select purpose, agent_id from public.llm_usage where task_id = $1`,
      [id],
    );
    expect(usage.rows).toEqual([{ purpose: 'route', agent_id: 'manager' }]);
    const routed = await t.db.query(
      `select payload from public.task_events where task_id = $1 and type = 'routed'`,
      [id],
    );
    expect(routed.rows[0]?.payload).toMatchObject({ assignee_id: 'writer', fallback: false });
  });

  it('falls back to the manager when the router output is invalid twice', async () => {
    const id = await insertTask(t, { title: 'Sesuatu yang ambigu' });
    const llm = new FixtureLlm([], ['{"agent": 1}', '{"agent_id": "tidak-ada", "reason": "x"}']);
    await handleRouteTask(jobDeps(t, boss, llm), { taskId: id });
    const task = await loadTask(t.db, id);
    expect(task?.assignee_id).toBe('manager');
    const routed = await t.db.query(
      `select payload from public.task_events where task_id = $1 and type = 'routed'`,
      [id],
    );
    expect(routed.rows[0]?.payload).toMatchObject({ assignee_id: 'manager', fallback: true });
  });

  it('runs the tool-use loop, records usage and cost, and waits for review', async () => {
    const id = await insertTask(t, {
      title: 'Buat caption promo Bootcamp Batch 21',
      assignee: 'writer',
    });
    const llm = new FixtureLlm(loadFixture<LlmMessage[]>('run-writer-caption.json'));
    const env = testEnv(t.url, { MODEL_WORK: 'claude-sonnet-5-5' });
    await t.db.query(`update public.agents set model = 'claude-sonnet-5-5' where id = 'writer'`);
    await handleRunTask({ ...jobDeps(t, boss, llm, env) }, { taskId: id, agentId: 'writer' });

    const task = await loadTask(t.db, id);
    expect(task?.status).toBe('awaiting_review');
    expect(task?.result_text).toContain('Rp 7.500.000');
    expect(task?.result_json).toMatchObject({
      summary: 'Caption promo Batch 21 untuk Instagram.',
      format: 'markdown',
    });
    expect(task?.started_at).toBeInstanceOf(Date);

    // Second request carries the assistant turn (thinking block unchanged) and the tool result.
    expect(llm.requests).toHaveLength(2);
    const second = llm.requests[1];
    expect(second?.messages).toHaveLength(3);
    expect(JSON.stringify(second?.messages[1])).toContain('sig_fixture_1');
    expect(JSON.stringify(second?.messages[2])).toContain('Bootcamp Data Science Batch 21');
    // Prompt caching on system blocks and the last tool.
    expect(second?.system.every((b) => b.cache_control?.type === 'ephemeral')).toBe(true);
    expect(second?.tools.at(-1)?.cache_control).toEqual({ type: 'ephemeral' });
    expect(second?.tools.every((tool) => tool.eager_input_streaming === true)).toBe(true);

    const usage = await t.db.query<{
      cost_usd: string;
      input_tokens: number;
      cache_read_tokens: number;
      cache_write_tokens: number;
    }>(
      `select cost_usd::text, input_tokens, cache_read_tokens, cache_write_tokens from public.llm_usage where task_id = $1 and purpose = 'run' order by id`,
      [id],
    );
    expect(usage.rows).toHaveLength(2);
    // 2100 in, 120 out, 1800 cache write at $2/$10/$2.5 per MTok = 0.0042 + 0.0012 + 0.0045
    expect(Number(usage.rows[0]?.cost_usd)).toBeCloseTo(0.0099, 6);
    expect(usage.rows[1]?.cache_read_tokens).toBe(1800);

    const events = await t.db.query<{ type: string }>(
      `select type from public.task_events where task_id = $1 order by id`,
      [id],
    );
    const types = events.rows.map((r) => r.type);
    expect(types).toEqual(expect.arrayContaining(['started', 'tool_call', 'tool_result', 'draft']));

    const state = await readAgentState(t.db, TEST_ORG_ID, 'writer');
    expect(state?.current_task_id).toBeNull();
    expect(state?.status_text).toBe('Menunggu review Raka');
    expect(await queuedJobs(t, QUEUES.reviewTask)).toEqual([
      { data: { taskId: id }, singleton_key: null },
    ]);
  });

  it('fails clearly when the agent budget is used up', async () => {
    const id = await insertTask(t, { title: 'Caption', assignee: 'writer' });
    await t.db.query(`update public.agents set monthly_token_budget = 100 where id = 'writer'`);
    await t.db.query(
      `insert into public.llm_usage (org_id, agent_id, purpose, model, input_tokens, output_tokens, cost_usd)
       values ($1, 'writer', 'run', 'm', 150, 10, 0)`,
      [TEST_ORG_ID],
    );
    await handleRunTask(jobDeps(t, boss, new FixtureLlm()), { taskId: id, agentId: 'writer' });
    const task = await loadTask(t.db, id);
    expect(task?.status).toBe('failed');
    expect(task?.error).toMatch(/Budget token bulanan Dimas habis/);
  });

  it('fails after MAX_STEPS without submit_result', async () => {
    const id = await insertTask(t, { title: 'Caption', assignee: 'writer' });
    const textOnly = {
      id: 'm',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-5-5',
      content: [{ type: 'text', text: 'Hmm.' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    } as unknown as LlmMessage;
    const env = testEnv(t.url, { MAX_STEPS: '3' });
    await handleRunTask(jobDeps(t, boss, new FixtureLlm([textOnly, textOnly, textOnly]), env), {
      taskId: id,
      agentId: 'writer',
    });
    const task = await loadTask(t.db, id);
    expect(task?.status).toBe('failed');
    expect(task?.error).toContain('batas 3 langkah');
  });

  it('manager tasks skip review', async () => {
    const id = await insertTask(t, { title: 'Prioritas minggu ini', assignee: 'manager' });
    const submit = loadFixture<LlmMessage[]>('run-writer-caption.json')[1] as LlmMessage;
    await handleRunTask(jobDeps(t, boss, new FixtureLlm([submit])), {
      taskId: id,
      agentId: 'manager',
    });
    const task = await loadTask(t.db, id);
    expect(task?.status).toBe('done');
    expect(task?.finished_at).toBeInstanceOf(Date);
    expect(await queuedJobs(t, QUEUES.reviewTask)).toEqual([]);
  });

  it('review: revise re-queues the agent, the manager walks over and back', async () => {
    const id = await insertTask(t, {
      title: 'Caption',
      assignee: 'writer',
      status: 'awaiting_review',
    });
    await t.db.query(
      `update public.tasks set result_text = 'Investasi Rp 1.250.000' where id = $1`,
      [id],
    );
    const states: string[] = [];
    const deps = jobDeps(
      t,
      boss,
      new FixtureLlm([], [review('revise', 'Harga Rp 1.250.000 tidak ada di data resmi.')]),
    );
    deps.sleep = async () => {
      const s = await readAgentState(t.db, TEST_ORG_ID, 'manager');
      states.push(`${s?.activity}:${s?.target_spot}`);
    };
    await handleReviewTask(deps, { taskId: id });

    expect(states).toEqual(['walking_to_review:desk:writer']);
    const task = await loadTask(t.db, id);
    expect(task?.status).toBe('needs_revision');
    expect(task?.revision_count).toBe(1);
    const reviews = await t.db.query(
      `select verdict, reviewer_id from public.reviews where task_id = $1`,
      [id],
    );
    expect(reviews.rows).toEqual([{ verdict: 'revise', reviewer_id: 'manager' }]);
    expect(await queuedJobs(t, QUEUES.runTask)).toEqual([
      { data: { taskId: id, agentId: 'writer' }, singleton_key: 'writer' },
    ]);
    const manager = await readAgentState(t.db, TEST_ORG_ID, 'manager');
    expect(manager).toMatchObject({
      activity: 'working',
      target_spot: 'desk',
      status_text: 'Balik ke meja',
    });
  });

  it('review: approved work is done; a third revise request finishes with a manual-check flag', async () => {
    const approvedId = await insertTask(t, {
      title: 'Caption',
      assignee: 'writer',
      status: 'awaiting_review',
    });
    await handleReviewTask(
      jobDeps(t, boss, new FixtureLlm([], [review('approved', 'Siap dipakai.')])),
      { taskId: approvedId },
    );
    expect((await loadTask(t.db, approvedId))?.status).toBe('done');

    const lastId = await insertTask(t, {
      title: 'Caption',
      assignee: 'writer',
      status: 'awaiting_review',
    });
    await t.db.query(`update public.tasks set revision_count = 2 where id = $1`, [lastId]);
    await handleReviewTask(
      jobDeps(t, boss, new FixtureLlm([], [review('revise', 'Masih ada harga karangan.')])),
      { taskId: lastId },
    );
    const last = await loadTask(t.db, lastId);
    expect(last?.status).toBe('done');
    expect(last?.result_json).toMatchObject({ manual_check: true });
  });

  it('review: notes longer than 40 words fail validation and are retried once', async () => {
    const id = await insertTask(t, {
      title: 'Caption',
      assignee: 'writer',
      status: 'awaiting_review',
    });
    const long = JSON.stringify({
      verdict: 'approved',
      notes: 'kata '.repeat(45),
      scores: { accuracy: 5, tone: 5, completeness: 5 },
    });
    await handleReviewTask(
      jobDeps(t, boss, new FixtureLlm([], [long, review('approved', 'Oke.')])),
      { taskId: id },
    );
    expect((await loadTask(t.db, id))?.status).toBe('done');
    const usage = await t.db.query(
      `select count(*)::int as n from public.llm_usage where task_id = $1 and purpose = 'review'`,
      [id],
    );
    expect(usage.rows[0]?.n).toBe(2);
  });
});
