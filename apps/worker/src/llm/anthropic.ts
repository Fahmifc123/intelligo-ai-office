import Anthropic from '@anthropic-ai/sdk';
import { jsonWithRetry } from './json';
import type {
  JsonRequest,
  JsonResult,
  LlmClient,
  LlmMessage,
  TurnHooks,
  TurnRequest,
} from './types';

/** Re-issue a turn whose streamed tool input was not parseable JSON (not API errors). */
const MAX_JSON_RETRIES = 2;

/**
 * Claude API client. The SDK retries 429 / 5xx / connection errors with exponential backoff
 * (maxRetries 3, SPEC 10); other errors surface to the caller.
 */
export class AnthropicLlm implements LlmClient {
  readonly mode = 'live' as const;
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 3 });
  }

  async turn(request: TurnRequest, hooks?: TurnHooks): Promise<LlmMessage> {
    for (let attempt = 0; ; attempt++) {
      const stream = this.client.beta.messages.stream(
        {
          model: request.model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: request.messages,
          tools: request.tools,
          ...(request.effort ? { output_config: { effort: request.effort } } : {}),
          ...(request.refusalFallback
            ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
            : {}),
        },
        { signal: request.signal },
      );
      if (hooks?.onToolInput) {
        const onToolInput = hooks.onToolInput;
        stream.on('streamEvent', (event, snapshot) => {
          if (event.type !== 'content_block_delta' || event.delta.type !== 'input_json_delta')
            return;
          const block = snapshot.content[event.index];
          if (block?.type === 'tool_use') onToolInput(block.name, block.input);
        });
      }
      try {
        return await stream.finalMessage();
      } catch (error) {
        if (
          error instanceof Anthropic.APIError ||
          request.signal?.aborted ||
          attempt >= MAX_JSON_RETRIES
        )
          throw error;
        // Eager input streaming: the tool input could not be parsed; re-issue the same turn.
      }
    }
  }

  async json<T>(request: JsonRequest<T>): Promise<JsonResult<T>> {
    return jsonWithRetry(request.schema, request.prompt, (messages) =>
      this.client.beta.messages.create(
        {
          model: request.model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages,
          output_config: { format: { type: 'json_schema', schema: request.jsonSchema } },
        },
        { signal: request.signal },
      ),
    );
  }
}
