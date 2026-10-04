import type { WorkerEnv } from '@intelligo/shared/env';
import { AnthropicLlm } from './anthropic';
import { ScriptedLlm } from './scripted';
import { LlmConfigError, type JsonResult, type LlmClient, type LlmMessage } from './types';

/** Used when no API key is configured: office features keep working, tasks fail clearly. */
class MissingKeyLlm implements LlmClient {
  readonly mode = 'live' as const;
  private readonly error =
    'ANTHROPIC_API_KEY belum diisi di worker. Isi di .env lalu restart worker.';
  async turn(): Promise<LlmMessage> {
    throw new LlmConfigError(this.error);
  }
  async json<T>(): Promise<JsonResult<T>> {
    throw new LlmConfigError(this.error);
  }
}

export function createLlm(env: WorkerEnv): LlmClient {
  if (env.LLM_MODE === 'scripted') return new ScriptedLlm();
  if (!env.ANTHROPIC_API_KEY) return new MissingKeyLlm();
  return new AnthropicLlm(env.ANTHROPIC_API_KEY);
}
