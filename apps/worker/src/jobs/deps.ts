import type { ModelPrice, WorkerEnv } from '@intelligo/shared';
import type { PgBoss } from 'pg-boss';
import type { Db } from '../lib/db';
import type { Logger } from '../lib/log';
import type { LlmClient } from '../llm/types';

export interface JobDeps {
  db: Db;
  boss: PgBoss;
  llm: LlmClient;
  env: WorkerEnv;
  log: Logger;
  prices: Readonly<Record<string, ModelPrice>>;
  /** Pause used by the review walk; tests replace it to run instantly. */
  sleep(ms: number): Promise<void>;
}
