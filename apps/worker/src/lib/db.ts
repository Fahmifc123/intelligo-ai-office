import pg from 'pg';

export interface Queryable {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<pg.QueryResult<R>>;
}

export interface Db extends Queryable {
  /** Runs `fn` inside a transaction; rolls back if it throws. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  /** Dedicated connection for LISTEN/NOTIFY. */
  connect(): Promise<pg.PoolClient>;
  end(): Promise<void>;
}

/**
 * Worker database pool. The worker is the only writer of agent_states and task_events,
 * and connects with privileged credentials that bypass RLS (same trust level as the service role).
 */
export function createDb(databaseUrl: string, max = 8): Db {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max,
    application_name: 'intelligo-worker',
  });
  pool.on('error', (error) => {
    console.error('[db] idle client error:', error.message);
  });

  return {
    query: (text, values) => pool.query(text, values as unknown[] | undefined),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await fn({
          query: (text, values) => client.query(text, values as unknown[] | undefined),
        });
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    connect: () => pool.connect(),
    end: () => pool.end(),
  };
}

export interface SeedStatus {
  agents: number;
  agentStates: number;
}

/** Counts seeded agents for the org; used as a startup check. */
export async function readSeedStatus(db: Queryable, orgId: string): Promise<SeedStatus> {
  const result = await db.query<{ agents: number; agent_states: number }>(
    `select
       (select count(*)::int from public.agents where org_id = $1) as agents,
       (select count(*)::int from public.agent_states where org_id = $1) as agent_states`,
    [orgId],
  );
  const row = result.rows[0];
  return { agents: row?.agents ?? 0, agentStates: row?.agent_states ?? 0 };
}
