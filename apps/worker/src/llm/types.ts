import type Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';

export type LlmMessage = Anthropic.Beta.Messages.BetaMessage;
export type LlmMessageParam = Anthropic.Beta.Messages.BetaMessageParam;
export type LlmTool = Anthropic.Beta.Messages.BetaTool;
export type LlmTextBlockParam = Anthropic.Beta.Messages.BetaTextBlockParam;
export type LlmToolUseBlock = Anthropic.Beta.Messages.BetaToolUseBlock;
export type LlmToolResultBlockParam = Anthropic.Beta.Messages.BetaToolResultBlockParam;
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface TurnRequest {
  model: string;
  system: LlmTextBlockParam[];
  messages: LlmMessageParam[];
  tools: LlmTool[];
  maxTokens: number;
  effort?: Effort;
  /** Server-side refusal fallback (Claude API only). */
  refusalFallback?: boolean;
  signal?: AbortSignal;
}

export interface TurnHooks {
  /** Partial tool input while it streams (used to show results as they are written). */
  onToolInput?(toolName: string, partialInput: unknown): void;
}

export interface JsonRequest<T> {
  model: string;
  system: string;
  prompt: string;
  /** Plain JSON schema sent as the structured output format. */
  jsonSchema: Record<string, unknown>;
  /** Strict validation applied to the reply (SPEC 14: every LLM JSON output is Zod-validated). */
  schema: z.ZodType<T>;
  maxTokens: number;
  signal?: AbortSignal;
}

export interface JsonResult<T> {
  /** null when the reply failed validation twice; callers fall back. */
  value: T | null;
  /** Every API response, for usage accounting. */
  messages: LlmMessage[];
  error?: string;
}

export interface LlmClient {
  readonly mode: 'live' | 'scripted';
  turn(request: TurnRequest, hooks?: TurnHooks): Promise<LlmMessage>;
  json<T>(request: JsonRequest<T>): Promise<JsonResult<T>>;
}

export class LlmConfigError extends Error {}
