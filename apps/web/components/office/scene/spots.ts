import {
  resolveSpotTarget,
  type AgentActivity,
  type OfficeLayout,
  type Point,
} from '@intelligo/shared';

export interface SpotRequest {
  agentId: string;
  deskId: string;
  activity: AgentActivity;
  targetSpot: string | null;
}

export interface SpotAssignment {
  point: Point;
  /** Seated at a desk or at the meeting table. */
  seated: boolean;
  /** Key used to keep an agent on the same spot between updates. */
  key: string;
}

const hash = (value: string): number => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** Where the reviewer stands next to an agent's desk (prototype: seat + (0.75, 0.15)). */
export function besideDesk(layout: OfficeLayout, deskId: string): Point {
  const desk = layout.desks.find((d) => d.id === deskId);
  if (!desk) return [13.5, 8];
  return [desk.seat[0] + 0.75, desk.seat[1] + 0.15];
}

const GROUP_FALLBACK: Record<string, readonly ('pantry' | 'meeting' | 'lounge' | 'wander')[]> = {
  pantry: ['pantry', 'lounge', 'wander'],
  meeting: ['meeting', 'lounge'],
  lounge: ['lounge', 'wander', 'pantry'],
  wander: ['wander', 'lounge', 'pantry'],
};

/**
 * Turns agent_states into concrete points. Deterministic for the same input (agents are
 * processed in id order and start from a hashed spot), and stable: an agent keeps the spot
 * it already holds while it stays in the same group, so walkers do not swap places.
 */
export function assignSpots(
  layout: OfficeLayout,
  requests: readonly SpotRequest[],
  previous: ReadonlyMap<string, SpotAssignment> = new Map(),
): Map<string, SpotAssignment> {
  const result = new Map<string, SpotAssignment>();
  const used = new Set<string>();
  const deskOf = new Map(requests.map((r) => [r.agentId, r.deskId]));
  const sorted = [...requests].sort((a, b) => a.agentId.localeCompare(b.agentId));
  const pending: SpotRequest[] = [];

  for (const request of sorted) {
    if (request.activity === 'offline') continue;
    const target = resolveSpotTarget(request.activity, request.targetSpot);
    if (target.kind === 'desk') {
      const desk = layout.desks.find((d) => d.id === request.deskId);
      const point: Point = desk ? desk.seat : [13.5, 8];
      result.set(request.agentId, {
        point,
        seated: request.activity === 'working',
        key: `desk:${request.deskId}`,
      });
    } else if (target.kind === 'beside_desk') {
      const deskId = deskOf.get(target.agentId) ?? request.deskId;
      result.set(request.agentId, {
        point: besideDesk(layout, deskId),
        seated: false,
        key: `beside:${deskId}`,
      });
    } else {
      const prev = previous.get(request.agentId);
      if (prev && prev.key.startsWith(`${target.group}:`) && !used.has(prev.key)) {
        used.add(prev.key);
        result.set(request.agentId, prev);
      } else {
        pending.push(request);
      }
    }
  }

  for (const request of pending) {
    const target = resolveSpotTarget(request.activity, request.targetSpot);
    if (target.kind !== 'group') continue;
    const groups = GROUP_FALLBACK[target.group] ?? [target.group];
    let assigned: SpotAssignment | undefined;
    for (const group of groups) {
      const spots = layout.spots[group];
      const start = hash(request.agentId) % spots.length;
      for (let k = 0; k < spots.length && !assigned; k++) {
        const index = (start + k) % spots.length;
        const key = `${group}:${index}`;
        const point = spots[index];
        if (!point || used.has(key)) continue;
        used.add(key);
        assigned = { point, seated: group === 'meeting', key };
      }
      if (assigned) break;
    }
    if (!assigned) {
      // Every spot taken: share one with a small offset so characters do not overlap exactly.
      const spots = layout.spots[target.group];
      const base = spots[hash(request.agentId) % spots.length] ?? spots[0] ?? [13.5, 8];
      const offset = ((hash(`${request.agentId}:o`) % 5) - 2) * 0.25;
      assigned = {
        point: [base[0] + offset, base[1] + 0.3],
        seated: false,
        key: `${target.group}:shared:${request.agentId}`,
      };
    }
    result.set(request.agentId, assigned);
  }
  return result;
}
