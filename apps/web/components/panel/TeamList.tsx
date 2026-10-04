import type { AgentConfig } from '@intelligo/shared';

const initials = (name: string): string => name.slice(0, 1).toUpperCase();

export function TeamList({ agents }: { agents: readonly AgentConfig[] }) {
  return (
    <ul className="divide-y divide-line">
      {agents.map((agent) => (
        <li key={agent.id} className="grid grid-cols-[32px_1fr_auto] items-center gap-2.5 py-2">
          <span
            className="grid size-8 place-items-center rounded-full text-[13px] font-bold text-white"
            style={{ backgroundColor: agent.appearance.shirt }}
            aria-hidden
          >
            {initials(agent.name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{agent.name}</span>
            <span className="block truncate text-xs text-muted">{agent.role}</span>
          </span>
          {agent.isManager ? (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
              Manager
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
