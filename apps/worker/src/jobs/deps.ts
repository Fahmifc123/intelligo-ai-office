import type { ModelPrice } from '@intelligo/shared';
import type { WorkerEnv } from '@intelligo/shared/env';
import type { PgBoss } from 'pg-boss';
import type { Db } from '../lib/db';
import type { Logger } from '../lib/log';
import type { ImageClient } from '../llm/image';
import type { LlmClient } from '../llm/types';
import type { MediaStore } from '../media/store';

export interface JobDeps {
  db: Db;
  boss: PgBoss;
  llm: LlmClient;
  /** Carousel images (Fase 9). */
  images: ImageClient;
  media: MediaStore;
  env: WorkerEnv;
  log: Logger;
  prices: Readonly<Record<string, ModelPrice>>;
  /** Pause used by the review walk; tests replace it to run instantly. */
  sleep(ms: number): Promise<void>;
}
