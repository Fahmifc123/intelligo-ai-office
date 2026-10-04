import { PgBoss } from 'pg-boss';

/** pg-boss on the same Postgres as the app (SPEC section 4); jobs live in the pgboss schema. */
export function createBoss(databaseUrl: string): PgBoss {
  const boss = new PgBoss({
    connectionString: databaseUrl,
    schema: 'pgboss',
    application_name: 'intelligo-worker-boss',
  });
  boss.on('error', (error) => {
    console.error('[pg-boss] error:', error);
  });
  return boss;
}
