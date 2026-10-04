import pg from 'pg';

export type Db = pg.Pool;

/**
 * Worker database pool. The worker is the only writer of agent_states and task_events,
 * and connects with privileged credentials that bypass RLS (same trust level as the service role).
 */
export function createDb(databaseUrl: string): Db {
  return new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    application_name: 'intelligo-worker',
  });
}

export interface SeedStatus {
  agents: number;
  agentStates: number;
}

/** Counts seeded agents for the org; used as a startup check. */
export async function readSeedStatus(db: Db, orgId: string): Promise<SeedStatus> {
  const result = await db.query<{ agents: number; agent_states: number }>(
    `select
       (select count(*)::int from public.agents where org_id = $1) as agents,
       (select count(*)::int from public.agent_states where org_id = $1) as agent_states`,
    [orgId],
  );
  const row = result.rows[0];
  return { agents: row?.agents ?? 0, agentStates: row?.agent_states ?? 0 };
}
