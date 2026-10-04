import { describe, expect, it } from 'vitest';
import { loadWorkerEnv, redactDatabaseUrl } from '../../src/lib/env';

const valid = {
  DATABASE_URL: 'postgresql://postgres:secret@127.0.0.1:54322/postgres',
  ORG_ID: '00000000-0000-0000-0000-000000000001',
  MODEL_WORK: 'model-work',
  MODEL_FAST: 'model-fast',
  DRY_RUN: 'true',
};

describe('loadWorkerEnv', () => {
  it('parses a valid env', () => {
    const env = loadWorkerEnv(valid);
    expect(env.DRY_RUN).toBe(true);
    expect(env.MAX_STEPS).toBe(8);
  });

  it('reports missing variables by name', () => {
    expect(() => loadWorkerEnv({ ...valid, MODEL_WORK: undefined })).toThrow(/MODEL_WORK/);
    expect(() => loadWorkerEnv({ ...valid, DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
  });
});

describe('loadWorkerEnv in production', () => {
  it('refuses the scripted model', () => {
    expect(() => loadWorkerEnv({ ...valid, LLM_MODE: 'scripted', NODE_ENV: 'production' })).toThrow(
      /scripted/,
    );
    expect(loadWorkerEnv({ ...valid, LLM_MODE: 'scripted' }).LLM_MODE).toBe('scripted');
  });
});

describe('redactDatabaseUrl', () => {
  it('masks the password', () => {
    const redacted = redactDatabaseUrl(valid.DATABASE_URL);
    expect(redacted).not.toContain('secret');
    expect(redacted).toContain('****');
  });

  it('does not echo invalid urls', () => {
    expect(redactDatabaseUrl('not a url with pw')).toBe('<DATABASE_URL tidak valid>');
  });
});
