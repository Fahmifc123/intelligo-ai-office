import type { WorkerEnv } from '@intelligo/shared';
import { z } from 'zod';
import { ToolError } from '../tools/types';
import { callN8n, N8nConfigError } from './n8n';

const SheetResponse = z.object({ rows: z.array(z.record(z.string(), z.unknown())) });

/** Reads rows from Google Sheets through the n8n `sheet-read` workflow. */
export async function readSheetRows(
  env: Pick<WorkerEnv, 'N8N_BASE_URL' | 'N8N_WEBHOOK_SECRET'>,
  sheet: string,
  range?: string,
): Promise<Record<string, unknown>[]> {
  let result;
  try {
    result = await callN8n(env, 'sheet-read', { sheet, ...(range ? { range } : {}) });
  } catch (error) {
    if (error instanceof N8nConfigError)
      throw new ToolError('Integrasi Google Sheet (n8n) belum dikonfigurasi.');
    throw new ToolError(
      `Gagal membaca sheet: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!result.ok)
    throw new ToolError(`Sheet "${sheet}" tidak bisa dibaca (HTTP ${result.status}).`);
  const parsed = SheetResponse.safeParse(result.body);
  if (!parsed.success)
    throw new ToolError('Format balasan sheet-read tidak sesuai ({ rows: [...] }).');
  return parsed.data.rows;
}
