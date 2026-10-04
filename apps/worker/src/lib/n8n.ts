import { SIGNATURE_HEADER, signBody } from '@intelligo/shared/hmac';
import type { WorkerEnv } from '@intelligo/shared';

export interface N8nResult {
  ok: boolean;
  status: number;
  body: unknown;
}

export class N8nConfigError extends Error {}

/** SPEC 11: 30 second timeout per webhook call. */
export const N8N_TIMEOUT_MS = 30_000;

/**
 * Calls an n8n webhook with a signed JSON body (X-Intelligo-Signature: hex HMAC-SHA256).
 * Every workflow must verify the signature before doing anything.
 */
export async function callN8n(
  env: Pick<WorkerEnv, 'N8N_BASE_URL' | 'N8N_WEBHOOK_SECRET'>,
  workflow: string,
  payload: Record<string, unknown>,
  timeoutMs = N8N_TIMEOUT_MS,
): Promise<N8nResult> {
  if (!env.N8N_BASE_URL || !env.N8N_WEBHOOK_SECRET) {
    throw new N8nConfigError('N8N_BASE_URL dan N8N_WEBHOOK_SECRET belum diisi di worker.');
  }
  const body = JSON.stringify(payload);
  const url = `${env.N8N_BASE_URL.replace(/\/+$/, '')}/${workflow}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [SIGNATURE_HEADER]: signBody(body, env.N8N_WEBHOOK_SECRET),
    },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON responses are kept as text.
  }
  return { ok: response.ok, status: response.status, body: parsed };
}
