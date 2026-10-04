import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWorker, type RunningWorker } from '../../src/app';
import { createHealthState } from '../../src/lib/health';
import { createTestLogger } from '../../src/lib/log';
import { ScriptedLlm } from '../../src/llm/scripted';
import { loadTask } from '../../src/state/tasks';
import { createTestDatabase, sequenceRng, TEST_ORG_ID, type TestDatabase } from '../helpers/db';
import { hasTestDatabase } from '../helpers/env';
import { startBoss, testEnv } from '../helpers/worker';
import { startMockN8nServer, type MockN8nServer } from '../../scripts/mock-n8n-server';

const waitFor = async (check: () => Promise<boolean>, timeoutMs = 30_000): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('waitFor: kondisi tidak terpenuhi');
};

describe.skipIf(!hasTestDatabase)('full pipeline (pg-boss + dispatcher + scripted model)', () => {
  let t: TestDatabase;
  let worker: RunningWorker;
  let stopBoss: () => Promise<void>;
  let activeWalks = 0;
  let maxConcurrentWalks = 0;

  let n8n: MockN8nServer;

  beforeAll(async () => {
    n8n = await startMockN8nServer('rahasia-pipeline');
    t = await createTestDatabase();
    const boss = await startBoss(t.url);
    stopBoss = () => boss.stop({ graceful: false, close: true });
    worker = await startWorker({
      env: testEnv(t.url, {
        LLM_MODE: 'scripted',
        N8N_BASE_URL: n8n.url,
        N8N_WEBHOOK_SECRET: 'rahasia-pipeline',
      }),
      db: t.db,
      boss,
      log: createTestLogger(),
      rng: sequenceRng([0.9]),
      llm: new ScriptedLlm({ turnDelayMs: 20, chunkDelayMs: 5 }),
      health: createHealthState(),
      sleep: async () => {
        activeWalks += 1;
        maxConcurrentWalks = Math.max(maxConcurrentWalks, activeWalks);
        await new Promise((r) => setTimeout(r, 150));
        activeWalks -= 1;
      },
    });
  }, 60_000);

  afterAll(async () => {
    await worker?.stop();
    await stopBoss?.();
    await n8n?.close();
    await t?.drop();
  });

  const insert = async (title: string, assignee: string | null): Promise<string> => {
    const result = await t.db.query<{ id: string }>(
      `insert into public.tasks (org_id, title, instructions, requested_by, assignee_id, assign_mode)
       values ($1, $2, $2, '22222222-2222-4222-8222-222222222222', $3, $4) returning id::text`,
      [TEST_ORG_ID, title, assignee, assignee ? 'manual' : 'auto'],
    );
    return result.rows[0]?.id ?? '';
  };

  it('auto task: routed to Dimas, fabricated price revised once, then approved', async () => {
    const id = await insert('Buat caption promo Bootcamp Batch 21 dengan harga karangan', null);
    await waitFor(async () => (await loadTask(t.db, id))?.status === 'done');
    const task = await loadTask(t.db, id);
    expect(task?.assignee_id).toBe('writer');
    expect(task?.revision_count).toBe(1);
    expect(task?.result_text).toContain('Rp 7.500.000');
    expect(task?.result_text).not.toContain('Rp 1.250.000');

    const reviews = await t.db.query<{ verdict: string }>(
      `select verdict from public.reviews where task_id = $1 order by created_at`,
      [id],
    );
    expect(reviews.rows.map((r) => r.verdict)).toEqual(['revise', 'approved']);
    const purposes = await t.db.query<{ purpose: string; n: number }>(
      `select purpose, count(*)::int as n from public.llm_usage where task_id = $1 group by purpose order by purpose`,
      [id],
    );
    expect(purposes.rows.map((r) => r.purpose)).toEqual(['review', 'route', 'run']);
    const cost = await t.db.query<{ total: string }>(
      `select sum(cost_usd)::text as total from public.llm_usage where task_id = $1`,
      [id],
    );
    expect(Number(cost.rows[0]?.total)).toBeGreaterThan(0);
  });

  it('reviews several tasks one at a time', async () => {
    const ids = await Promise.all([
      insert('Caption promo private course', 'writer'),
      insert('Kalender konten minggu depan', 'socmed'),
      insert('Silabus modul n8n', 'curriculum'),
    ]);
    await waitFor(async () => {
      const statuses = await Promise.all(ids.map(async (id) => (await loadTask(t.db, id))?.status));
      return statuses.every((s) => s === 'done');
    }, 45_000);
    expect(maxConcurrentWalks).toBe(1);
  });

  it('Fase 6: manager delegates lead scoring to Bima, then the proposal to Nadia, and reports the Doc link', async () => {
    const id = await insert('Siapkan penawaran untuk lead panas minggu ini', 'manager');
    await waitFor(async () => (await loadTask(t.db, id))?.status === 'done', 60_000);

    const subtasks = await t.db.query<{ assignee_id: string; status: string; result_text: string }>(
      `select assignee_id, status, result_text from public.tasks where parent_task_id = $1 order by created_at`,
      [id],
    );
    expect(subtasks.rows.map((r) => [r.assignee_id, r.status])).toEqual([
      ['leads', 'done'],
      ['proposal', 'done'],
    ]);
    expect(subtasks.rows[0]?.result_text).toContain('| PT Logistik Cepat |');
    expect(subtasks.rows[0]?.result_text).toContain('panas');

    const parent = await loadTask(t.db, id);
    expect(parent?.result_text).toMatch(
      /https:\/\/docs\.google\.com\/document\/d\/mock-[\w-]+\/edit/,
    );
    expect(parent?.result_json).not.toHaveProperty('runner_state');
    expect(parent?.result_json).not.toHaveProperty('waiting_on');

    // Proposal instructions carried Bima's hot leads.
    const proposal = await t.db.query<{ instructions: string }>(
      `select instructions from public.tasks where parent_task_id = $1 and assignee_id = 'proposal'`,
      [id],
    );
    expect(proposal.rows[0]?.instructions).toContain('PT Logistik Cepat');

    const workflows = n8n.calls.map((c) => c.workflow);
    expect(workflows).toEqual(expect.arrayContaining(['sheet-read', 'doc-create']));
    expect(n8n.calls.every((c) => c.signatureValid)).toBe(true);
    const waits = await t.db.query(
      `select count(*)::int as n from public.task_events where task_id = $1 and payload ->> 'message' like 'Menunggu hasil subtugas%'`,
      [id],
    );
    expect(waits.rows[0]?.n).toBe(2);
  }, 90_000);
});
