'use client';

import {
  TOOL_LABELS,
  TOOL_NAMES,
  type AgentRow,
  type MemberRole,
  type ToolName,
} from '@intelligo/shared';
import { useState, useTransition } from 'react';
import { updateAgent } from '@/app/actions/admin';
import { Avatar } from '@/components/ui/Avatar';
import { formatIdr, formatTokens, formatUsd } from '@/lib/format';

interface Usage {
  input_tokens: number;
  cost_usd: number;
  calls: number;
}

function AgentRowEditor({
  agent,
  usage,
  role,
  rate,
}: {
  agent: AgentRow;
  usage: Usage | undefined;
  role: MemberRole;
  rate: number;
}) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(agent.enabled);
  const [budget, setBudget] = useState(
    agent.monthly_token_budget === null ? '' : String(agent.monthly_token_budget),
  );
  const [prompt, setPrompt] = useState(agent.system_prompt);
  const [tools, setTools] = useState<Set<ToolName>>(new Set(agent.tools));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const isOwner = role === 'owner';
  const used = usage?.input_tokens ?? 0;
  const percent = agent.monthly_token_budget
    ? Math.min(100, Math.round((used / agent.monthly_token_budget) * 100))
    : 0;

  const save = (): void => {
    setMessage(null);
    startTransition(async () => {
      const result = await updateAgent(agent.id, {
        enabled,
        system_prompt: prompt,
        tools: [...tools],
        monthly_token_budget: budget.trim() === '' ? null : Number(budget),
      });
      setMessage(result.ok ? { ok: true, text: 'Tersimpan.' } : { ok: false, text: result.error });
    });
  };

  return (
    <li className="rounded-2xl border border-line bg-surface p-4" data-testid={`agent-${agent.id}`}>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="flex items-center gap-3">
          <Avatar name={agent.name} color={agent.appearance.shirt} />
          <div className="min-w-0">
            <p className="font-semibold">
              {agent.name} · {agent.role}
              {!agent.enabled ? (
                <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                  Nonaktif
                </span>
              ) : null}
            </p>
            <p className="text-xs text-muted">{agent.focus}</p>
          </div>
        </div>
        <div className="grid gap-1 text-right text-xs">
          <span>
            {formatTokens(used)}{' '}
            {agent.monthly_token_budget ? `/ ${formatTokens(agent.monthly_token_budget)}` : ''}{' '}
            token input bulan ini
          </span>
          {agent.monthly_token_budget ? (
            <span
              className="ml-auto block h-1.5 w-40 overflow-hidden rounded-full bg-surface-2"
              aria-label={`${percent}% budget terpakai`}
            >
              <span
                className={`block h-full ${percent >= 90 ? 'bg-accent' : 'bg-ok'}`}
                style={{ width: `${percent}%` }}
              />
            </span>
          ) : null}
          <span className="text-muted">
            {formatUsd(usage?.cost_usd ?? 0)} ({formatIdr((usage?.cost_usd ?? 0) * rate)}) ·{' '}
            {usage?.calls ?? 0} panggilan
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-3 text-xs font-semibold text-accent"
        aria-expanded={open}
      >
        {open ? 'Tutup' : isOwner ? 'Ubah agen' : 'Lihat detail'}
      </button>
      {open ? (
        <fieldset disabled={!isOwner || pending} className="mt-3 grid gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />{' '}
            Aktif
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            Budget token input per bulan (kosong = tanpa batas)
            <input
              inputMode="numeric"
              value={budget}
              onChange={(e) => setBudget(e.target.value.replace(/[^\d]/g, ''))}
              className="w-48 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm font-normal"
              aria-label="Budget token bulanan"
            />
          </label>
          <div className="grid gap-1">
            <p className="text-xs font-semibold">Tools yang diizinkan</p>
            <div className="flex flex-wrap gap-1.5">
              {TOOL_NAMES.filter(
                (name) =>
                  name !== 'submit_result' && (agent.is_manager || name !== 'delegate_task'),
              ).map((name) => (
                <label
                  key={name}
                  className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={tools.has(name)}
                    onChange={(e) =>
                      setTools((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(name);
                        else next.delete(name);
                        return next;
                      })
                    }
                  />
                  <span className="font-mono">{name}</span>
                  <span className="text-muted">({TOOL_LABELS[name]})</span>
                </label>
              ))}
            </div>
          </div>
          <label className="grid gap-1 text-xs font-semibold">
            System prompt ({'{knowledge_snippets}'} diisi otomatis dengan dokumen yang relevan)
            <textarea
              rows={14}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 font-mono text-xs font-normal"
            />
          </label>
          {isOwner ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={save}
                className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-ink disabled:opacity-50"
              >
                {pending ? 'Menyimpan...' : 'Simpan'}
              </button>
              {message ? (
                <span role="status" className={`text-sm ${message.ok ? 'text-ok' : 'text-accent'}`}>
                  {message.text}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-muted">Hanya Owner yang bisa mengubah agen.</p>
          )}
        </fieldset>
      ) : null}
    </li>
  );
}

export function AgentsAdmin({
  agents,
  usage,
  role,
  rate,
}: {
  agents: AgentRow[];
  usage: Record<string, Usage>;
  role: MemberRole;
  rate: number;
}) {
  return (
    <ul className="grid gap-3" aria-label="Daftar agen">
      {agents.map((agent) => (
        <AgentRowEditor
          key={agent.id}
          agent={agent}
          usage={usage[agent.id]}
          role={role}
          rate={rate}
        />
      ))}
    </ul>
  );
}
