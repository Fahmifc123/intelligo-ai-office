import { AnalysisError, AnalysisSpec, runAnalysis as analyze } from '@intelligo/shared';
import { z } from 'zod';
import { readSheetRows } from '../lib/sheets';
import { defineTool, ToolError } from './types';

export const RunAnalysisInput = AnalysisSpec.extend({
  sheet: z.string().min(1).max(80).describe('Tab sumber data, misal "pembayaran"'),
});

export const runAnalysisTool = defineTool({
  name: 'run_analysis',
  description:
    'Agregasi data sheet di worker: sum, count, average, group_by, atau trend per bulan/minggu. Tidak menjalankan kode bebas.',
  inputSchema: RunAnalysisInput,
  statusText: (input) => `Analisis ${input.operation} sheet ${input.sheet}`,
  requiresApproval: false,
  async execute(input, ctx) {
    const { sheet, ...spec } = input;
    const rows = await readSheetRows(ctx.env, sheet);
    try {
      const result = analyze(rows, spec);
      return { content: { sheet, ...result }, summary: result.summary, external: true };
    } catch (error) {
      if (error instanceof AnalysisError) throw new ToolError(error.message);
      throw error;
    }
  },
});
