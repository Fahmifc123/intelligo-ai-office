import type { ToolName } from '@intelligo/shared';
import type { LlmTool } from '../llm/types';
import { createGoogleDoc } from './create-google-doc';
import { delegateTask } from './delegate-task';
import { listTasks } from './list-tasks';
import { proposeEmail } from './propose-email';
import { proposeInvoice } from './propose-invoice';
import { proposeSchedulePost } from './propose-schedule-post';
import { proposeWhatsappBroadcast } from './propose-whatsapp-broadcast';
import { proposeWhatsappReply } from './propose-whatsapp-reply';
import { readSheet } from './read-sheet';
import { register } from './registry';
import { runAnalysisTool } from './run-analysis';
import { saveDraft } from './save-draft';
import { scoreLeadsTool } from './score-leads';
import { searchKnowledge } from './search-knowledge';
import { submitResult } from './submit-result';
import type { RegisteredTool } from './types';

/** Every tool the runner can execute, by name. */
const REGISTRY = new Map<ToolName, RegisteredTool>(
  [
    register(submitResult),
    register(searchKnowledge),
    register(saveDraft),
    register(listTasks),
    register(proposeWhatsappReply),
    register(proposeWhatsappBroadcast),
    register(proposeEmail),
    register(proposeInvoice),
    register(proposeSchedulePost),
    register(delegateTask),
    register(readSheet),
    register(scoreLeadsTool),
    register(runAnalysisTool),
    register(createGoogleDoc),
  ].map((tool) => [tool.name, tool]),
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
