import { agentsConfig, officeLayout } from '@intelligo/shared';
import { TeamList } from '@/components/panel/TeamList';

const ZONE_LABELS: Record<string, string> = {
  work: 'Area kerja',
  meeting: 'Ruang rapat',
  pantry: 'Pantry & lounge',
};

export default function OfficePage() {
  return (
    <div className="grid h-full grid-rows-[auto_1fr] gap-3 px-4 py-3">
      <header className="flex items-center gap-3">
        <span className="grid size-[34px] place-items-center rounded-[9px] bg-navy font-display text-lg font-extrabold text-accent">
          I
        </span>
        <div>
          <h1 className="font-display text-lg leading-tight font-extrabold text-navy">
            Intelligo <span className="text-accent">AI Office</span>
          </h1>
          <p className="text-[11px] font-semibold tracking-wide text-muted">KANTOR AI · BANDUNG</p>
        </div>
      </header>

      <main className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section
          aria-label="Kantor"
          className="flex min-h-[65vw] flex-col justify-between rounded-2xl border border-line bg-surface p-4 lg:min-h-0"
        >
          <div>
            <h2 className="font-display text-base font-semibold">Denah kantor</h2>
            <p className="mt-1 text-sm text-muted">
              Grid {officeLayout.grid.w} x {officeLayout.grid.h} tile, {officeLayout.desks.length}{' '}
              meja.
            </p>
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-3">
            {officeLayout.zones.map((zone) => (
              <li key={zone.id} className="rounded-xl bg-surface-2 p-3">
                <span className="block text-sm font-semibold">
                  {ZONE_LABELS[zone.id] ?? zone.id}
                </span>
                <span className="block text-xs text-muted">
                  {zone.rect[2]} x {zone.rect[3]} tile
                </span>
              </li>
            ))}
          </ul>
        </section>

        <aside
          aria-label="Panel operasional"
          className="min-h-0 overflow-auto rounded-2xl border border-line bg-surface p-4"
        >
          <h2 className="font-display text-base font-semibold">Tim</h2>
          <p className="mb-2 text-xs text-muted">{agentsConfig.length} karyawan AI</p>
          <TeamList agents={agentsConfig} />
        </aside>
      </main>
    </div>
  );
}
