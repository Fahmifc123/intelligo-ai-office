import { AMBIENT_LINES, type AgentActivity, type TargetSpot } from '@intelligo/shared';
import { isFree, type RosterEntry } from './roster';

export type Rng = () => number;

export interface PlannedChange {
  agentId: string;
  activity: AgentActivity;
  statusText: string;
  targetSpot: TargetSpot;
}

export interface OfficeMode {
  meetingActive: boolean;
  breakMode: boolean;
}

const pick = <T>(items: readonly T[], rng: Rng): T => {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error('pick() dari daftar kosong');
  return item;
};

const deskLine = (entry: RosterEntry, rng: Rng): string =>
  entry.idle_lines.length > 0 ? pick(entry.idle_lines, rng) : AMBIENT_LINES.backToDesk;

/** Probability that an agent changes what it is doing on one 20 s tick. */
export const IDLE_CHANGE_PROBABILITY = 0.35;

/**
 * Ambient behaviour for agents without a task (SPEC section 9, idle-tick):
 * light work 60 %, pantry 20 %, walking around 20 %. Agents away from their desk
 * drift back with the same change probability.
 */
export function planIdleTick(
  roster: readonly RosterEntry[],
  mode: OfficeMode,
  rng: Rng,
): PlannedChange[] {
  if (mode.meetingActive || mode.breakMode) return [];
  const changes: PlannedChange[] = [];
  for (const entry of roster) {
    if (!isFree(entry)) continue;
    if (rng() >= IDLE_CHANGE_PROBABILITY) continue;

    const away = entry.activity !== 'working';
    if (away) {
      changes.push({
        agentId: entry.agent_id,
        activity: 'working',
        statusText: deskLine(entry, rng),
        targetSpot: 'desk',
      });
      continue;
    }
    const roll = rng();
    if (roll < 0.6) {
      changes.push({
        agentId: entry.agent_id,
        activity: 'working',
        statusText: deskLine(entry, rng),
        targetSpot: 'desk',
      });
    } else if (roll < 0.8) {
      changes.push({
        agentId: entry.agent_id,
        activity: 'break',
        statusText: pick(AMBIENT_LINES.break, rng),
        targetSpot: 'pantry',
      });
    } else {
      changes.push({
        agentId: entry.agent_id,
        activity: 'idle',
        statusText: pick(AMBIENT_LINES.wander, rng),
        targetSpot: rng() < 0.5 ? 'lounge' : 'wander',
      });
    }
  }
  return changes;
}

export type OfficeModeName = 'normal' | 'meeting' | 'break';

export function modeName(mode: OfficeMode): OfficeModeName {
  if (mode.meetingActive) return 'meeting';
  if (mode.breakMode) return 'break';
  return 'normal';
}

/**
 * Brings free agents in line with the office mode. Agents working on a task keep working
 * (the queue keeps running during breaks). Disabled agents go offline.
 * `endingMode` is set only when a meeting or break just ended: then meeting and break agents
 * walk back to their desks. Ambient pantry visits from idle-tick are left alone otherwise.
 */
export function planOfficeMode(
  roster: readonly RosterEntry[],
  mode: OfficeMode,
  rng: Rng,
  endingMode = false,
): PlannedChange[] {
  const changes: PlannedChange[] = [];
  for (const entry of roster) {
    if (!entry.enabled) {
      if (entry.activity !== 'offline') {
        changes.push({
          agentId: entry.agent_id,
          activity: 'offline',
          statusText: 'Nonaktif',
          targetSpot: 'desk',
        });
      }
      continue;
    }
    if (entry.activity === 'offline' && entry.current_task_id === null) {
      changes.push({
        agentId: entry.agent_id,
        activity: 'working',
        statusText: deskLine(entry, rng),
        targetSpot: 'desk',
      });
      continue;
    }
    if (!isFree(entry)) continue;

    if (mode.meetingActive) {
      if (entry.activity !== 'meeting') {
        changes.push({
          agentId: entry.agent_id,
          activity: 'meeting',
          statusText: pick(AMBIENT_LINES.meeting, rng),
          targetSpot: 'meeting',
        });
      }
    } else if (mode.breakMode) {
      if (entry.activity !== 'break') {
        changes.push({
          agentId: entry.agent_id,
          activity: 'break',
          statusText: pick(AMBIENT_LINES.lunch, rng),
          targetSpot: 'pantry',
        });
      }
    } else if (endingMode && (entry.activity === 'meeting' || entry.activity === 'break')) {
      changes.push({
        agentId: entry.agent_id,
        activity: 'working',
        statusText: deskLine(entry, rng),
        targetSpot: 'desk',
      });
    }
  }
  return changes;
}
