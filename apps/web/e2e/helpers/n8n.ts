import { z } from 'zod';

const Call = z.object({ workflow: z.string(), body: z.unknown(), signatureValid: z.boolean() });

/** Calls recorded by the mock n8n server started in playwright.config.ts. */
export async function n8nCalls(): Promise<z.infer<typeof Call>[]> {
  const response = await fetch('http://127.0.0.1:5679/__calls');
  return z.array(Call).parse(await response.json());
}

export async function clearN8nCalls(): Promise<void> {
  await fetch('http://127.0.0.1:5679/__calls', { method: 'DELETE' });
}
