import Anthropic from '@anthropic-ai/sdk';
import {
  buildChatSystemPrompt,
  computeCostUsd,
  findPrice,
  formatKnowledgeSnippet,
  parsePricingOverrides,
} from '@intelligo/shared';
import { z } from 'zod';
import { AuthError, authorize } from '@/lib/auth';
import { searchKnowledgeForChat } from '@/lib/chat/knowledge';
import {
  ChatConfigError,
  createChatModel,
  type ChatMessage,
  type ChatTool,
  type ChatTurnParam,
} from '@/lib/chat/model';
import { readServerEnv } from '@/lib/server-env';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const Body = z.object({
  agentId: z.string().min(1).max(40),
  message: z.string().trim().min(1, 'Pesan kosong.').max(2000, 'Pesan maksimal 2000 karakter.'),
});

const AgentRecord = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  focus: z.string(),
  model: z.string(),
  enabled: z.boolean(),
  monthly_token_budget: z.number().nullable(),
});

const HistoryRow = z.object({ role: z.enum(['user', 'assistant']), content: z.string() });
const SearchInput = z.object({
  query: z.string().min(1).max(300),
  tags: z.array(z.string()).max(5).optional(),
});

const SEARCH_TOOL: ChatTool = {
  name: 'search_knowledge',
  description:
    'Cari dokumen internal Intelligo ID (harga, program, jadwal, SOP). Wajib dipakai sebelum menyebut harga atau jadwal.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Kata kunci pencarian' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Filter tag opsional' },
    },
    required: ['query'],
  },
  cache_control: { type: 'ephemeral' },
};

const MAX_TOOL_ROUNDS = 3;
const HISTORY_LIMIT = 20;
const CHAT_PER_HOUR = 60;

const jsonError = (status: number, error: string): Response => Response.json({ error }, { status });

function startOfMonthWib(now = new Date()): string {
  const wib = new Date(now.getTime() + 7 * 3600_000);
  return new Date(
    Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), 1) - 7 * 3600_000,
  ).toISOString();
}

/**
 * Chat with one agent (SPEC 12.3, Fase 4). Streams the reply as plain text. The agent may only
 * search the knowledge base; nothing leaves the company from chat.
 */
