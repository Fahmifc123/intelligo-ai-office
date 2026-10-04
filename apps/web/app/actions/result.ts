import { AuthError } from '@/lib/auth';

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Wraps a server action body so the client always gets an Indonesian message, never a stack trace. */
export async function runAction<T>(body: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await body() };
  } catch (error) {
    if (error instanceof AuthError || error instanceof UserError)
      return { ok: false, error: error.message };
    console.error('[action] gagal:', error);
    return { ok: false, error: 'Terjadi kesalahan di server. Coba lagi.' };
  }
}

/** An error whose message is safe to show to the user. */
export class UserError extends Error {}
