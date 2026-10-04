import type { AgentActivity, AgentId } from './schemas';

/** Rapat tim lasts 25 seconds (SPEC section 12.3, Tombol global). */
export const MEETING_DURATION_MS = 25_000;

/** Short Indonesian labels for each activity, used in chips, team list, and bubbles. */
export const ACTIVITY_LABELS: Record<AgentActivity, string> = {
  working: 'Bekerja',
  idle: 'Santai',
  break: 'Istirahat',
  meeting: 'Rapat',
  walking_to_review: 'Menuju review',
  reviewing: 'Mereview',
  offline: 'Offline',
};

export type SpotTarget =
  | { kind: 'desk' }
  | { kind: 'beside_desk'; agentId: AgentId }
  | { kind: 'group'; group: 'pantry' | 'meeting' | 'lounge' | 'wander' };

const GROUPS = new Set(['pantry', 'meeting', 'lounge', 'wander']);

/**
 * Parses agent_states.target_spot. Unknown or empty values fall back to a target derived
 * from the activity, so the office never renders an agent without a destination.
 */
export function resolveSpotTarget(activity: AgentActivity, targetSpot: string | null): SpotTarget {
  if (targetSpot?.startsWith('desk:')) {
    const agentId = targetSpot.slice('desk:'.length);
    if (agentId.length > 0) return { kind: 'beside_desk', agentId };
  }
  if (targetSpot === 'desk') return { kind: 'desk' };
  if (targetSpot && GROUPS.has(targetSpot)) {
    return { kind: 'group', group: targetSpot as 'pantry' | 'meeting' | 'lounge' | 'wander' };
  }
  switch (activity) {
    case 'break':
      return { kind: 'group', group: 'pantry' };
    case 'meeting':
      return { kind: 'group', group: 'meeting' };
    case 'idle':
      return { kind: 'group', group: 'lounge' };
    default:
      return { kind: 'desk' };
  }
}

/** Ambient status lines used by idle-tick and office modes. */
export const AMBIENT_LINES = {
  break: ['Ngopi dulu', 'Isi ulang air minum', 'Ngemil sebentar'],
  wander: ['Jalan-jalan bentar', 'Dengerin musik', 'Stretching'],
  lunch: ['Makan siang', 'Ngopi dulu', 'Ngobrol santai'],
  meeting: ['Rapat mingguan'],
  backToDesk: 'Balik ke meja',
} as const;
