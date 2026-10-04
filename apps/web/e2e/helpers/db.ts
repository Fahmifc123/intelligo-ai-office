import pg from 'pg';
import { E2eEnv } from './env';

let pool: pg.Pool | undefined;

export function db(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: E2eEnv.DATABASE_URL, max: 3 });
  return pool;
}

/** Clears tasks and their history and puts every agent back at its desk. */
export async function resetOffice(): Promise<void> {
  const client = await db().connect();
  try {
    await client.query('begin');
    await client.query(
      'truncate public.task_events, public.reviews, public.actions, public.llm_usage, public.chat_messages restart identity',
    );
    await client.query('update public.agent_states set current_task_id = null');
    await client.query('delete from public.tasks');
    await client.query(`update public.agents set enabled = true, monthly_token_budget = 2000000`);
    await client.query(
      `update public.agent_states s set activity = 'working', status_text = a.idle_lines[1], target_spot = 'desk'
         from public.agents a where a.id = s.agent_id`,
    );
    await client.query(
      `update public.settings set meeting_until = null, break_mode = false, dry_run = true, auto_approve_kinds = '{}'`,
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
