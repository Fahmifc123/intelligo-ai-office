import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestLogger } from '../../src/lib/log';
import { loadAgent } from '../../src/state/agents';
import { loadTask } from '../../src/state/tasks';
import { getTool, toolsFor } from '../../src/tools';
import type { ToolContext } from '../../src/tools/types';
import { startMockN8nServer, type MockN8nServer } from '../../scripts/mock-n8n-server';
import { createTestDatabase, TEST_ORG_ID, type TestDatabase } from '../helpers/db';
import { hasTestDatabase } from '../helpers/env';
import { insertTask, testEnv } from '../helpers/worker';

describe.skipIf(!hasTestDatabase)('data and delegation tools (database, mock n8n)', () => {
  let t: TestDatabase;
  let n8n: MockN8nServer;

  beforeAll(async () => {
    t = await createTestDatabase();
    n8n = await startMockN8nServer('rahasia-tools');
  });
  afterAll(async () => {
    await n8n?.close();
    await t?.drop();
  });
  beforeEach(async () => {
    await t.db.query('delete from public.tasks');
  });

  const context = async (
    agentId: string,
    env = testEnv(t.url, { N8N_BASE_URL: n8n.url, N8N_WEBHOOK_SECRET: 'rahasia-tools' }),
  ): Promise<ToolContext> => {
    const taskId = await insertTask(t, {
      title: 'Uji tool',
      assignee: agentId,
      status: 'in_progress',
    });
    const task = await loadTask(t.db, taskId);
    const agent = await loadAgent(t.db, agentId);
    if (!task || !agent) throw new Error('setup gagal');
    return { db: t.db, env, log: createTestLogger(), orgId: TEST_ORG_ID, task, agent };
  };

  const run = async (name: string, input: unknown, ctx: ToolContext) => {
    const tool = getTool(name);
    if (!tool) throw new Error(`tool ${name} tidak ada`);
    return tool.run(input, ctx);
  };

  it('gives each agent the tools from the SPEC table', () => {
    expect(
      toolsFor(['read_sheet', 'score_leads', 'save_draft'])
        .map((t) => t.name)
        .sort(),
    ).toEqual(['read_sheet', 'save_draft', 'score_leads', 'submit_result'].sort());
  });

  it('read_sheet returns rows marked as external data', async () => {
    const out = await run(
      'read_sheet',
      { sheet: 'pembayaran', limit: 3 },
      await context('analyst'),
    );
    expect(out.external).toBe(true);
    expect(out.content).toMatchObject({ sheet: 'pembayaran', total_rows: 7 });
    expect((out.content as { rows: unknown[] }).rows).toHaveLength(3);
  });

  it('score_leads applies the rubric to the leads sheet', async () => {
    const out = await run('score_leads', { only: 'panas' }, await context('leads'));
    const content = out.content as { counts: Record<string, number>; table: string };
    expect(content.counts.panas).toBeGreaterThan(0);
    expect(content.table).toContain('| PT Logistik Cepat |');
    expect(content.table).not.toContain('Mahasiswa');
  });

  it('run_analysis aggregates and reports bad columns as tool errors', async () => {
    const ok = await run(
      'run_analysis',
      { sheet: 'pembayaran', operation: 'trend', date_column: 'date', value_column: 'amount_idr' },
      await context('analyst'),
    );
    expect((ok.content as { rows: { key: string }[] }).rows.map((r) => r.key)).toEqual([
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
    const bad = await run(
      'run_analysis',
      { sheet: 'pembayaran', operation: 'sum', value_column: 'omzet' },
      await context('analyst'),
    );
    expect(bad.isError).toBe(true);
    expect(bad.summary).toContain('Kolom "omzet" tidak ada');
  });

  it('create_google_doc stores the link on the task', async () => {
    const ctx = await context('proposal');
    const out = await run(
      'create_google_doc',
      { title: 'Proposal PT Logistik', markdown: '# Proposal' },
      ctx,
    );
    expect(out.summary).toMatch(/docs\.google\.com/);
    const task = await loadTask(t.db, ctx.task.id);
    expect(task?.result_json).toMatchObject({ documents: [{ title: 'Proposal PT Logistik' }] });
  });

  it('tools explain a missing n8n configuration instead of crashing', async () => {
    const out = await run('read_sheet', { sheet: 'leads' }, await context('leads', testEnv(t.url)));
    expect(out.isError).toBe(true);
    expect(out.summary).toContain('belum dikonfigurasi');
  });

  it('delegate_task: manager only, max 3 subtasks, never to itself', async () => {
    const ctx = await context('manager');
    for (let i = 0; i < 3; i++) {
      const out = await run(
        'delegate_task',
        { agent_id: 'writer', title: `Sub ${i}`, instructions: 'Kerjakan' },
        ctx,
      );
      expect(out.suspendFor).toMatch(/[0-9a-f-]{36}/);
    }
    const fourth = await run(
      'delegate_task',
      { agent_id: 'writer', title: 'Sub 4', instructions: 'Kerjakan' },
      ctx,
    );
    expect(fourth.isError).toBe(true);
    expect(fourth.summary).toContain('Batas 3 subtugas');
    const self = await run(
      'delegate_task',
      { agent_id: 'manager', title: 'Sendiri', instructions: 'x' },
      await context('manager'),
    );
    expect(self.isError).toBe(true);
    const notManager = await run(
      'delegate_task',
      { agent_id: 'writer', title: 'x', instructions: 'xyz' },
      await context('cs'),
    );
    expect(notManager.isError).toBe(true);
    const children = await t.db.query(
      `select parent_task_id::text, assign_mode, status from public.tasks where parent_task_id = $1`,
      [ctx.task.id],
    );
    expect(children.rows).toHaveLength(3);
    expect(children.rows[0]).toMatchObject({ assign_mode: 'manual', status: 'queued' });
  });

  it('propose tools reject invalid phone numbers before anything is stored', async () => {
    const out = await run(
      'propose_whatsapp_reply',
      { to: '0812xxxx9950', message: 'Halo' },
      await context('cs'),
    );
    expect(out.isError).toBe(true);
    const actions = await t.db.query('select count(*)::int as n from public.actions');
    expect(actions.rows[0]?.n).toBe(0);
  });
});
