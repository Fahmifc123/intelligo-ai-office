import { extractJson } from './json';
import type {
  JsonRequest,
  JsonResult,
  LlmClient,
  LlmMessage,
  LlmMessageParam,
  TurnHooks,
  TurnRequest,
} from './types';
import { LlmConfigError } from './types';

/**
 * Deterministic stand-in for the model, for e2e tests and offline demos (LLM_MODE=scripted).
 * It follows the same protocol as the real model (tool_use blocks, submit_result, JSON replies)
 * so every worker path runs unchanged. Refuses to start in production.
 */

const ROUTES: readonly [string, readonly string[]][] = [
  ['socmed', ['jadwal posting', 'kalender konten', 'reels', 'tiktok', 'feed']],
  ['writer', ['caption', 'artikel', 'blog', 'copy', 'headline', 'konten']],
  ['cs', ['balas', 'chat', 'calon peserta', 'tanya', 'whatsapp']],
  ['proposal', ['proposal', 'penawaran', 'quotation', 'rab']],
  ['billing', ['invoice', 'tagih', 'pembayaran', 'cicilan']],
  ['curriculum', ['silabus', 'modul', 'kurikulum', 'materi']],
  ['analyst', ['analisis', 'grafik', 'laporan', 'omzet']],
  ['ads', ['iklan', 'ads', 'budget', 'meta', 'google ads']],
  ['leads', ['lead', 'prospek', 'klien baru', 'hrd']],
  ['scheduler', ['jadwal', 'zoom', 'absensi', 'trainer']],
  ['success', ['survei', 'testimoni', 'alumni', 'kepuasan']],
];

export function routeByKeyword(text: string): string {
  const t = text.toLowerCase();
  for (const [id, keys] of ROUTES) if (keys.some((k) => t.includes(k))) return id;
  return 'manager';
}

const between = (text: string, open: string, close: string): string => {
  const start = text.indexOf(open);
  if (start === -1) return '';
  const end = text.indexOf(close, start + open.length);
  return text.slice(start + open.length, end === -1 ? undefined : end).trim();
};

const PRICE = /Rp\s?\d{1,3}(?:[.,]\d{3})+/g;
const digits = (s: string): string => s.replace(/\D/g, '');

/** Marker that makes the scripted writer invent a price (Fase 3 acceptance test). */
export const FABRICATED_PRICE_MARKER = 'harga karangan';
const FABRICATED_PRICE = 'Rp 1.250.000';

let sequence = 0;

function makeMessage(
  model: string,
  content: LlmMessage['content'],
  stopReason: LlmMessage['stop_reason'],
  inputChars: number,
): LlmMessage {
  sequence += 1;
  const outputChars = JSON.stringify(content).length;
  return {
    id: `msg_scripted_${sequence}`,
    type: 'message',
    role: 'assistant',
    model,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    stop_details: null,
    container: null,
    context_management: null,
    usage: {
      input_tokens: Math.max(1, Math.ceil(inputChars / 4)),
      output_tokens: Math.max(1, Math.ceil(outputChars / 4)),
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_creation: null,
      inference_geo: null,
      server_tool_use: null,
      service_tier: null,
      fallback_credit: null,
      iterations: null,
      output_tokens_details: null,
      speed: null,
    },
  } as unknown as LlmMessage;
}

function textOf(message: LlmMessageParam): string {
  if (typeof message.content === 'string') return message.content;
  return message.content
    .map((block) => {
      if (block.type === 'text') return block.text;
      if (block.type === 'tool_result') {
        if (typeof block.content === 'string') return block.content;
        return (block.content ?? [])
          .map((part) => (part.type === 'text' ? part.text : ''))
          .join('');
      }
      return '';
    })
    .join('\n');
}

interface CalledTool {
  name: string;
  input: Record<string, unknown>;
}

