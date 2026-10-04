import { z } from 'zod';
import type { Db, Queryable } from '../lib/db';
import { setAgentState } from '../state/agent-state';
import { logEvent } from '../state/events';
import {
  modeName,
  planIdleTick,
  planOfficeMode,
  type OfficeModeName,
  type PlannedChange,
  type Rng,
} from './plan';
import { readRoster } from './roster';

const OfficeSettings = z.object({
  meeting_until: z.date().nullable(),
  break_mode: z.boolean(),
});

export interface OfficeModeState {
  meetingActive: boolean;
  breakMode: boolean;
  meetingUntil: Date | null;
}

export async function readOfficeMode(
  q: Queryable,
  orgId: string,
  now: Date,
): Promise<OfficeModeState> {
  const result = await q.query(
    'select meeting_until, break_mode from public.settings where org_id = $1',
    [orgId],
  );
  const row = result.rows[0]
    ? OfficeSettings.parse(result.rows[0])
    : { meeting_until: null, break_mode: false };
  return {
    meetingUntil: row.meeting_until,
    meetingActive: row.meeting_until !== null && row.meeting_until.getTime() > now.getTime(),
    breakMode: row.break_mode,
  };
}

async function applyChanges(
  q: Queryable,
  orgId: string,
  changes: readonly PlannedChange[],
  payload: Record<string, unknown>,
): Promise<void> {
  for (const change of changes) {
    await setAgentState(q, {
      orgId,
      agentId: change.agentId,
      activity: change.activity,
      statusText: change.statusText,
      targetSpot: change.targetSpot,
      event: { type: 'note', payload },
    });
  }
}

export interface ApplyModeResult {
  mode: OfficeModeState;
  name: OfficeModeName;
  changed: number;
}

/**
 * Applies Rapat tim / Jam istirahat to free agents. Clears an expired meeting.
 * `previous` is the mode applied last time; when it was a meeting or break and the office is
 * back to normal, those agents return to their desks.
 */
export async function applyOfficeMode(
  db: Db,
  orgId: string,
  rng: Rng,
  previous: OfficeModeName | null,
  now = new Date(),
): Promise<ApplyModeResult> {
  return db.tx(async (q) => {
    await q.query('select 1 from public.settings where org_id = $1 for update', [orgId]);
    const mode = await readOfficeMode(q, orgId, now);
    if (mode.meetingUntil && !mode.meetingActive) {
      await q.query('update public.settings set meeting_until = null where org_id = $1', [orgId]);
      mode.meetingUntil = null;
    }
    const roster = await readRoster(q, orgId);
    const name = modeName(mode);
    const ending = name === 'normal' && previous !== null && previous !== 'normal';
    const changes = planOfficeMode(roster, mode, rng, ending);
    await applyChanges(q, orgId, changes, { ambient: true, mode: name });
    if (changes.length > 0 && (name !== previous || ending)) {
      const manager = roster.find((entry) => entry.is_manager);
      await logEvent(q, {
        orgId,
        taskId: null,
        agentId: manager?.agent_id ?? null,
        type: 'note',
        payload: { message: modeMessage(mode, manager?.name ?? 'Manager') },
      });
    }
    return { mode, name, changed: changes.length };
  });
}

function modeMessage(mode: OfficeModeState, managerName: string): string {
  if (mode.meetingActive) return `${managerName} memanggil semua tim ke ruang rapat.`;
  if (mode.breakMode) return 'Jam istirahat. Antrean tugas tetap jalan.';
  return 'Semua kembali ke meja.';
}

/** Ambient idle behaviour, run every 20 seconds by the idle-tick job. */
export async function runIdleTick(
  db: Db,
  orgId: string,
  rng: Rng,
  now = new Date(),
): Promise<number> {
  const count = await db.tx(async (q) => {
    const mode = await readOfficeMode(q, orgId, now);
    const roster = await readRoster(q, orgId);
    const changes = planIdleTick(roster, mode, rng);
    await applyChanges(q, orgId, changes, { ambient: true });
    return changes.length;
  });
  // Ambient rows are only interesting for a short while; keep the feed table small.
  await db.query(
    `delete from public.task_events
      where org_id = $1 and task_id is null and payload ->> 'ambient' = 'true'
        and created_at < now() - interval '1 day'`,
    [orgId],
  );
  return count;
}
