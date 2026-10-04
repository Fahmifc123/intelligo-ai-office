import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { WebServerEnv } from '@intelligo/shared';

export type ChatTurnParam = Anthropic.Beta.Messages.BetaMessageParam;
export type ChatMessage = Anthropic.Beta.Messages.BetaMessage;
export type ChatTool = Anthropic.Beta.Messages.BetaTool;

export interface ChatRequest {
  model: string;
  system: string;
  messages: ChatTurnParam[];
  tools: ChatTool[];
  signal?: AbortSignal;
}

/** One model turn with text streamed to `onText`. */
export interface ChatModel {
  turn(request: ChatRequest, onText: (delta: string) => void): Promise<ChatMessage>;
}

export class ChatConfigError extends Error {}

class AnthropicChatModel implements ChatModel {
  private readonly client: Anthropic;
  constructor(
    apiKey: string,
    private readonly env: WebServerEnv,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 3 });
  }

  async turn(request: ChatRequest, onText: (delta: string) => void): Promise<ChatMessage> {
    const stream = this.client.beta.messages.stream(
      {
        model: request.model,
        max_tokens: 8000,
        system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
        messages: request.messages,
        tools: request.tools,
        ...(this.env.EFFORT_CHAT ? { output_config: { effort: this.env.EFFORT_CHAT } } : {}),
        ...(this.env.LLM_REFUSAL_FALLBACK
          ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
          : {}),
      },
      { signal: request.signal },
    );
    stream.on('text', onText);
    return stream.finalMessage();
  }
}

const PRICE = /Rp\s?\d{1,3}(?:[.,]\d{3})+/;

/** Deterministic replies for e2e and offline demos (LLM_MODE=scripted). Never used in production. */
class ScriptedChatModel implements ChatModel {
  async turn(request: ChatRequest, onText: (delta: string) => void): Promise<ChatMessage> {
    const last = request.messages.at(-1);
    const lastIsToolResult =
      last &&
      typeof last.content !== 'string' &&
      last.content.some((block) => block.type === 'tool_result');
    let content: ChatMessage['content'];
    if (!lastIsToolResult) {
      const question = typeof last?.content === 'string' ? last.content : '';
      content = [
        {
          type: 'tool_use',
          id: `toolu_chat_${Date.now()}`,
          name: 'search_knowledge',
          input: { query: question },
        },
      ] as ChatMessage['content'];
    } else {
      const facts = JSON.stringify(last.content);
      const price = facts.match(PRICE)?.[0];
      const title = facts.match(/"title":"([^"]+)"/)?.[1];
      const reply = price
        ? `Halo Kak, untuk ${title ?? 'program tersebut'} investasinya ${price}. Kalau berkenan, saya bantu kirimkan link pendaftaran.`
        : 'Maaf Kak, data itu belum ada di knowledge base kami. Saya bantu teruskan ke tim terkait ya.';
      for (const word of reply.split(/(?<= )/)) {
        onText(word);
        await new Promise((r) => setTimeout(r, 25));
      }
      content = [{ type: 'text', text: reply, citations: null }] as ChatMessage['content'];
    }
    const chars = JSON.stringify(request.messages).length + request.system.length;
    return {
      id: `msg_chat_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      model: request.model,
      content,
      stop_reason: lastIsToolResult ? 'end_turn' : 'tool_use',
      stop_sequence: null,
      usage: {
        input_tokens: Math.ceil(chars / 4),
        output_tokens: Math.ceil(JSON.stringify(content).length / 4),
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    } as unknown as ChatMessage;
  }
}

export function createChatModel(env: WebServerEnv): ChatModel {
  if (env.LLM_MODE === 'scripted') {
    if (process.env.NODE_ENV === 'production')
      throw new ChatConfigError('LLM_MODE=scripted tidak boleh dipakai di produksi.');
    return new ScriptedChatModel();
  }
  if (!env.ANTHROPIC_API_KEY)
    throw new ChatConfigError('ANTHROPIC_API_KEY belum diisi di server web.');
  return new AnthropicChatModel(env.ANTHROPIC_API_KEY, env);
}
