import { describe, expect, it } from 'vitest';
import { readPublicEnv } from '../lib/env';

describe('readPublicEnv', () => {
  it('returns valid public env', () => {
    const env = readPublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
  });

  it('throws an Indonesian message when values are missing', () => {
    expect(() =>
      readPublicEnv({ NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: '' }),
    ).toThrow(/wajib diisi/);
  });

  it('never exposes server secrets', () => {
    const env = readPublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
    });
    expect(Object.keys(env)).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
