import { z } from 'zod';

/** Reads a number from sheet cells like "120.000.000", "Rp 50jt", or 320. */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  const text = value.toLowerCase().replace(/rp|\s/g, '');
  const multiplier = /jt|juta/.test(text) ? 1_000_000 : /rb|ribu|k$/.test(text) ? 1_000 : 1;
  const digits = text.replace(/[^\d,]/g, '').replace(',', '.');
  const parsed = Number.parseFloat(digits);
  return Number.isFinite(parsed) ? parsed * multiplier : 0;
}

const pick = (row: Record<string, unknown>, keys: readonly string[]): unknown => {
  for (const key of keys) {
    const found = Object.keys(row).find((k) => k.toLowerCase().replace(/[\s_-]/g, '') === key);
    if (found !== undefined) return row[found];
  }
  return undefined;
};

/** Accepts the common column names of a leads sheet (Indonesian or English). */
export const LeadRow = z.record(z.string(), z.unknown()).transform((row) => ({
  company: String(pick(row, ['company', 'perusahaan', 'nama', 'instansi']) ?? '-'),
  industry: String(pick(row, ['industry', 'industri', 'sektor']) ?? '-'),
  employees: toNumber(pick(row, ['employees', 'karyawan', 'jumlahkaryawan'])),
  contactRole: String(pick(row, ['contactrole', 'jabatan', 'role', 'kontak']) ?? ''),
  budget: toNumber(pick(row, ['budgetidr', 'budget', 'anggaran'])),
  need: String(pick(row, ['need', 'kebutuhan', 'catatan']) ?? ''),
  lastContactDays: toNumber(pick(row, ['lastcontactdays', 'harisejakkontak', 'lastcontact'])),
  source: String(pick(row, ['source', 'sumber']) ?? '-'),
}));
export type LeadRow = z.infer<typeof LeadRow>;

const STRONG_NEED =
  /pelatihan|training|machine learning|dashboard|otomasi|automation|n8n|analisis|forecast|in-house/;
const DECISION_MAKER = /head|manager|vp|kabag|kepala|director|direktur|founder|ceo|cto|hr/;

export type LeadCategory = 'panas' | 'hangat' | 'dingin';

export interface ScoredLead extends LeadRow {
  score: number;
  category: LeadCategory;
  reasons: string[];
}

/**
 * Fixed scoring rubric (SPEC 10: score_leads). Max 100:
 * size 25, budget 30, recency 20, need 15, decision maker 10.
 * Panas >= 70, hangat >= 40, else dingin.
 */
export function scoreLead(lead: LeadRow): ScoredLead {
  const reasons: string[] = [];
  const size =
    lead.employees >= 500 ? 25 : lead.employees >= 100 ? 15 : lead.employees >= 20 ? 5 : 0;
  if (size) reasons.push(`${lead.employees} karyawan`);
  const budget =
    lead.budget >= 100_000_000
      ? 30
      : lead.budget >= 50_000_000
        ? 20
        : lead.budget >= 10_000_000
          ? 10
          : 0;
  if (budget) reasons.push('budget memadai');
  const recency =
    lead.lastContactDays <= 7
      ? 20
      : lead.lastContactDays <= 14
        ? 10
        : lead.lastContactDays <= 30
          ? 5
          : 0;
  if (recency >= 10) reasons.push(`kontak ${lead.lastContactDays} hari lalu`);
  const need = STRONG_NEED.test(lead.need.toLowerCase()) ? 15 : 0;
  if (need) reasons.push('kebutuhan pelatihan jelas');
  const decider = DECISION_MAKER.test(lead.contactRole.toLowerCase()) ? 10 : 0;
  if (decider) reasons.push('kontak pengambil keputusan');
  const score = size + budget + recency + need + decider;
  const category: LeadCategory = score >= 70 ? 'panas' : score >= 40 ? 'hangat' : 'dingin';
  return { ...lead, score, category, reasons };
}

export function scoreLeads(rows: readonly Record<string, unknown>[]): ScoredLead[] {
  return rows
    .map((row) => scoreLead(LeadRow.parse(row)))
    .sort((a, b) => b.score - a.score || a.company.localeCompare(b.company));
}

/** Markdown table for the agent's result and the task card. */
export function leadsTable(leads: readonly ScoredLead[]): string {
  const lines = ['| Perusahaan | Skor | Kategori | Alasan |', '|---|---:|---|---|'];
  for (const lead of leads)
    lines.push(
      `| ${lead.company} | ${lead.score} | ${lead.category} | ${lead.reasons.join(', ') || '-'} |`,
    );
  return lines.join('\n');
}
