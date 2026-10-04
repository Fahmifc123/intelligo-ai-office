import { z } from 'zod';
import { defineTool, ToolError } from './types';

/** SPEC 10: the manager may create at most 3 subtasks per task. */
export const MAX_SUBTASKS = 3;

export const DelegateTaskInput = z.object({
  agent_id: z.string().min(1).max(40).describe('id agen tujuan, misal leads atau proposal'),
  title: z.string().min(3).max(160),
  instructions: z
    .string()
    .min(3)
    .max(6000)
    .describe('Instruksi lengkap, termasuk data dari subtugas sebelumnya bila perlu'),
});

/**
 * Manager-only: creates a subtask for another agent. The manager's run pauses and resumes with
 * the subtask's result once it is finished (reviewed, and executed if it proposed actions).
 */
export const delegateTask = defineTool({
  name: 'delegate_task',
  description:
    'Delegasikan subtugas ke agen lain (khusus Manager, maks 3 per tugas). Setelah memanggil ini kamu akan menunggu sampai hasil subtugas datang.',
  inputSchema: DelegateTaskInput,
  statusText: (input) => `Delegasi ke ${input.agent_id}: ${input.title}`,
  requiresApproval: false,
  async execute(input, ctx) {
    if (!ctx.agent.is_manager)
      throw new ToolError('Hanya Manager yang boleh mendelegasikan tugas.');
    const target = await ctx.db.query<{ name: string; enabled: boolean; is_manager: boolean }>(
      'select name, enabled, is_manager from public.agents where id = $1 and org_id = $2',
      [input.agent_id, ctx.orgId],
    );
    const agent = target.rows[0];
    if (!agent) throw new ToolError(`Agen "${input.agent_id}" tidak ada.`);
    if (agent.is_manager) throw new ToolError('Tidak bisa mendelegasikan ke diri sendiri.');
    if (!agent.enabled) throw new ToolError(`${agent.name} sedang nonaktif.`);
    const existing = await ctx.db.query<{ n: number }>(
      'select count(*)::int as n from public.tasks where parent_task_id = $1',
      [ctx.task.id],
    );
    if ((existing.rows[0]?.n ?? 0) >= MAX_SUBTASKS)
      throw new ToolError(`Batas ${MAX_SUBTASKS} subtugas untuk tugas ini sudah tercapai.`);

    const created = await ctx.db.query<{ id: string }>(
      `insert into public.tasks (org_id, title, instructions, requested_by, assignee_id, assign_mode, parent_task_id, priority)
       values ($1, $2, $3, $4, $5, 'manual', $6, $7) returning id::text`,
      [
        ctx.orgId,
        input.title,
        input.instructions,
        ctx.task.requested_by,
        input.agent_id,
        ctx.task.id,
        ctx.task.priority,
      ],
    );
    const id = created.rows[0]?.id ?? '';
    return {
      content: { subtask_id: id, agent: agent.name, status: 'didelegasikan, menunggu hasil' },
      summary: `Subtugas untuk ${agent.name}: ${input.title}`,
      suspendFor: id,
    };
  },
});
