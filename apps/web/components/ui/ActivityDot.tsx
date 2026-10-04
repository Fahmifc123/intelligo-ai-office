import type { AgentActivity } from '@intelligo/shared';

const DOT_CLASS: Record<AgentActivity, string> = {
  working: 'bg-ok',
  break: 'bg-warn',
  meeting: 'bg-meet',
  walking_to_review: 'bg-accent',
  reviewing: 'bg-accent',
  idle: 'bg-idle',
  offline: 'bg-idle opacity-50',
};

export function ActivityDot({ activity }: { activity: AgentActivity }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-2 shrink-0 rounded-full ${DOT_CLASS[activity]}`}
    />
  );
}
