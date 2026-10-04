import type { ToolName } from '@intelligo/shared';
import type { LlmTool } from '../llm/types';
import { listTasks } from './list-tasks';
import { register } from './registry';
import { saveDraft } from './save-draft';
import { searchKnowledge } from './search-knowledge';
import { submitResult } from './submit-result';
import type { RegisteredTool } from './types';

/** Every tool the runner can execute, by name. */
const REGISTRY = new Map<ToolName, RegisteredTool>(
  [register(submitResult), register(searchKnowledge), register(saveDraft), register(listTasks)].map(
    (tool) => [tool.name, tool],
  ),
);

export function getTool(name: string): RegisteredTool | undefined {
  return REGISTRY.get(name as ToolName);
}

/** Tools an agent may use: its configured list (plus submit_result) intersected with the registry. */
export function toolsFor(allowed: readonly string[]): RegisteredTool[] {
  const names = new Set(allowed);
  names.add('submit_result');
  return [...REGISTRY.values()].filter((tool) => names.has(tool.name));
}

/** Anthropic tool definitions, streamed eagerly (inputs are validated by register()). */
export function toLlmTools(tools: readonly RegisteredTool[]): LlmTool[] {
  return tools.map((tool, index) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.jsonSchema as LlmTool['input_schema'],
    eager_input_streaming: true,
    // Cache breakpoint after the last tool: tool definitions are reused across steps.
    ...(index === tools.length - 1 ? { cache_control: { type: 'ephemeral' as const } } : {}),
  }));
}
