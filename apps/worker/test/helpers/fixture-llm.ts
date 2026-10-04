import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { z } from 'zod';
import { validateJson } from '../../src/llm/json';
import type {
  JsonRequest,
  JsonResult,
  LlmClient,
  LlmMessage,
  TurnHooks,
  TurnRequest,
} from '../../src/llm/types';

export function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(import.meta.dirname, '../fixtures', name), 'utf8')) as T;
}

const jsonMessage = (text: string): LlmMessage =>
  ({
    id: `msg_json_${Math.random().toString(36).slice(2)}`,
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-4-5-20251001',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 500,
      output_tokens: 40,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  }) as unknown as LlmMessage;

/**
 * Replays recorded Anthropic responses (test/fixtures) instead of calling the API.
 * `turns` feeds runner turns in order; `jsonReplies` feeds router/reviewer replies in order.
 */
export class FixtureLlm implements LlmClient {
  readonly mode = 'live' as const;
  readonly requests: TurnRequest[] = [];
  readonly jsonRequests: JsonRequest<unknown>[] = [];

  constructor(
    private readonly turns: LlmMessage[] = [],
    private readonly jsonReplies: string[] = [],
  ) {}

  async turn(request: TurnRequest, hooks?: TurnHooks): Promise<LlmMessage> {
    this.requests.push(structuredClone({ ...request, signal: undefined }));
    const next = this.turns.shift();
    if (!next) throw new Error('FixtureLlm: tidak ada respons turn tersisa');
    for (const block of next.content) {
      if (block.type === 'tool_use') hooks?.onToolInput?.(block.name, block.input);
    }
    return next;
  }

  async json<T>(request: JsonRequest<T>): Promise<JsonResult<T>> {
    this.jsonRequests.push(request as JsonRequest<unknown>);
    const messages: LlmMessage[] = [];
    let error = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = this.jsonReplies.shift();
      if (text === undefined) break;
      const message = jsonMessage(text);
      messages.push(message);
      const result = validateJson(request.schema as z.ZodType<T>, text);
      if (result.ok) return { value: result.value, messages };
      error = result.error;
    }
    return { value: null, messages, error };
  }
}
