import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  link: 'Link masuk tidak valid atau sudah kedaluwarsa. Minta link baru.',
  member: 'Akun Anda belum terdaftar di organisasi ini.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getViewer()) redirect('/');
  const { error } = await searchParams;
  return (
    <main className="grid min-h-full place-items-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-[34px] place-items-center rounded-[9px] bg-navy font-display text-lg font-extrabold text-accent">
            I
          </span>
          <div>
            <h1 className="font-display text-lg leading-tight font-extrabold text-navy">
              Intelligo <span className="text-accent">AI Office</span>
            </h1>
            <p className="text-xs text-muted">Masuk dengan link yang dikirim ke email Anda.</p>
          </div>
        </div>
        <LoginForm error={error ? ERRORS[error] : undefined} />
      </div>
    </main>
  );
}
