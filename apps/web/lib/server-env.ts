import 'server-only';
import { WebServerEnv } from '@intelligo/shared';
import { z } from 'zod';

let cached: WebServerEnv | undefined;

export function readServerEnv(): WebServerEnv {
  if (cached) return cached;
  const parsed = WebServerEnv.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Env server tidak valid (lihat .env.example):\n${z.prettifyError(parsed.error)}`,
    );
  }
  cached = parsed.data;
  return cached;
}
