import { PgBoss } from 'pg-boss';
import type { Logger } from './log';

/** pg-boss on the same Postgres as the app (SPEC section 4); jobs live in the pgboss schema. */
export function createBoss(databaseUrl: string, log: Logger): PgBoss {
  const boss = new PgBoss({
    connectionString: databaseUrl,
    schema: 'pgboss',
    application_name: 'intelligo-worker-boss',
    useListenNotify: true,
  });
  boss.on('error', (error) => {
    log.error({ err: error instanceof Error ? error.message : String(error) }, 'pg-boss error');
  });
  return boss;
}
