import {
  ACTION_KIND_LABELS,
  ActionRow,
  isTerminal,
  ReviewRow,
  SettingsRow,
  TaskEventRow,
  TaskRow,
} from '@intelligo/shared';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { LiveRefresh } from '@/components/admin/LiveRefresh';
import { TaskTimeline } from '@/components/admin/TaskTimeline';
import { ActionPreview } from '@/components/approvals/ActionPreview';
import { PageShell } from '@/components/layout/PageShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { requireViewer } from '@/lib/auth';
import { formatDateTimeWib, formatIdr, formatTokens, formatUsd } from '@/lib/format';
import { getServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const list = <T,>(schema: z.ZodType<T>, rows: unknown): T[] =>
  (Array.isArray(rows) ? rows : []).flatMap((row) => {
    const parsed = schema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });

const Num = z.union([z.number(), z.string()]).pipe(z.coerce.number());
const TaskUsage = z.object({ cost_usd: Num, input_tokens: Num, output_tokens: Num, calls: Num });

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4" aria-label={title}>
      <h2 className="mb-3 font-display text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const supabase = await getServerSupabase();
  const { data: taskData } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle();
  const parsedTask = TaskRow.safeParse(taskData);
  if (!parsedTask.success) notFound();
  const task = parsedTask.data;

  const [events, reviews, actions, usage, children, agents, settings] = await Promise.all([
    supabase.from('task_events').select('*').eq('task_id', id).order('id'),
    supabase.from('reviews').select('*').eq('task_id', id).order('created_at'),
    supabase.from('actions').select('*').eq('task_id', id).order('created_at'),
    supabase
      .from('usage_by_task')
      .select('cost_usd, input_tokens, output_tokens, calls')
      .eq('task_id', id)
      .maybeSingle(),
    supabase.from('tasks').select('*').eq('parent_task_id', id).order('created_at'),
    supabase.from('agents').select('id, name, role'),
    supabase.from('settings').select('*').maybeSingle(),
  ]);
  const names = Object.fromEntries((agents.data ?? []).map((a) => [String(a.id), String(a.name)]));
  const rate = SettingsRow.safeParse(settings.data).data?.usd_to_idr ?? 16000;
  const cost = TaskUsage.safeParse(usage.data).data;
  const subtasks = list(TaskRow, children.data);
  const documents = z
    .object({ documents: z.array(z.object({ title: z.string(), url: z.string() })) })
    .safeParse(task.result_json);
  const manualCheck =
    (task.result_json as { manual_check?: unknown } | null)?.manual_check === true;

  return (
    <PageShell viewer={viewer} title={task.title} active="">
      <LiveRefresh active={!isTerminal(task.status)} />
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <StatusBadge status={task.status} />
        <span>
          {task.assignee_id
            ? `${names[task.assignee_id] ?? task.assignee_id}`
            : 'Belum ada penerima'}
        </span>
        <span>· dibuat {formatDateTimeWib(task.created_at)}</span>
        {task.finished_at ? <span>· selesai {formatDateTimeWib(task.finished_at)}</span> : null}
        {task.revision_count > 0 ? <span>· revisi {task.revision_count}x</span> : null}
        {task.parent_task_id ? (
          <Link className="font-semibold text-accent" href={`/tasks/${task.parent_task_id}`}>
            · Tugas induk
          </Link>
        ) : null}
      </div>

      {task.instructions && task.instructions !== task.title ? (
        <Section title="Instruksi">
          <p className="text-sm whitespace-pre-wrap">{task.instructions}</p>
        </Section>
      ) : null}

      <Section title="Hasil">
        {manualCheck ? (
          <p className="mb-2 text-sm font-semibold text-warn">
            Perlu cek manual: batas revisi tercapai.
          </p>
        ) : null}
        {task.error ? <p className="mb-2 text-sm text-accent">{task.error}</p> : null}
        {task.result_text ? (
          <p className="text-sm whitespace-pre-wrap" data-testid="task-final-result">
            {task.result_text}
          </p>
        ) : (
          <p className="text-sm text-muted">Belum ada hasil.</p>
        )}
        {documents.success ? (
          <ul className="mt-3 grid gap-1 text-sm">
            {documents.data.documents.map((doc) => (
              <li key={doc.url}>
                <a
                  className="font-semibold text-accent"
                  href={doc.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {doc.title}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      {subtasks.length > 0 ? (
        <Section title="Subtugas">
          <ul className="grid gap-2">
            {subtasks.map((sub) => (
              <li
                key={sub.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <Link className="font-semibold text-accent" href={`/tasks/${sub.id}`}>
                  {names[sub.assignee_id ?? ''] ?? '?'}: {sub.title}
                </Link>
                <StatusBadge status={sub.status} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {list(ReviewRow, reviews.data).length > 0 ? (
        <Section title="Review">
          <ul className="grid gap-2 text-sm">
            {list(ReviewRow, reviews.data).map((review) => (
              <li key={review.id}>
                <span className="font-semibold">
                  {review.verdict === 'approved' ? 'Disetujui' : 'Perlu revisi'}
                </span>{' '}
                ({formatDateTimeWib(review.created_at)}): {review.notes}
                {review.scores ? (
                  <span className="text-muted">
                    {' '}
                    · akurasi {review.scores.accuracy}/5, nada {review.scores.tone}/5, kelengkapan{' '}
                    {review.scores.completeness}/5
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {list(ActionRow, actions.data).length > 0 ? (
        <Section title="Aksi eksternal">
          <ul className="grid gap-4">
            {list(ActionRow, actions.data).map((action) => (
              <li key={action.id} className="grid gap-2">
                <p className="text-sm font-semibold">
                  {ACTION_KIND_LABELS[action.kind]} ·{' '}
                  <span className="text-muted">{action.status}</span>
                  {action.error ? <span className="text-accent"> · {action.error}</span> : null}
                </p>
                <ActionPreview kind={action.kind} payload={action.payload} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Biaya token">
        {cost ? (
          <p className="text-sm" data-testid="task-cost">
            {formatUsd(cost.cost_usd)} ({formatIdr(cost.cost_usd * rate)}) ·{' '}
            {formatTokens(cost.input_tokens)} token input, {formatTokens(cost.output_tokens)} token
            output · {cost.calls} panggilan model
          </p>
        ) : (
          <p className="text-sm text-muted">Belum ada pemakaian model.</p>
        )}
      </Section>

      <Section title="Timeline">
        <TaskTimeline events={list(TaskEventRow, events.data)} names={names} />
      </Section>
    </PageShell>
  );
}
