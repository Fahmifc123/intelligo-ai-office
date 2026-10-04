import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Dispatcher } from '../../src/dispatcher';
import { createTestLogger } from '../../src/lib/log';
import { applyOfficeMode, runIdleTick } from '../../src/office/office';
import { readAgentStates } from '../../src/state/agent-state';
import { createTestDatabase, sequenceRng, TEST_ORG_ID, type TestDatabase } from '../helpers/db';
import { hasTestDatabase } from '../helpers/env';

const waitFor = async (check: () => Promise<boolean>, timeoutMs = 5_000): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('waitFor: kondisi tidak terpenuhi');
};

describe.skipIf(!hasTestDatabase)('office modes and idle-tick (database)', () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDatabase();
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('seeds 12 agents working at their desks', async () => {
    const states = await readAgentStates(t.db, TEST_ORG_ID);
    expect(states).toHaveLength(12);
    expect(new Set(states.map((s) => s.activity))).toEqual(new Set(['working']));
  });

  it('starts a meeting for free agents, writes events, and ends it after expiry', async () => {
    const now = new Date();
    await t.db.query(`update public.settings set meeting_until = $2 where org_id = $1`, [
      TEST_ORG_ID,
      new Date(now.getTime() + 25_000),
    ]);
    const started = await applyOfficeMode(t.db, TEST_ORG_ID, sequenceRng([0]), 'normal', now);
    expect(started.changed).toBe(12);
    const meeting = await readAgentStates(t.db, TEST_ORG_ID);
    expect(meeting.every((s) => s.activity === 'meeting' && s.target_spot === 'meeting')).toBe(
      true,
    );

    const events = await t.db.query<{ count: number }>(
      `select count(*)::int as count from public.task_events where org_id = $1 and type = 'note'`,
      [TEST_ORG_ID],
    );
    expect(events.rows[0]?.count).toBe(13);

    const ended = await applyOfficeMode(
      t.db,
      TEST_ORG_ID,
      sequenceRng([0]),
      'meeting',
      new Date(now.getTime() + 26_000),
    );
    expect(ended.mode.meetingUntil).toBeNull();
    const after = await readAgentStates(t.db, TEST_ORG_ID);
    expect(after.every((s) => s.activity === 'working' && s.target_spot === 'desk')).toBe(true);
    const settings = await t.db.query(
      'select meeting_until from public.settings where org_id = $1',
      [TEST_ORG_ID],
    );
    expect(settings.rows[0]?.meeting_until).toBeNull();
  });

  it('idle-tick changes some free agents and skips agents with a task', async () => {
    await t.db.query(
      `insert into public.tasks (id, org_id, title, requested_by, assign_mode, assignee_id, status)
       values ('11111111-1111-4111-8111-111111111111', $1, 'Caption', '22222222-2222-4222-8222-222222222222', 'manual', 'writer', 'in_progress')`,
      [TEST_ORG_ID],
    );
    await t.db.query(
      `update public.agent_states set current_task_id = '11111111-1111-4111-8111-111111111111', status_text = 'Mengerjakan: Caption'
        where agent_id = 'writer'`,
    );
    // Every roll 0.7: every free agent changes and heads to the pantry.
    const changed = await runIdleTick(t.db, TEST_ORG_ID, sequenceRng([0.1, 0.7, 0]));
    expect(changed).toBe(11);
    const states = await readAgentStates(t.db, TEST_ORG_ID);
    const writer = states.find((s) => s.agent_id === 'writer');
    expect(writer?.activity).toBe('working');
    expect(writer?.status_text).toBe('Mengerjakan: Caption');
    expect(states.filter((s) => s.activity === 'break')).toHaveLength(11);
  });

  it('dispatcher reacts to a settings NOTIFY by applying the break mode', async () => {
    const dispatcher = new Dispatcher(
      t.db,
      createTestLogger(),
      {
        onNotification: async (n) => {
          if (n.kind === 'office')
            await applyOfficeMode(t.db, TEST_ORG_ID, sequenceRng([0]), 'normal');
        },
        sweep: async () => undefined,
      },
      60_000,
    );
    await dispatcher.start();
    try {
      await t.db.query(
        `update public.agent_states set activity = 'working', target_spot = 'desk' where agent_id <> 'writer'`,
      );
      await t.db.query(`update public.settings set break_mode = true where org_id = $1`, [
        TEST_ORG_ID,
      ]);
      await waitFor(async () => {
        const states = await readAgentStates(t.db, TEST_ORG_ID);
        return states.filter((s) => s.activity === 'break').length === 11;
      });
    } finally {
      await dispatcher.stop();
    }
  });
});
