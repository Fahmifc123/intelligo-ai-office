import { TASK_STATUS_LABELS, TaskStatus } from '@intelligo/shared';
import { z } from 'zod';
import { defineTool } from './types';

export const ListTasksInput = z.object({
  scope: z
    .enum(['active', 'recent'])
    .default('active')
    .describe('active: belum selesai, recent: 20 tugas terakhir'),
  assignee: z.string().max(40).optional().describe('Filter id agen, misal writer'),
});

const Row = z.object({
  id: z.string(),
  title: z.string(),
  assignee_id: z.string().nullable(),
  status: TaskStatus,
  priority: z.number(),
});

export const listTasks = defineTool({
  name: 'list_tasks',
  description:
    'Lihat daftar tugas tim (yang sedang berjalan atau yang terbaru) beserta penanggung jawab dan statusnya.',
  inputSchema: ListTasksInput,
  statusText: 'Cek papan tugas',
  requiresApproval: false,
  async execute(input, ctx) {
    const result = await ctx.db.query(
      `select id::text, title, assignee_id, status, priority from public.tasks
        where org_id = $1
          and ($2 = 'recent' or status not in ('done', 'failed', 'cancelled'))
          and ($3::text is null or assignee_id = $3)
        order by created_at desc limit 20`,
      [ctx.orgId, input.scope, input.assignee ?? null],
    );
    const tasks = result.rows.map((row) => Row.parse(row));
    return {
      content: {
        tasks: tasks.map((t) => ({
          id: t.id.slice(0, 8),
          title: t.title,
          assignee: t.assignee_id,
          status: TASK_STATUS_LABELS[t.status],
          priority: t.priority,
        })),
      },
      summary: `${tasks.length} tugas`,
    };
  },
});
