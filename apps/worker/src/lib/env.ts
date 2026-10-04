import { WorkerEnv } from '@intelligo/shared/env';
import { z } from 'zod';

/** Parses worker env; exits with a readable message instead of a stack trace. */
export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const parsed = WorkerEnv.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Env worker tidak valid (lihat .env.example):\n${z.prettifyError(parsed.error)}`,
    );
  }
  if (parsed.data.LLM_MODE === 'scripted' && source.NODE_ENV === 'production') {
    throw new Error('LLM_MODE=scripted tidak boleh dipakai di produksi (NODE_ENV=production).');
  }
  return parsed.data;
}

/** Hides credentials when logging connection strings. */
export function redactDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '****';
    return parsed.toString();
  } catch {
    return '<DATABASE_URL tidak valid>';
  }
}
