'use client';

import type { KnowledgeDocRow, MemberRole } from '@intelligo/shared';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deleteKnowledgeDoc, saveKnowledgeDoc } from '@/app/actions/admin';

interface Draft {
  id?: string;
  title: string;
  tags: string;
  content: string;
}

const EMPTY: Draft = { title: '', tags: '', content: '' };

export function KnowledgeManager({ docs, role }: { docs: KnowledgeDocRow[]; role: MemberRole }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isOwner = role === 'owner';

  const save = (): void => {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const result = await saveKnowledgeDoc({
        ...(draft.id ? { id: draft.id } : {}),
        title: draft.title,
        content: draft.content,
        tags: draft.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft(null);
      router.refresh();
    });
  };

  const remove = (id: string): void => {
    startTransition(async () => {
      const result = await deleteKnowledgeDoc(id);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  };

  return (
    <div className="grid gap-3">
      <ul className="divide-y divide-line" aria-label="Dokumen knowledge base">
        {docs.map((doc) => (
          <li
            key={doc.id}
            className="flex flex-wrap items-start justify-between gap-2 py-2"
            data-testid="knowledge-doc"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold">{doc.title}</p>
              <p className="text-xs text-muted">
                {doc.tags.length ? doc.tags.join(', ') : 'tanpa tag'} ·{' '}
                {doc.content.length.toLocaleString('id-ID')} karakter
              </p>
            </div>
            {isOwner ? (
              <div className="flex gap-2 text-xs font-semibold">
                <button
                  type="button"
                  className="text-accent"
                  onClick={() =>
                    setDraft({
                      id: doc.id,
                      title: doc.title,
                      tags: doc.tags.join(', '),
                      content: doc.content,
                    })
                  }
                >
                  Ubah
                </button>
                <button
                  type="button"
                  className="text-muted hover:text-accent"
                  disabled={pending}
                  onClick={() => remove(doc.id)}
                >
                  Hapus
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {isOwner && !draft ? (
        <button
          type="button"
          onClick={() => setDraft(EMPTY)}
          className="justify-self-start rounded-full border border-line px-3 py-1.5 text-sm font-semibold"
        >
          Tambah dokumen
        </button>
      ) : null}
      {draft ? (
        <fieldset disabled={pending} className="grid gap-2 rounded-xl border border-line p-3">
          <label className="grid gap-1 text-xs font-semibold">
            Judul
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm font-normal"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            Tag (pisahkan dengan koma, misal harga, program, sop-cs)
            <input
              value={draft.tags}
              onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
              className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm font-normal"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            Isi (markdown)
            <textarea
              rows={10}
              value={draft.content}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 font-mono text-xs font-normal"
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-accent">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-ink"
            >
              Simpan dokumen
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold"
            >
              Batal
            </button>
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
