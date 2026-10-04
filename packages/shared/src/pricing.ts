import { z } from 'zod';

/** USD per 1M tokens. */
export const ModelPrice = z.object({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cacheRead: z.number().nonnegative(),
  cacheWrite: z.number().nonnegative(),
});
export type ModelPrice = z.infer<typeof ModelPrice>;

/**
 * Published Claude API list prices (USD / 1M tokens), keyed by model id prefix. This table is
 * only used to compute costs; which model runs is configured via MODEL_WORK / MODEL_FAST.
 * Override or extend it with MODEL_PRICING_JSON when prices change.
 */
export const DEFAULT_MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

export const PricingOverrides = z.record(z.string(), ModelPrice);

export function parsePricingOverrides(json: string | undefined): Record<string, ModelPrice> {
  if (!json || json.trim() === '') return {};
  return PricingOverrides.parse(JSON.parse(json));
}

/** Longest matching prefix wins, so 'claude-haiku-4-5-20251001' uses 'claude-haiku-4-5'. */
export function findPrice(
  model: string,
  overrides: Readonly<Record<string, ModelPrice>> = {},
): ModelPrice | undefined {
  const table = { ...DEFAULT_MODEL_PRICES, ...overrides };
  const key = Object.keys(table)
    .filter((prefix) => model === prefix || model.startsWith(`${prefix}-`))
    .sort((a, b) => b.length - a.length)[0];
  return key ? table[key] : undefined;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Cost in USD, rounded to 6 decimals (llm_usage.cost_usd is numeric(10,6)). */
export function computeCostUsd(price: ModelPrice, usage: TokenUsage): number {
  const cost =
    (usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheReadTokens * price.cacheRead +
      usage.cacheWriteTokens * price.cacheWrite) /
    1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
