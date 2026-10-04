import type { z } from 'zod';
import type { JsonResult, LlmMessage, LlmMessageParam } from './types';

/** Concatenated text of a response. */
export function messageText(message: LlmMessage): string {
  return message.content
    .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

/** Extracts the first JSON object from model text (tolerates code fences). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('Balasan tidak berisi objek JSON');
  return JSON.parse(candidate.slice(start, end + 1));
}

export function validateJson<T>(
  schema: z.ZodType<T>,
  text: string,
): { ok: true; value: T } | { ok: false; error: string } {
  try {
    const parsed = schema.safeParse(extractJson(text));
    if (parsed.success) return { ok: true, value: parsed.data };
    return {
      ok: false,
      error: parsed.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; '),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * SPEC 14: validate, retry once with the validation error, then give up (caller falls back).
 * `call` performs one request for the given conversation.
 */
export async function jsonWithRetry<T>(
  schema: z.ZodType<T>,
  prompt: string,
  call: (messages: LlmMessageParam[]) => Promise<LlmMessage>,
): Promise<JsonResult<T>> {
  const messages: LlmMessageParam[] = [{ role: 'user', content: prompt }];
  const responses: LlmMessage[] = [];
  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await call(messages);
    responses.push(response);
    if (response.stop_reason === 'refusal')
      return { value: null, messages: responses, error: 'refusal' };
    const result = validateJson(schema, messageText(response));
    if (result.ok) return { value: result.value, messages: responses };
    lastError = result.error;
    messages.push(
      { role: 'assistant', content: response.content },
      {
        role: 'user',
        content: `Output sebelumnya tidak valid: ${result.error}. Balas ulang hanya dengan JSON yang valid sesuai skema.`,
      },
    );
  }
  return { value: null, messages: responses, error: lastError };
}
