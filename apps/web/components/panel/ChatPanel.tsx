'use client';

import type { MemberRole } from '@intelligo/shared';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Avatar } from '@/components/ui/Avatar';
import type { AgentSummary } from '@/lib/office/types';
import { getBrowserSupabase } from '@/lib/supabase/client';

interface Line {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
}

const Row = z.object({ id: z.number(), role: z.enum(['user', 'assistant']), content: z.string() });

export function ChatPanel({ agent, role }: { agent: AgentSummary; role: MemberRole }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const canChat = role !== 'viewer';

  useEffect(() => {
    let cancelled = false;
    // RLS returns only this user's own conversation.
    void getBrowserSupabase()
      .from('chat_messages')
      .select('id, role, content')
      .eq('agent_id', agent.id)
      .order('id', { ascending: true })
      .limit(100)
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data ?? []).flatMap((row) => {
          const parsed = Row.safeParse(row);
          return parsed.success ? [{ ...parsed.data, id: String(parsed.data.id) }] : [];
        });
        setLines(rows);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agent.id]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [lines]);

  const send = async (): Promise<void> => {
    const message = draft.trim();
    if (!message || busy || !canChat) return;
    setDraft('');
    setError(null);
    setBusy(true);
    const replyId = `pending-${Date.now()}`;
    setLines((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', content: message },
      { id: replyId, role: 'assistant', content: '', pending: true },
    ]);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentId: agent.id, message }),
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Chat gagal dikirim.');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setLines((prev) =>
          prev.map((line) => (line.id === replyId ? { ...line, content: text } : line)),
        );
      }
      setLines((prev) =>
        prev.map((line) => (line.id === replyId ? { ...line, pending: false } : line)),
      );
    } catch (err) {
      setLines((prev) => prev.filter((line) => line.id !== replyId));
      setError(err instanceof Error ? err.message : 'Chat gagal dikirim.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-[360px] flex-col" data-testid="chat-panel">
      <header className="mb-2 flex items-center gap-2.5">
        <Avatar name={agent.name} color={agent.appearance.shirt} />
        <div>
          <p className="text-sm font-semibold">{agent.name}</p>
          <p className="text-xs text-muted">{agent.role}</p>
        </div>
      </header>
      <ol
        ref={listRef}
        className="min-h-0 flex-1 space-y-2 overflow-auto"
        aria-label={`Chat dengan ${agent.name}`}
        aria-live="polite"
      >
        {loading ? <li className="text-sm text-muted">Memuat riwayat...</li> : null}
        {!loading && lines.length === 0 ? (
          <li className="text-sm text-muted">Belum ada chat. Tanyakan sesuatu ke {agent.name}.</li>
        ) : null}
        {lines.map((line) => (
          <li
            key={line.id}
            data-testid={`chat-${line.role}`}
            className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
              line.role === 'user' ? 'ml-auto bg-accent text-accent-ink' : 'bg-surface-2'
            }`}
          >
            {line.content || (line.pending ? <span className="text-muted">Mengetik...</span> : '')}
          </li>
        ))}
      </ol>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-accent">
          {error}
        </p>
      ) : null}
      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          rows={2}
          disabled={!canChat}
          placeholder={
            canChat ? `Tulis pesan untuk ${agent.name}...` : 'Viewer tidak bisa chat dengan agen.'
          }
          aria-label="Pesan chat"
          className="min-w-0 flex-1 resize-none rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!canChat || busy || draft.trim() === ''}
          className="self-end rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
        >
          Kirim
        </button>
      </form>
    </div>
  );
}
