import { computeCostUsd, findPrice, type LlmPurpose, type ModelPrice } from '@intelligo/shared';
import type { Queryable } from '../lib/db';
import type { Logger } from '../lib/log';
import type { LlmMessage } from './types';

export interface UsageContext {
  orgId: string;
  agentId: string | null;
  taskId: string | null;
  purpose: LlmPurpose;
}

/** Writes one llm_usage row per API response, priced by the model that actually served it. */
export async function recordUsage(
  q: Queryable,
  context: UsageContext,
  message: LlmMessage,
  prices: Readonly<Record<string, ModelPrice>>,
  log: Logger,
): Promise<number> {
  const usage = {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
  };
  const price = findPrice(message.model, prices);
  if (!price)
    log.warn(
      { model: message.model },
      'harga model tidak dikenal, biaya dicatat 0 (isi MODEL_PRICING_JSON)',
    );
  const cost = price ? computeCostUsd(price, usage) : 0;
  await q.query(
    `insert into public.llm_usage
       (org_id, agent_id, task_id, purpose, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      context.orgId,
      context.agentId,
      context.taskId,
      context.purpose,
      message.model,
      usage.inputTokens,
      usage.outputTokens,
      usage.cacheReadTokens,
      usage.cacheWriteTokens,
      cost,
    ],
  );
  return cost;
}
