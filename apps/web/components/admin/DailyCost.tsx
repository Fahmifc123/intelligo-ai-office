import { formatIdr, formatTokens, formatUsd } from '@/lib/format';
import type { DayUsage } from '@/lib/admin/queries';

/** Cost per day (WIB) for the last two weeks. */
export function DailyCost({ days, rate }: { days: DayUsage[]; rate: number }) {
  const max = Math.max(...days.map((d) => d.cost_usd), 0.000001);
  if (days.length === 0) return <p className="text-sm text-muted">Belum ada pemakaian model.</p>;
  return (
    <table className="w-full text-left text-sm" aria-label="Biaya per hari">
      <thead className="text-xs text-muted">
        <tr>
          <th className="py-1.5 font-semibold">Tanggal</th>
          <th className="py-1.5 font-semibold">Biaya</th>
          <th className="hidden py-1.5 font-semibold sm:table-cell">Token input / output</th>
          <th className="py-1.5 text-right font-semibold">Panggilan</th>
        </tr>
      </thead>
      <tbody>
        {days.map((day) => (
          <tr key={day.day} className="border-t border-line">
            <td className="py-1.5 font-mono text-xs">{day.day}</td>
            <td className="py-1.5">
              <span className="flex items-center gap-2">
                <span
                  className="block h-1.5 rounded-full bg-accent"
                  style={{ width: `${Math.max(4, (day.cost_usd / max) * 120)}px` }}
                  aria-hidden
                />
                {formatUsd(day.cost_usd)}{' '}
                <span className="text-xs text-muted">({formatIdr(day.cost_usd * rate)})</span>
              </span>
            </td>
            <td className="hidden py-1.5 text-xs text-muted sm:table-cell">
              {formatTokens(day.input_tokens)} / {formatTokens(day.output_tokens)}
            </td>
            <td className="py-1.5 text-right tabular-nums">{day.calls}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