export async function POST(request: Request): Promise<Response> {
  let viewer;
  try {
    viewer = await authorize(['owner', 'staff']);
  } catch (error) {
    return jsonError(
      error instanceof AuthError ? 403 : 500,
      error instanceof Error ? error.message : 'Tidak diizinkan.',
    );
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, parsed.error.issues[0]?.message ?? 'Input tidak valid.');
  const { agentId, message } = parsed.data;

  const env = readServerEnv();
  const admin = getAdminSupabase();
  const { data: agentData } = await admin
    .from('agents')
    .select('id, name, role, focus, model, enabled, monthly_token_budget')
    .eq('id', agentId)
    .eq('org_id', viewer.orgId)
    .maybeSingle();
  const agent = AgentRecord.safeParse(agentData);
  if (!agent.success) return jsonError(404, 'Agen tidak ditemukan.');
  if (!agent.data.enabled) return jsonError(409, `${agent.data.name} sedang nonaktif.`);

  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count: recentCount } = await admin
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', viewer.userId)
    .eq('role', 'user')
    .gte('created_at', hourAgo);
  if ((recentCount ?? 0) >= CHAT_PER_HOUR)
    return jsonError(429, `Batas ${CHAT_PER_HOUR} pesan chat per jam tercapai.`);

  if (agent.data.monthly_token_budget !== null) {
    const { data: usage } = await admin
      .from('llm_usage')
      .select('input_tokens, cache_read_tokens, cache_write_tokens')
      .eq('agent_id', agentId)
      .gte('created_at', startOfMonthWib());
    const used = (usage ?? []).reduce(
      (sum, row) =>
        sum +
        Number(row.input_tokens ?? 0) +
        Number(row.cache_read_tokens ?? 0) +
        Number(row.cache_write_tokens ?? 0),
      0,
    );
    if (used >= agent.data.monthly_token_budget) {
      return jsonError(
        409,
        `Budget token bulanan ${agent.data.name} habis. Naikkan budget di halaman Agen.`,
      );
    }
  }

  let model;
  try {
    model = createChatModel(env);
  } catch (error) {
    return jsonError(
      503,
      error instanceof ChatConfigError ? error.message : 'Model chat tidak tersedia.',
    );
  }

  const { data: historyData } = await admin
    .from('chat_messages')
    .select('role, content')
    .eq('agent_id', agentId)
    .eq('user_id', viewer.userId)
    .order('id', { ascending: false })
    .limit(HISTORY_LIMIT);
  const history = (historyData ?? [])
    .flatMap((row) => {
      const r = HistoryRow.safeParse(row);
      return r.success ? [r.data] : [];
    })
    .reverse();
  // The API needs the conversation to start with a user turn.
  while (history[0]?.role === 'assistant') history.shift();

  await admin.from('chat_messages').insert({
    org_id: viewer.orgId,
    agent_id: agentId,
    user_id: viewer.userId,
    role: 'user',
    content: message,
  });

  const knowledge = await searchKnowledgeForChat(viewer.orgId, message);
  const system = buildChatSystemPrompt(
    agent.data,
    knowledge.map((doc) => formatKnowledgeSnippet(doc)),
  );
  const messages: ChatTurnParam[] = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];
  const prices = parsePricingOverrides(env.MODEL_PRICING_JSON);
  const encoder = new TextEncoder();

  const recordUsage = async (reply: ChatMessage): Promise<void> => {
    const usage = {
      inputTokens: reply.usage.input_tokens,
      outputTokens: reply.usage.output_tokens,
      cacheReadTokens: reply.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: reply.usage.cache_creation_input_tokens ?? 0,
    };
    const price = findPrice(reply.model, prices);
    await admin.from('llm_usage').insert({
      org_id: viewer.orgId,
      agent_id: agentId,
      purpose: 'chat',
      model: reply.model,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      cache_read_tokens: usage.cacheReadTokens,
      cache_write_tokens: usage.cacheWriteTokens,
      cost_usd: price ? computeCostUsd(price, usage) : 0,
    });
  };

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = '';
      const emit = (delta: string): void => {
        answer += delta;
        controller.enqueue(encoder.encode(delta));
      };
      try {
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          const reply = await model.turn(
            {
              model: agent.data.model,
              system,
              messages,
              tools: round < MAX_TOOL_ROUNDS ? [SEARCH_TOOL] : [],
              signal: request.signal,
            },
            emit,
          );
          await recordUsage(reply);
          if (reply.stop_reason === 'refusal') {
            if (!answer) emit('Maaf, saya tidak bisa membantu permintaan ini.');
            break;
          }
          const toolUses = reply.content.filter(
            (b): b is Extract<typeof b, { type: 'tool_use' }> => b.type === 'tool_use',
          );
          if (toolUses.length === 0) break;
          messages.push({ role: 'assistant', content: reply.content });
          const results = await Promise.all(
            toolUses.map(async (block) => {
              const input = SearchInput.safeParse(block.input);
              if (block.name !== 'search_knowledge' || !input.success) {
                return {
                  type: 'tool_result' as const,
                  tool_use_id: block.id,
                  is_error: true,
                  content: 'Tool tidak tersedia di chat.',
                };
              }
              const docs = await searchKnowledgeForChat(
                viewer.orgId,
                input.data.query,
                input.data.tags ?? [],
              );
              return {
                type: 'tool_result' as const,
                tool_use_id: block.id,
                content: JSON.stringify({
                  results: docs.map((d) => ({
                    title: d.title,
                    tags: d.tags,
                    content: d.content.slice(0, 2000),
                  })),
                }),
              };
            }),
          );
          messages.push({ role: 'user', content: results });
          if (answer && !answer.endsWith('\n')) emit('\n\n');
        }
        if (!answer.trim()) emit('Maaf, saya belum bisa menjawab. Coba tanyakan dengan cara lain.');
      } catch (error) {
        const text =
          error instanceof Anthropic.RateLimitError
            ? 'Model sedang sibuk. Coba lagi sebentar lagi.'
            : 'Maaf, chat gagal diproses. Coba lagi.';
        console.error('[chat] gagal:', error instanceof Error ? error.message : error);
        emit(answer ? `\n\n${text}` : text);
      } finally {
        await admin.from('chat_messages').insert({
          org_id: viewer.orgId,
          agent_id: agentId,
          user_id: viewer.userId,
          role: 'assistant',
          content: answer.trim(),
        });
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
