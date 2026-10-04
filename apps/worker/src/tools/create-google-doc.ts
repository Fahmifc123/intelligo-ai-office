import { z } from 'zod';
import { callN8n, N8nConfigError } from '../lib/n8n';
import { defineTool, ToolError } from './types';

export const CreateGoogleDocInput = z.object({
  title: z.string().min(1).max(160),
  markdown: z.string().min(1).max(60_000).describe('Isi dokumen dalam markdown'),
});

const DocResponse = z.object({ url: z.url(), document_id: z.string().optional() });

/** Internal document (no approval needed) but recorded on the task (SPEC 10). */
export const createGoogleDoc = defineTool({
  name: 'create_google_doc',
  description:
    'Buat Google Doc internal dari markdown (proposal, silabus, laporan) dan kembalikan link-nya.',
  inputSchema: CreateGoogleDocInput,
  statusText: (input) => `Buat Google Doc: ${input.title}`,
  requiresApproval: false,
  async execute(input, ctx) {
    let result;
    try {
      result = await callN8n(ctx.env, 'doc-create', { ...input, task_id: ctx.task.id });
    } catch (error) {
      if (error instanceof N8nConfigError)
        throw new ToolError('Integrasi Google Docs (n8n) belum dikonfigurasi.');
      throw new ToolError(
        `Gagal membuat dokumen: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const doc = DocResponse.safeParse(result.body);
    if (!result.ok || !doc.success)
      throw new ToolError(`Dokumen gagal dibuat (HTTP ${result.status}).`);
    await ctx.db.query(
      `update public.tasks set result_json = jsonb_set(coalesce(result_json, '{}'::jsonb), '{documents}',
         coalesce(result_json -> 'documents', '[]'::jsonb) || jsonb_build_array($2::jsonb)) where id = $1`,
      [ctx.task.id, JSON.stringify({ title: input.title, url: doc.data.url })],
    );
    return {
      content: { url: doc.data.url, title: input.title },
      summary: `Google Doc dibuat: ${doc.data.url}`,
    };
  },
});
