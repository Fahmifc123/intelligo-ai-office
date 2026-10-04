import { startWorker } from './app';
import { createBoss } from './lib/boss';
import { createDb, readSeedStatus } from './lib/db';
import { createHealthState, startHealthServer } from './lib/health';
import { loadWorkerEnv, redactDatabaseUrl } from './lib/env';
import { createLogger } from './lib/log';
import { createLlm } from './llm/factory';

async function main(): Promise<void> {
  const log = createLogger();
  const env = loadWorkerEnv();
  log.info({ database: redactDatabaseUrl(env.DATABASE_URL) }, 'menghubungkan ke database');

  const db = createDb(env.DATABASE_URL);
  const seed = await readSeedStatus(db, env.ORG_ID);
  if (seed.agents === 0) {
    log.warn('belum ada agen untuk ORG_ID ini, jalankan `supabase db reset` untuk migrasi + seed');
  } else {
    log.info({ agents: seed.agents, agentStates: seed.agentStates }, 'agen terdaftar');
  }

  const boss = createBoss(env.DATABASE_URL, log);
  await boss.start();
  const health = createHealthState();
  const worker = await startWorker({
    env,
    db,
    boss,
    log,
    rng: Math.random,
    health,
    llm: createLlm(env),
  });
  const healthServer = await startHealthServer(env.HEALTH_PORT, db, health);
  log.info(
    { dryRun: env.DRY_RUN, llmMode: env.LLM_MODE, healthPort: env.HEALTH_PORT },
    'worker siap',
  );

  let stopping = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (stopping) return;
    stopping = true;
    log.info({ signal }, 'berhenti');
    healthServer.close();
    await worker.stop();
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
