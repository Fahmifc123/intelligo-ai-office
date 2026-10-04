import type { AgentRow, TaskRow, ToolName } from '@intelligo/shared';
import type { WorkerEnv } from '@intelligo/shared/env';
import type { z } from 'zod';
import type { Db } from '../lib/db';
import type { Logger } from '../lib/log';

export interface ToolContext {
  db: Db;
  env: WorkerEnv;
  log: Logger;
  orgId: string;
  task: TaskRow;
  agent: AgentRow;
}

export interface ToolOutput {
  /** Sent back to the model as the tool_result. */
  content: unknown;
  /** Short line for the task timeline (task_events.tool_result). */
  summary: string;
  isError?: boolean;
  /** Wraps content in <external_data> so the model treats it as data (SPEC 14). */
  external?: boolean;
  /** Subtask created by delegate_task: the run pauses until it finishes (Fase 6). */
  suspendFor?: string;
}

/**
 * One agent tool (CLAUDE.md: one tool per file exporting
 * { name, description, inputSchema, statusText, requiresApproval, execute }).
 */
export interface AgentTool<I = unknown> {
  name: ToolName;
  description: string;
  inputSchema: z.ZodType<I>;
  /** Status bubble text while the tool runs. */
  statusText: string | ((input: I) => string);
  /** True when the tool proposes an external action that needs approval. */
  requiresApproval: boolean;
  execute(input: I, context: ToolContext): Promise<ToolOutput>;
}

/** Errors whose message is safe to return to the model as a tool error. */
export class ToolError extends Error {}

export const defineTool = <I>(tool: AgentTool<I>): AgentTool<I> => tool;

/** Type-erased tool used by the registry and the runner. Input is validated before execute. */
export interface RegisteredTool {
  name: ToolName;
  description: string;
  requiresApproval: boolean;
  jsonSchema: Record<string, unknown>;
  statusText(input: unknown): string;
  /** Validates raw model input with the tool's Zod schema, then executes. */
  run(rawInput: unknown, context: ToolContext): Promise<ToolOutput>;
}
