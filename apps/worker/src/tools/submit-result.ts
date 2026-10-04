import { z } from 'zod';
import { defineTool } from './types';

export const SubmitResultInput = z.object({
  summary: z.string().min(1).max(400).describe('Ringkasan hasil dalam 1-2 kalimat'),
  content: z.string().min(1).describe('Hasil final yang siap dipakai'),
  format: z.enum(['text', 'markdown']).default('markdown'),
});
export type SubmitResultInput = z.infer<typeof SubmitResultInput>;

/** Ends the run; the runner stores the result and moves the task on. */
export const submitResult = defineTool({
  name: 'submit_result',
  description:
    'Kirim hasil akhir tugas. Panggil tepat sekali ketika hasil sudah final. content berisi hasil lengkap yang siap dipakai owner.',
  inputSchema: SubmitResultInput,
  statusText: 'Menyerahkan hasil',
  requiresApproval: false,
  async execute(input) {
    return { content: { ok: true }, summary: `Hasil diserahkan: ${input.summary}` };
  },
});