function calledTools(messages: readonly LlmMessageParam[]): CalledTool[] {
  const calls: CalledTool[] = [];
  for (const message of messages) {
    if (message.role !== 'assistant' || typeof message.content === 'string') continue;
    for (const block of message.content) {
      if (block.type === 'tool_use')
        calls.push({ name: block.name, input: (block.input ?? {}) as Record<string, unknown> });
    }
  }
  return calls;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface ScriptedOptions {
  /** Delay per turn so office animations are visible; 0 in unit tests. */
  turnDelayMs?: number;
  chunkDelayMs?: number;
}

export class ScriptedLlm implements LlmClient {
  readonly mode = 'scripted' as const;
  private readonly turnDelayMs: number;
  private readonly chunkDelayMs: number;

  constructor(options: ScriptedOptions = {}) {
    if (process.env.NODE_ENV === 'production') {
      throw new LlmConfigError('LLM_MODE=scripted tidak boleh dipakai di produksi.');
    }
    this.turnDelayMs = options.turnDelayMs ?? 700;
    this.chunkDelayMs = options.chunkDelayMs ?? 180;
  }

  async json<T>(request: JsonRequest<T>): Promise<JsonResult<T>> {
    await sleep(Math.min(this.turnDelayMs, 400));
    const properties = (request.jsonSchema.properties ?? {}) as Record<string, unknown>;
    let reply: unknown;
    if ('agent_id' in properties) {
      const task = between(request.prompt, '<task>', '</task>');
      const agentId = routeByKeyword(task);
      reply = {
        agent_id: agentId,
        reason:
          agentId === 'manager'
            ? 'Tidak ada peran yang spesifik'
            : 'Sesuai peran dan kata kunci tugas',
      };
    } else if ('verdict' in properties) {
      reply = this.review(request.prompt);
    } else {
      reply = {};
    }
    const text = JSON.stringify(reply);
    const message = makeMessage(
      request.model,
      [{ type: 'text', text, citations: null }] as LlmMessage['content'],
      'end_turn',
      request.prompt.length,
    );
    const parsed = request.schema.safeParse(extractJson(text));
    return parsed.success
      ? { value: parsed.data, messages: [message] }
      : { value: null, messages: [message], error: parsed.error.message };
  }

  private review(prompt: string): unknown {
    const result = between(prompt, '<result>', '</result>');
    const knowledge = between(prompt, '<knowledge>', '</knowledge>');
    const known = new Set((knowledge.match(PRICE) ?? []).map(digits));
    const invented = (result.match(PRICE) ?? []).filter((price) => !known.has(digits(price)));
    if (invented.length > 0) {
      return {
        verdict: 'revise',
        notes: `Harga ${invented[0]} tidak ada di data resmi. Pakai harga dari knowledge base atau tulis [harga].`,
        scores: { accuracy: 2, tone: 4, completeness: 4 },
      };
    }
    return {
      verdict: 'approved',
      notes: 'Isi akurat, nada sesuai, siap dipakai.',
      scores: { accuracy: 5, tone: 4, completeness: 4 },
    };
  }

  async turn(request: TurnRequest, hooks?: TurnHooks): Promise<LlmMessage> {
    if (request.signal?.aborted) throw new Error('aborted');
    await sleep(this.turnDelayMs);
    const firstUser = request.messages.find((m) => m.role === 'user');
    const taskPrompt = firstUser ? textOf(firstUser) : '';
    const title = (taskPrompt.match(/^Judul: (.*)$/m)?.[1] ?? '').trim();
    const instructions =
      between(taskPrompt, '<task_instructions>', '</task_instructions>') || title;
    const revisionNotes = between(taskPrompt, '<review_notes>', '</review_notes>');
    const available = new Set(request.tools.map((t) => t.name));
    const called = calledTools(request.messages);
    const has = (name: string): boolean => called.some((c) => c.name === name);
    const history = request.messages.map(textOf).join('\n');
    // Only tool results count as facts (not the previous draft or reviewer notes).
    const toolResults = request.messages
      .filter(
        (m) =>
          m.role === 'user' &&
          typeof m.content !== 'string' &&
          m.content.some((b) => b.type === 'tool_result'),
      )
      .map(textOf)
      .join('\n');
    const inputChars = JSON.stringify(request.system).length + history.length;

    const toolUse = (name: string, input: Record<string, unknown>): LlmMessage =>
      makeMessage(
        request.model,
        [
          { type: 'text', text: 'Saya cek dulu.', citations: null },
          { type: 'tool_use', id: `toolu_scripted_${sequence + 1}_${name}`, name, input },
        ] as LlmMessage['content'],
        'tool_use',
        inputChars,
      );

    if (available.has('search_knowledge') && !has('search_knowledge')) {
      return toolUse('search_knowledge', { query: title || instructions.slice(0, 80) });
    }
    const content = this.compose(title, instructions, toolResults, revisionNotes);
    if (hooks?.onToolInput) {
      const chunks = 8;
      for (let i = 1; i <= chunks; i++) {
        hooks.onToolInput('submit_result', {
          summary: '',
          content: content.slice(0, Math.ceil((content.length * i) / chunks)),
        });
        await sleep(this.chunkDelayMs);
      }
    }
    return toolUse('submit_result', {
      summary: `Draft untuk "${title}" selesai.`,
      content,
      format: 'markdown',
    });
  }

  private compose(
    title: string,
    instructions: string,
    facts: string,
    revisionNotes: string,
  ): string {
    const knownPrice = facts.match(PRICE)?.[0];
    const fabricate =
      instructions.toLowerCase().includes(FABRICATED_PRICE_MARKER) && revisionNotes === '';
    const price = fabricate ? FABRICATED_PRICE : (knownPrice ?? '[harga]');
    const lines = [
      `**${title}**`,
      '',
      'Mau pindah karier ke data tanpa mulai sendirian?',
      '',
      `Belajar bareng mentor praktisi, kerjakan project nyata, dan bangun portofolio. Investasi ${price}.`,
      '',
      'Daftar sekarang, kuota terbatas: [link-pendaftaran]',
    ];
    return lines.join('\n');
  }
}
