import Image from 'next/image';

/** Logo files are 597 x 120 (public/brand); the dark variant swaps navy for white. */
const LOGO_WIDTH = 597;
const LOGO_HEIGHT = 120;

/** Intelligo.id logo followed by the product name, used in every page header. */
export function BrandLogo({ tagline }: { tagline?: string }) {
  return (
    <span className="flex items-center gap-3">
      <Image
        src="/brand/intelligo-logo.png"
        alt="Intelligo.id"
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        priority
        className="h-7 w-auto dark:hidden"
      />
      <Image
        src="/brand/intelligo-logo-dark.png"
        alt="Intelligo.id"
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        priority
        className="hidden h-7 w-auto dark:block"
      />
      <span className="border-l border-line pl-3">
        <span className="block font-display text-lg leading-tight font-extrabold text-accent">
          AI Office
        </span>
        {tagline ? (
          <span className="block text-[11px] font-semibold tracking-wide text-muted">
            {tagline}
          </span>
        ) : null}
      </span>
    </span>
  );
}
