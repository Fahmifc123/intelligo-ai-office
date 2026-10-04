import { z } from 'zod';

// Server-only env schemas (web server and worker). Kept out of the main entry point so the
// browser bundle never contains the names of server secrets. Import from '@intelligo/shared/env'.

/** Treats empty strings from .env files as missing values. */
const optionalString = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().optional(),
);

const BooleanFromString = z.enum(['true', 'false']).transform((v) => v === 'true');

/** Server-side env for the Next.js app (route handlers, server actions). Never sent to the browser. */
export const WebServerEnv = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ORG_ID: z.guid(),
  /** Chat (Fase 4) calls the model from the server; required only when chat is used. */
  ANTHROPIC_API_KEY: optionalString,
  MODEL_WORK: z.string().min(1),
  MODEL_FAST: z.string().min(1),
  USD_TO_IDR: z.coerce.number().positive().default(16000),
  LLM_MODE: z.enum(['live', 'scripted']).default('live'),
  /** Effort for chat replies (low suits conversation). */
  EFFORT_CHAT: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
    )
    .default('low'),
  LLM_REFUSAL_FALLBACK: BooleanFromString.default(true),
  MODEL_PRICING_JSON: optionalString,
});
export type WebServerEnv = z.infer<typeof WebServerEnv>;

/** Worker talks to Postgres directly (as the service role would), never through PostgREST. */
export const WorkerEnv = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'DATABASE_URL harus URL Postgres'),
  ORG_ID: z.guid(),
  /** Required once the agent runner is active; validated at call time. */
  ANTHROPIC_API_KEY: optionalString,
  MODEL_WORK: z.string().min(1),
  MODEL_FAST: z.string().min(1),
  N8N_BASE_URL: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.url().optional(),
  ),
  N8N_WEBHOOK_SECRET: optionalString,
  DRY_RUN: BooleanFromString.default(true),
  USD_TO_IDR: z.coerce.number().positive().default(16000),
  MAX_STEPS: z.coerce.number().int().positive().default(8),
  /** `scripted` replaces the model with deterministic responses (e2e and offline demos only). */
  LLM_MODE: z.enum(['live', 'scripted']).default('live'),
  /** Effort for MODEL_WORK runs; empty disables the parameter (for models without effort support). */
  EFFORT_WORK: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
  ),
  /** Server-side refusal fallback on MODEL_WORK runs (Claude API only). */
  LLM_REFUSAL_FALLBACK: BooleanFromString.default(true),
  /** Optional JSON price table override: {"model-prefix": {input, output, cacheRead, cacheWrite}}. */
  MODEL_PRICING_JSON: optionalString,
  /** Total wall-clock limit for one task run (SPEC: 5 minutes). */
  TASK_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
  /** Ambient idle behaviour every 20 s; e2e runs turn it off for deterministic assertions. */
  IDLE_TICK_ENABLED: BooleanFromString.default(true),
  /** Optional Slack/Discord-compatible webhook for job failure alerts (Fase 8). */
  ALERT_WEBHOOK_URL: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.url().optional(),
  ),
  /** Port for the health check endpoint (Fase 8). */
  HEALTH_PORT: z.coerce.number().int().positive().default(8787),
});
export type WorkerEnv = z.infer<typeof WorkerEnv>;
