import { z } from 'zod';
import { appendDraft } from '../state/tasks';
import { defineTool } from './types';

export const SaveDraftInput = z.object({
  title: z.string().min(1).max(160),
  content: z.string().min(1).max(20_000),
  channel: z.string().max(40).optional().describe('Misal instagram, blog, email, iklan'),
});

export const saveDraft = defineTool({
  name: 'save_draft',
  description:
    'Simpan draft (caption, artikel, copy iklan) ke tugas ini supaya bisa dipakai ulang. Tidak mengirim apa pun keluar.',
  inputSchema: SaveDraftInput,
  statusText: (input) => `Simpan draft: ${input.title}`,
  requiresApproval: false,
  async execute(input, ctx) {
    const count = await appendDraft(ctx.db, ctx.task.id, {
      ...input,
      saved_at: new Date().toISOString(),
      agent_id: ctx.agent.id,
    });
    return { content: { saved: true, drafts: count }, summary: `Draft "${input.title}" disimpan` };
  },
});
