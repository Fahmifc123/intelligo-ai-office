import { agentsConfig, officeLayout } from '@intelligo/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDemoSnapshot, planDemoTick } from '../lib/office/demo';
import { isPreviewMode, isPreviewPath } from '../lib/preview';

const NOW = new Date('2026-10-05T03:00:00Z');

describe('isPreviewMode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is on when a public Supabase variable is missing or blank', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    expect(isPreviewMode()).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '  ');
    expect(isPreviewMode()).toBe(true);
  });

  it('is off once both are set', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    expect(isPreviewMode()).toBe(false);
  });

  it('serves only the office and the health check', () => {
    expect(isPreviewPath('/')).toBe(true);
    expect(isPreviewPath('/api/health')).toBe(true);
    expect(isPreviewPath('/approvals')).toBe(false);
    expect(isPreviewPath('/api/chat')).toBe(false);
  });
});

describe('buildDemoSnapshot', () => {
  const snapshot = buildDemoSnapshot(NOW);

  it('has every agent at a desk from the layout', () => {
    const desks = new Set(officeLayout.desks.map((d) => d.id));
    expect(snapshot.agents.map((a) => a.id)).toEqual(agentsConfig.map((a) => a.id));
    expect(snapshot.agents.every((a) => desks.has(a.desk_id))).toBe(true);
    expect(Object.keys(snapshot.states).sort()).toEqual(agentsConfig.map((a) => a.id).sort());
  });

  it('tells a consistent story: done, awaiting approval, in progress', () => {
    const tasks = Object.values(snapshot.tasks);
    expect(tasks.map((t) => t.status).sort()).toEqual(['awaiting_approval', 'done', 'in_progress']);
    const working = Object.values(snapshot.states).filter((s) => s.current_task_id !== null);
    expect(working).toHaveLength(1);
    expect(snapshot.tasks[working[0]?.current_task_id ?? '']?.status).toBe('in_progress');
    const [action] = Object.values(snapshot.actions);
    expect(action?.status).toBe('proposed');
    expect(snapshot.tasks[action?.task_id ?? '']?.status).toBe('awaiting_approval');
    expect(snapshot.events.every((e) => e.task_id === null || e.task_id in snapshot.tasks)).toBe(
      true,
    );
  });

  it('uses the sample knowledge base facts', () => {
    const caption = Object.values(snapshot.tasks).find((t) => t.status === 'done');
    expect(caption?.result_text).toContain('Rp 7.500.000');
    expect(caption?.result_text).toContain('3 November 2026');
  });
});

describe('planDemoTick', () => {
  it('never moves an agent that is on a task', () => {
    const snapshot = buildDemoSnapshot(NOW);
    const changes = planDemoTick(snapshot, () => 0, NOW);
    expect(changes.length).toBe(agentsConfig.length - 1);
    expect(changes.some((c) => c.current_task_id !== null)).toBe(false);
  });

  it('sends some agents to the pantry or for a walk, and brings them back', () => {
    const snapshot = buildDemoSnapshot(NOW);
    // Per agent: change (0), pantry roll (0.7), status line pick (0).
    const values = [0, 0.7, 0];
    let i = 0;
    const rng = () => values[i++ % values.length] ?? 0;
    const away = planDemoTick(snapshot, rng, NOW);
    expect(away.every((c) => c.activity === 'break' && c.target_spot === 'pantry')).toBe(true);

    const next = { ...snapshot, states: { ...snapshot.states } };
    for (const row of away) next.states[row.agent_id] = row;
    const back = planDemoTick(next, () => 0, NOW);
    expect(back.every((c) => c.activity === 'working' && c.target_spot === 'desk')).toBe(true);
  });

  it('changes nothing when the dice say no', () => {
    expect(planDemoTick(buildDemoSnapshot(NOW), () => 0.99, NOW)).toEqual([]);
  });
});
