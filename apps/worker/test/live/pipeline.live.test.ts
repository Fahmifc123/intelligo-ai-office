import { ActionRow } from '@intelligo/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWorker, type RunningWorker } from '../../src/app';
import { createHealthState } from '../../src/lib/health';
import { createTestLogger } from '../../src/lib/log';
import { createLlm } from '../../src/llm/factory';
import { loadTask } from '../../src/state/tasks';
import { createTestDatabase, sequenceRng, TEST_ORG_ID, type TestDatabase } from '../helpers/db';
import { hasTestDatabase } from '../helpers/env';
import { startBoss, testEnv } from '../helpers/worker';

/**
 * `pnpm test:live`: the real pipeline against the Claude API (MODEL_WORK / MODEL_FAST from
 * .env). Costs a few cents per run; skipped without ANTHROPIC_API_KEY. External actions stay
 * in the approval queue, nothing is sent.
 */
const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
const enabled = hasTestDatabase && Boolean(apiKey);

const waitFor = async (check: () => Promise<boolean>, timeoutMs: number): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('waitFor: kondisi tidak terpenuhi');
};

describe.skipIf(!enabled)('live pipeline (Claude API)', () => {
  let t: TestDatabase;
  let worker: RunningWorker;
  let stopBoss: () => Promise<void>;

  beforeAll(async () => {
    t = await createTestDatabase();
    const boss = await startBoss(t.url);
    stopBoss = () => boss.stop({ graceful: false, close: true });
    const env = testEnv(t.url, {
      ANTHROPIC_API_KEY: apiKey ?? '',
      MODEL_WORK: process.env.MODEL_WORK ?? '',
      MODEL_FAST: process.env.MODEL_FAST ?? '',
      EFFORT_WORK: process.env.EFFORT_WORK ?? 'medium',
      LLM_REFUSAL_FALLBACK: process.env.LLM_REFUSAL_FALLBACK ?? 'true',
      DRY_RUN: 'true',
    });
    worker = await startWorker({
      env,
      db: t.db,
      boss,
      log: createTestLogger(),
      rng: sequenceRng([0.5]),
      llm: createLlm(env),
      health: createHealthState(),
      sleep: async () => undefined,
    });
  }, 60_000);

  afterAll(async () => {
    await worker?.stop();
    await stopBoss?.();
    await t?.drop();
  });

  const insert = async (title: string): Promise<string> => {
    const result = await t.db.query<{ id: string }>(
      `insert into public.tasks (org_id, title, instructions, requested_by, assign_mode)
       values ($1, $2, $2, '22222222-2222-4222-8222-222222222222', 'auto') returning id::text`,
      [TEST_ORG_ID, title],
    );
    return result.rows[0]?.id ?? '';
  };

  it('auto task: routed to Dimas, uses the knowledge base, reviewed, and done', async () => {
    const id = await insert(
      'Buat caption Instagram promo Bootcamp Data Science Batch 21, sebutkan harga dan tanggal mulai',
    );
    await waitFor(async () => {
      const status = (await loadTask(t.db, id))?.status;
      return status === 'done' || status === 'failed';
    }, 300_000);
    const task = await loadTask(t.db, id);
    expect(task?.status).toBe('done');
    expect(task?.assignee_id).toBe('writer');
    expect(task?.result_text).toMatch(/7\.500\.000/);

    const usage = await t.db.query<{ purpose: string; cost: string }>(
      `select purpose, sum(cost_usd)::text as cost from public.llm_usage where task_id = $1 group by purpose`,
      [id],
    );
    expect(usage.rows.map((r) => r.purpose).sort()).toEqual(['review', 'route', 'run']);
    expect(usage.rows.every((r) => Number(r.cost) > 0)).toBe(true);
    const reviews = await t.db.query<{ verdict: string }>(
      'select verdict from public.reviews where task_id = $1 order by created_at',
      [id],
    );
    expect(reviews.rows.at(-1)?.verdict).toBe('approved');
  }, 320_000);

  it('WhatsApp reply: routed to Sinta and waits for approval without sending', async () => {
    const id = await insert('Balas calon peserta 081234567890 yang tanya jadwal Batch 21');
    await waitFor(async () => {
      const status = (await loadTask(t.db, id))?.status;
      return status === 'awaiting_approval' || status === 'failed' || status === 'done';
    }, 300_000);
    const task = await loadTask(t.db, id);
    expect(task?.status).toBe('awaiting_approval');
    expect(task?.assignee_id).toBe('cs');
    const actions = await t.db.query(
      `select id, org_id, task_id, agent_id, kind, payload, status, approved_by, approved_at,
              executed_at, response, created_at, original_payload, rejected_by, rejected_at, error
         from public.actions where task_id = $1`,
      [id],
    );
    const parsed = actions.rows.map((row) => ActionRow.parse(row));
    expect(parsed.map((a) => [a.kind, a.status])).toEqual([['send_whatsapp', 'proposed']]);
    expect(parsed[0]?.payload).toMatchObject({ to: '6281234567890' });
  }, 320_000);
});
