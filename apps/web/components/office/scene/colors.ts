import type { AgentActivity } from '@intelligo/shared';
import type { ThemeToken } from './theme';

/** Bubble dot color per activity. */
export const ACTIVITY_TOKEN: Record<AgentActivity, ThemeToken> = {
  working: 'ok',
  break: 'warn',
  meeting: 'meet',
  walking_to_review: 'accent',
  reviewing: 'accent',
  idle: 'idle',
  offline: 'idle',
};

/** Truncates status text for the bubble (SPEC: 26 characters). */
export function truncateStatus(text: string, max = 26): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
