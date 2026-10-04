import { createBoss } from './lib/boss';
import { createDb, readSeedStatus } from './lib/db';
import { loadWorkerEnv, redactDatabaseUrl } from './lib/env';

async function main(): Promise<void> {
  const env = loadWorkerEnv();
  console.log(`[worker] menghubungkan ke ${redactDatabaseUrl(env.DATABASE_URL)}`);

  const db = createDb(env.DATABASE_URL);
  const seed = await readSeedStatus(db, env.ORG_ID);
  if (seed.agents === 0) {
    console.warn(
      '[worker] belum ada agen untuk ORG_ID ini. Jalankan `supabase db reset` untuk migrasi + seed.',
    );
  } else {
    console.log(`[worker] ${seed.agents} agen, ${seed.agentStates} agent_states terdaftar`);
  }

  const boss = createBoss(env.DATABASE_URL);
  await boss.start();
  console.log(`[worker] pg-boss aktif (DRY_RUN=${String(env.DRY_RUN)})`);

  let stopping = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (stopping) return;
    stopping = true;
    console.log(`[worker] ${signal} diterima, berhenti...`);
    await boss.stop({ graceful: true, timeout: 10_000 });
    await db.end();
    process.exit(0);
  };
  process.on('SIGINT', (signal) => void shutdown(signal));
  process.on('SIGTERM', (signal) => void shutdown(signal));
}

main().catch((error: unknown) => {
  console.error('[worker] gagal start:', error instanceof Error ? error.message : error);
  process.exit(1);
});
