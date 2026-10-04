import { z } from 'zod';
import { searchKnowledge as search } from '../knowledge/search';
import { defineTool } from './types';

export const SearchKnowledgeInput = z.object({
  query: z.string().min(2).max(300).describe('Kata kunci, misal "harga bootcamp batch 21"'),
  tags: z
    .array(z.string().max(40))
    .max(5)
    .optional()
    .describe('Filter tag opsional: harga, program, sop-cs, billing'),
});

export const searchKnowledge = defineTool({
  name: 'search_knowledge',
  description:
    'Cari dokumen internal Intelligo ID (harga, program, jadwal, SOP). Wajib dipakai sebelum menyebut harga, jadwal, atau angka.',
  inputSchema: SearchKnowledgeInput,
  statusText: (input) => `Cari info: ${input.query}`,
  requiresApproval: false,
  async execute(input, ctx) {
    const docs = await search(ctx.db, ctx.orgId, input.query, input.tags ?? []);
    if (docs.length === 0) {
      return {
        content: {
          results: [],
          note: 'Tidak ada dokumen yang cocok. Gunakan placeholder seperti [harga] atau [tanggal].',
        },
        summary: `Tidak ada dokumen untuk "${input.query}"`,
      };
    }
    return {
      content: {
        results: docs.map((doc) => ({
          title: doc.title,
          tags: doc.tags,
          content: doc.content.slice(0, 2000),
        })),
      },
      summary: `${docs.length} dokumen: ${docs.map((d) => d.title).join(', ')}`,
    };
  },
});
