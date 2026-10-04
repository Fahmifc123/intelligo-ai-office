import { leadsTable, scoreLeads } from '@intelligo/shared';
import { z } from 'zod';
import { readSheetRows } from '../lib/sheets';
import { defineTool } from './types';

export const ScoreLeadsInput = z.object({
  sheet: z.string().min(1).max(80).default('leads').describe('Tab leads di Google Sheet'),
  only: z.enum(['semua', 'panas', 'hangat', 'dingin']).default('semua'),
});

export const scoreLeadsTool = defineTool({
  name: 'score_leads',
  description:
    'Nilai leads dengan rubrik tetap (ukuran perusahaan, budget, kebaruan kontak, kebutuhan, pengambil keputusan) dan kembalikan tabel panas/hangat/dingin.',
  inputSchema: ScoreLeadsInput,
  statusText: 'Skor leads: panas / dingin',
  requiresApproval: false,
  async execute(input, ctx) {
    const scored = scoreLeads(await readSheetRows(ctx.env, input.sheet));
    const selected =
      input.only === 'semua' ? scored : scored.filter((lead) => lead.category === input.only);
    const counts = { panas: 0, hangat: 0, dingin: 0 };
    for (const lead of scored) counts[lead.category] += 1;
    return {
      content: {
        counts,
        table: leadsTable(selected),
        leads: selected.map((l) => ({
          company: l.company,
          industry: l.industry,
          score: l.score,
          category: l.category,
          need: l.need,
          contact_role: l.contactRole,
        })),
      },
      summary: `${scored.length} leads: ${counts.panas} panas, ${counts.hangat} hangat, ${counts.dingin} dingin`,
      external: true,
    };
  },
});
