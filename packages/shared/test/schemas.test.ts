import { describe, expect, it } from 'vitest';
import { WorkerEnv } from '../src/env';
import { AgentConfig, AgentStateRow, TaskRow } from '../src/schemas';

const ORG = '00000000-0000-0000-0000-000000000001';

describe('AgentConfig', () => {
  const base = {
    id: 'cs',
    name: 'Sinta',
    role: 'CS',
    focus: 'Balas chat',
    deskId: 'd-0-0',
    tools: ['submit_result'],
    idleLines: ['a', 'b'],
    appearance: { shirt: '#e8761a', hair: '#2a1a12', skin: '#f0c39e' },
  };

  it('defaults isManager to false', () => {
    expect(AgentConfig.parse(base).isManager).toBe(false);
  });

  it('requires at least two idle lines', () => {
    expect(AgentConfig.safeParse({ ...base, idleLines: ['a'] }).success).toBe(false);
  });

  it('rejects unknown tools and bad colors', () => {
    expect(AgentConfig.safeParse({ ...base, tools: ['rm_rf'] }).success).toBe(false);
    expect(
      AgentConfig.safeParse({ ...base, appearance: { ...base.appearance, hair: 'red' } }).success,
    ).toBe(false);
  });
});

describe('row schemas', () => {
  it('parses an agent_states row from PostgREST', () => {
    const row = AgentStateRow.parse({
      agent_id: 'writer',
      org_id: ORG,
      activity: 'walking_to_review',
      status_text: 'Menuju meja Dimas',
      current_task_id: null,
      target_spot: 'desk:writer',
      created_at: '2026-10-04T10:00:00+00:00',
      updated_at: '2026-10-04T10:00:01+00:00',
    });
    expect(row.updated_at).toBeInstanceOf(Date);
  });

  it('rejects unknown activities', () => {
    expect(
      AgentStateRow.safeParse({
        agent_id: 'writer',
        org_id: ORG,
        activity: 'sleeping',
        status_text: '',
        current_task_id: null,
        target_spot: null,
        created_at: '2026-10-04T10:00:00Z',
        updated_at: '2026-10-04T10:00:00Z',
      }).success,
    ).toBe(false);
  });

  it('enforces task priority range', () => {
    const task = {
      id: '11111111-1111-4111-8111-111111111111',
      org_id: ORG,
      title: 'Buat caption',
      instructions: null,
      requested_by: '22222222-2222-4222-8222-222222222222',
      assignee_id: null,
      assign_mode: 'auto',
      parent_task_id: null,
      status: 'queued',
      priority: 2,
      result_text: null,
      result_json: null,
      revision_count: 0,
      error: null,
      created_at: '2026-10-04T10:00:00Z',
      started_at: null,
      finished_at: null,
    };
    expect(TaskRow.safeParse(task).success).toBe(true);
    expect(TaskRow.safeParse({ ...task, priority: 4 }).success).toBe(false);
  });
});

describe('WorkerEnv', () => {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    ORG_ID: ORG,
    ANTHROPIC_API_KEY: '',
    MODEL_WORK: 'model-work',
    MODEL_FAST: 'model-fast',
    N8N_BASE_URL: '',
    N8N_WEBHOOK_SECRET: '',
  };

  it('applies defaults and treats empty strings as missing', () => {
    const parsed = WorkerEnv.parse(env);
    expect(parsed.DRY_RUN).toBe(true);
    expect(parsed.USD_TO_IDR).toBe(16000);
    expect(parsed.MAX_STEPS).toBe(8);
    expect(parsed.ANTHROPIC_API_KEY).toBeUndefined();
    expect(parsed.N8N_BASE_URL).toBeUndefined();
  });

  it('parses DRY_RUN strictly', () => {
    expect(WorkerEnv.parse({ ...env, DRY_RUN: 'false' }).DRY_RUN).toBe(false);
    expect(WorkerEnv.safeParse({ ...env, DRY_RUN: 'yes' }).success).toBe(false);
  });

  it('requires model ids', () => {
    expect(WorkerEnv.safeParse({ ...env, MODEL_WORK: '' }).success).toBe(false);
  });
});
