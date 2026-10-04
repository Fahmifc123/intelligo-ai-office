import {
  ActionRow,
  AgentStateRow,
  Appearance,
  LlmUsageRow,
  ReviewRow,
  SettingsRow,
  TaskEventRow,
  TaskRow,
  ToolName,
} from '@intelligo/shared';
import { z } from 'zod';

/** Agent fields the office UI needs (no system prompt in the browser). */
export const AgentSummary = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  focus: z.string(),
  desk_id: z.string(),
  appearance: Appearance,
  is_manager: z.boolean(),
  enabled: z.boolean(),
  tools: z.array(ToolName),
});
export type AgentSummary = z.infer<typeof AgentSummary>;

export const AGENT_SUMMARY_COLUMNS =
  'id, name, role, focus, desk_id, appearance, is_manager, enabled, tools';

export interface OfficeSnapshot {
  agents: AgentSummary[];
  states: Record<string, AgentStateRow>;
  settings: SettingsRow | null;
  tasks: Record<string, TaskRow>;
  events: TaskEventRow[];
  actions: Record<string, ActionRow>;
  reviews: Record<string, ReviewRow>;
  usageToday: LlmUsageRow[];
}

export const EMPTY_SNAPSHOT: OfficeSnapshot = {
  agents: [],
  states: {},
  settings: null,
  tasks: {},
  events: [],
  actions: {},
  reviews: {},
  usageToday: [],
};

export const MAX_EVENTS = 120;

export { ActionRow, AgentStateRow, LlmUsageRow, ReviewRow, SettingsRow, TaskEventRow, TaskRow };
