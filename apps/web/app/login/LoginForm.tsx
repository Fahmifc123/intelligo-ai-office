'use client';

import { useActionState } from 'react';
import { requestMagicLink, type LoginState } from './actions';

const initial: LoginState = { status: 'idle', message: '' };

export function LoginForm({ error }: { error?: string }) {
  const [state, action, pending] = useActionState(requestMagicLink, initial);
  const message = state.status === 'idle' ? error : state.message;
  return (
    <form action={action} className="grid gap-3">
      <label className="grid gap-1.5 text-sm font-semibold">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="nama@intelligo.id"
          className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base font-normal outline-none focus:border-accent"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-ink disabled:opacity-60"
      >
        {pending ? 'Mengirim...' : 'Kirim link masuk'}
      </button>
      {message ? (
        <p
          role="status"
          className={`text-sm ${state.status === 'sent' ? 'text-ok' : 'text-accent'}`}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
