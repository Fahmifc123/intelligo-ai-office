import { useSyncExternalStore } from 'react';
import {
  ActionRow,
  AgentStateRow,
  EMPTY_SNAPSHOT,
  LlmUsageRow,
  MAX_EVENTS,
  ReviewRow,
  SettingsRow,
  TaskEventRow,
  TaskRow,
  type OfficeSnapshot,
} from './types';

type Listener = () => void;

/** Minimal external store shared by the Pixi scene and the React panels. */
export class OfficeStore {
  private state: OfficeSnapshot;
  private readonly listeners = new Set<Listener>();

  constructor(initial: OfficeSnapshot = EMPTY_SNAPSHOT) {
    this.state = initial;
  }

  getSnapshot = (): OfficeSnapshot => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  replace(next: OfficeSnapshot): void {
    this.state = next;
    this.emit();
  }

  /** Applies one Supabase realtime change. Unknown or invalid payloads are ignored. */
  applyChange(table: string, eventType: string, record: unknown, old: unknown): void {
    const s = this.state;
    switch (table) {
      case 'agent_states': {
        const row = AgentStateRow.safeParse(record);
        if (row.success) this.set({ states: { ...s.states, [row.data.agent_id]: row.data } });
        return;
      }
      case 'settings': {
        const row = SettingsRow.safeParse(record);
        if (row.success) this.set({ settings: row.data });
        return;
      }
      case 'tasks': {
        if (eventType === 'DELETE') {
          const id = (old as { id?: unknown } | null)?.id;
          if (typeof id === 'string') {
            this.set({
              tasks: Object.fromEntries(Object.entries(s.tasks).filter(([key]) => key !== id)),
            });
          }
          return;
        }
        const row = TaskRow.safeParse(record);
        if (row.success) this.set({ tasks: { ...s.tasks, [row.data.id]: row.data } });
        return;
      }
      case 'task_events': {
        const row = TaskEventRow.safeParse(record);
        if (row.success && !s.events.some((e) => e.id === row.data.id)) {
          this.set({ events: [row.data, ...s.events].slice(0, MAX_EVENTS) });
        }
        return;
      }
      case 'actions': {
        const row = ActionRow.safeParse(record);
        if (row.success) this.set({ actions: { ...s.actions, [row.data.id]: row.data } });
        return;
      }
      case 'reviews': {
        const row = ReviewRow.safeParse(record);
        if (row.success) this.set({ reviews: { ...s.reviews, [row.data.task_id]: row.data } });
        return;
      }
      case 'llm_usage': {
        const row = LlmUsageRow.safeParse(record);
        if (row.success && !s.usageToday.some((u) => u.id === row.data.id)) {
          this.set({ usageToday: [...s.usageToday, row.data] });
        }
        return;
      }
    }
  }

  private set(patch: Partial<OfficeSnapshot>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export function useOfficeSnapshot(store: OfficeStore): OfficeSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
