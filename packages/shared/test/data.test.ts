import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AnalysisError, runAnalysis } from '../src/analysis';
import { leadsTable, LeadRow, scoreLead, scoreLeads } from '../src/leads';

const sheets = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../n8n/sample-data/sheets.json'), 'utf8'),
) as {
  leads: Record<string, unknown>[];
  pembayaran: Record<string, unknown>[];
};

describe('score_leads rubric', () => {
  it('scores the sample leads into panas / hangat / dingin', () => {
    const scored = scoreLeads(sheets.leads);
    const byCompany = Object.fromEntries(scored.map((l) => [l.company, l.category]));
    expect(byCompany['PT Logistik Cepat']).toBe('panas');
    expect(byCompany['PT Fintek Nusantara']).toBe('panas');
    expect(byCompany['Pabrik FMCG Sejahtera']).toBe('panas');
    expect(byCompany['Startup Edukasi Kita']).toBe('dingin');
    expect(byCompany['Mahasiswa (salah isi form)']).toBe('dingin');
    expect(scored[0]?.score).toBeGreaterThanOrEqual(scored.at(-1)?.score ?? 0);
  });

  it('caps at 100 and understands Indonesian column names and amounts', () => {
    const lead = scoreLead(
      LeadRow.parse({
        perusahaan: 'PT A',
        karyawan: '1.200',
        anggaran: 'Rp 150jt',
        kebutuhan: 'pelatihan dashboard',
        jabatan: 'Direktur',
        'hari sejak kontak': 1,
      }),
    );
    expect(lead.score).toBe(100);
    expect(lead.category).toBe('panas');
  });

  it('renders a markdown table', () => {
    expect(leadsTable(scoreLeads(sheets.leads.slice(0, 1)))).toContain('| PT Fintek Nusantara |');
  });
});

describe('run_analysis', () => {
  it('sums, counts and averages', () => {
    expect(runAnalysis(sheets.pembayaran, { operation: 'count' }).rows[0]?.value).toBe(7);
    expect(
      runAnalysis(sheets.pembayaran, { operation: 'sum', value_column: 'amount_idr' }).rows[0]
        ?.value,
    ).toBe(74_700_000);
    expect(
      runAnalysis(sheets.pembayaran, {
        operation: 'average',
        value_column: 'amount_idr',
        filter: { column: 'program', equals: 'Private Course' },
      }).rows[0]?.value,
    ).toBe(3_600_000);
  });

  it('groups and trends by month', () => {
    const grouped = runAnalysis(sheets.pembayaran, {
      operation: 'group_by',
      group_column: 'program',
      value_column: 'amount_idr',
    });
    expect(grouped.rows[0]).toEqual({ key: 'Corporate Training', value: 45_000_000, count: 1 });
    const trend = runAnalysis(sheets.pembayaran, {
      operation: 'trend',
      date_column: 'date',
      value_column: 'amount_idr',
    });
    expect(trend.rows.map((r) => r.key)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(trend.rows[2]?.value).toBe(14_850_000);
  });

  it('explains missing columns', () => {
    expect(() =>
      runAnalysis(sheets.pembayaran, { operation: 'sum', value_column: 'omzet' }),
    ).toThrow(AnalysisError);
    expect(() =>
      runAnalysis(sheets.pembayaran, { operation: 'sum', value_column: 'omzet' }),
    ).toThrow(/Kolom tersedia/);
  });
});
