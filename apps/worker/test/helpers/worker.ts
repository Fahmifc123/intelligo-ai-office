import { WorkerEnv } from '@intelligo/shared/env';
import { PgBoss } from 'pg-boss';
import type { JobDeps } from '../../src/jobs/deps';
import { createTestLogger } from '../../src/lib/log';
import type { LlmClient } from '../../src/llm/types';
import { ensureQueues } from '../../src/queues';
import { TEST_MODEL, TEST_ORG_ID, type TestDatabase } from './db';

export function testEnv(url: string, overrides: Record<string, string> = {}): WorkerEnv {
  return WorkerEnv.parse({
    DATABASE_URL: url,
    ORG_ID: TEST_ORG_ID,
    MODEL_WORK: TEST_MODEL,
    MODEL_FAST: 'claude-haiku-4-5-20251001',
    LLM_MODE: 'live',
    LLM_REFUSAL_FALLBACK: 'false',
    IDLE_TICK_ENABLED: 'false',
    ...overrides,
  });
}

export async function startBoss(url: string): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: url, schema: 'pgboss', supervise: false });
  boss.on('error', () => undefined);
  await boss.start();
  await ensureQueues(boss);
  return boss;
}

export function jobDeps(
  t: TestDatabase,
  boss: PgBoss,
  llm: LlmClient,
  env = testEnv(t.url),
): JobDeps {
  return {
    db: t.db,
    boss,
    llm,
    env,
    log: createTestLogger(),
    prices: {},
    sleep: async () => undefined,
  };
}

/** Jobs waiting in a pg-boss queue (state created). */
export async function queuedJobs(
  t: TestDatabase,
  queue: string,
): Promise<{ data: Record<string, unknown>; singleton_key: string | null }[]> {
  const result = await t.db.query<{ data: Record<string, unknown>; singleton_key: string | null }>(
    `select data, singleton_key from pgboss.job where name = $1 and state = 'created' order by created_on`,
    [queue],
  );
  return result.rows;
}

export async function insertTask(
  t: TestDatabase,
  fields: {
    title: string;
    instructions?: string;
    assignee?: string | null;
    mode?: 'auto' | 'manual';
    priority?: number;
    status?: string;
  },
): Promise<string> {
  const result = await t.db.query<{ id: string }>(
    `insert into public.tasks (org_id, title, instructions, requested_by, assignee_id, assign_mode, priority, status, dispatched_at)
     values ($1, $2, $3, '22222222-2222-4222-8222-222222222222', $4, $5, $6, $7::task_status, now())
     returning id::text`,
    [
      TEST_ORG_ID,
      fields.title,
      fields.instructions ?? fields.title,
      fields.assignee ?? null,
      fields.mode ?? (fields.assignee ? 'manual' : 'auto'),
      fields.priority ?? 2,
      fields.status ?? 'queued',
    ],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('insertTask gagal');
  return id;
}
