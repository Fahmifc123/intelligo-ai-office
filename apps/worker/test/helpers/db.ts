import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateSeedSql } from '@intelligo/shared/seed';
import pg from 'pg';
import { createDb, type Db } from '../../src/lib/db';
import { TEST_DATABASE_URL } from './env';

export const TEST_ORG_ID = '00000000-0000-0000-0000-0000000000aa';
export const TEST_MODEL = 'test-model-work';

const repoRoot = resolve(import.meta.dirname, '../../../..');

export interface TestDatabase {
  url: string;
  db: Db;
  drop(): Promise<void>;
}

/** Creates a fresh database with all migrations and the agent seed applied. */
export async function createTestDatabase(): Promise<TestDatabase> {
  if (!TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL belum diisi');
  const name = `intelligo_test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  const setup = new pg.Client({ connectionString: url.toString() });
  await setup.connect();
  try {
    await setup.query(readFileSync(resolve(import.meta.dirname, 'compat.sql'), 'utf8'));
    const migrationsDir = resolve(repoRoot, 'supabase/migrations');
    for (const file of readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      await setup.query(readFileSync(resolve(migrationsDir, file), 'utf8'));
    }
    await setup.query(generateSeedSql({ orgId: TEST_ORG_ID, modelWork: TEST_MODEL, members: [] }));
  } finally {
    await setup.end();
  }

  const db = createDb(url.toString(), 6);
  return {
    url: url.toString(),
    db,
    async drop() {
      await db.end();
      const cleanup = new pg.Client({ connectionString: TEST_DATABASE_URL });
      await cleanup.connect();
      await cleanup.query(`drop database if exists ${name} with (force)`);
      await cleanup.end();
    },
  };
}

/** Deterministic random numbers for planners. */
export function sequenceRng(values: readonly number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index % values.length] ?? 0;
    index += 1;
    return value;
  };
}
