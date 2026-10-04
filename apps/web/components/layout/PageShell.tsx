import type { ReactNode } from 'react';
import Link from 'next/link';
import { ROLE_LABELS, type Viewer } from '@/lib/auth';

const NAV = [
  { href: '/', label: 'Kantor' },
  { href: '/approvals', label: 'Approval' },
  { href: '/agents', label: 'Agen' },
  { href: '/settings', label: 'Pengaturan' },
];

/** Shared frame for the admin pages (approvals, agents, settings, task detail). */
export function PageShell({
  viewer,
  title,
  active,
  children,
}: {
  viewer: Viewer;
  title: string;
  active: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto grid min-h-full max-w-5xl content-start gap-4 px-4 py-3">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid size-[34px] place-items-center rounded-[9px] bg-navy font-display text-lg font-extrabold text-accent">
            I
          </span>
          <span className="font-display text-lg leading-tight font-extrabold text-navy">
            Intelligo <span className="text-accent">AI Office</span>
          </span>
        </Link>
        <nav
          className="flex flex-wrap items-center gap-1 text-sm font-semibold"
          aria-label="Navigasi"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active === item.href ? 'page' : undefined}
              className="rounded-full px-3 py-1.5 text-muted hover:bg-surface-2 aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form
          action="/auth/signout"
          method="post"
          className="ml-auto flex items-center gap-2 text-xs text-muted"
        >
          <span title={viewer.email}>{ROLE_LABELS[viewer.role]}</span>
          <button
            type="submit"
            className="rounded-full px-2 py-1.5 font-semibold hover:bg-surface-2"
          >
            Keluar
          </button>
        </form>
      </header>
      <h1 className="font-display text-2xl font-extrabold">{title}</h1>
      {children}
    </div>
  );
}
