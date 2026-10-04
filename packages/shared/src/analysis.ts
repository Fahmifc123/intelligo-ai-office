import { z } from 'zod';

/** Declarative analysis spec (SPEC 10: run_analysis aggregates in the worker, no free code). */
export const AnalysisSpec = z.object({
  operation: z.enum(['sum', 'count', 'average', 'group_by', 'trend']),
  value_column: z
    .string()
    .optional()
    .describe('Kolom angka untuk sum / average / group_by / trend'),
  group_column: z.string().optional().describe('Kolom pengelompokan untuk group_by'),
  date_column: z.string().optional().describe('Kolom tanggal (YYYY-MM-DD) untuk trend'),
  period: z.enum(['month', 'week']).default('month'),
  filter: z.object({ column: z.string(), equals: z.string() }).optional(),
});
export type AnalysisSpec = z.infer<typeof AnalysisSpec>;

export interface AnalysisResult {
  summary: string;
  rows: { key: string; value: number; count: number }[];
}

export class AnalysisError extends Error {}

const num = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return Number.NaN;
  return Number.parseFloat(
    value
      .replace(/[^\d.,-]/g, '')
      .replace(/\./g, '')
      .replace(',', '.'),
  );
};

function periodKey(date: Date, period: 'month' | 'week'): string {
  if (period === 'month') return date.toISOString().slice(0, 7);
  const monday = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() - ((date.getUTCDay() + 6) % 7),
    ),
  );
  return `minggu ${monday.toISOString().slice(0, 10)}`;
}

export function runAnalysis(
  rows: readonly Record<string, unknown>[],
  input: z.input<typeof AnalysisSpec>,
): AnalysisResult {
  const spec = AnalysisSpec.parse(input);
  const columns = new Set(rows.flatMap((row) => Object.keys(row)));
  const requireColumn = (name: string | undefined, label: string): string => {
    if (!name) throw new AnalysisError(`${label} wajib diisi untuk operasi ${spec.operation}`);
    if (!columns.has(name))
      throw new AnalysisError(
        `Kolom "${name}" tidak ada. Kolom tersedia: ${[...columns].join(', ')}`,
      );
    return name;
  };
  const filtered = spec.filter
    ? rows.filter(
        (row) =>
          String(row[requireColumn(spec.filter?.column, 'filter.column')]) === spec.filter?.equals,
      )
    : [...rows];
  const values = (column: string): number[] =>
    filtered.map((row) => num(row[column])).filter(Number.isFinite);

  switch (spec.operation) {
    case 'count':
      return {
        summary: `${filtered.length} baris`,
        rows: [{ key: 'jumlah', value: filtered.length, count: filtered.length }],
      };
    case 'sum': {
      const column = requireColumn(spec.value_column, 'value_column');
      const total = values(column).reduce((a, b) => a + b, 0);
      return {
        summary: `Total ${column}: ${total}`,
        rows: [{ key: column, value: total, count: filtered.length }],
      };
    }
    case 'average': {
      const column = requireColumn(spec.value_column, 'value_column');
      const list = values(column);
      const average = list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0;
      return {
        summary: `Rata-rata ${column}: ${Math.round(average * 100) / 100}`,
        rows: [{ key: column, value: average, count: list.length }],
      };
    }
    case 'group_by':
    case 'trend': {
      const valueColumn = spec.value_column
        ? requireColumn(spec.value_column, 'value_column')
        : undefined;
      const keyOf =
        spec.operation === 'group_by'
          ? (row: Record<string, unknown>) =>
              String(row[requireColumn(spec.group_column, 'group_column')] ?? '-')
          : (row: Record<string, unknown>) => {
              const date = new Date(String(row[requireColumn(spec.date_column, 'date_column')]));
              return Number.isNaN(date.getTime()) ? 'tanpa tanggal' : periodKey(date, spec.period);
            };
      const groups = new Map<string, { value: number; count: number }>();
      for (const row of filtered) {
        const key = keyOf(row);
        const current = groups.get(key) ?? { value: 0, count: 0 };
        const value = valueColumn ? num(row[valueColumn]) : 1;
        current.value += Number.isFinite(value) ? value : 0;
        current.count += 1;
        groups.set(key, current);
      }
      const result = [...groups.entries()].map(([key, g]) => ({ key, ...g }));
      result.sort((a, b) =>
        spec.operation === 'trend' ? a.key.localeCompare(b.key) : b.value - a.value,
      );
      const label = valueColumn ? `total ${valueColumn}` : 'jumlah baris';
      return { summary: `${result.length} kelompok (${label})`, rows: result };
    }
  }
}
