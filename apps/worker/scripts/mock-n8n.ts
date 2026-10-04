/** Runs the mock n8n server for local demos and e2e. Usage: pnpm n8n:mock */
import { z } from 'zod';
import { startMockN8nServer } from './mock-n8n-server';

const env = z
  .object({
    N8N_WEBHOOK_SECRET: z.string().min(1, 'N8N_WEBHOOK_SECRET wajib diisi untuk mock n8n'),
    MOCK_N8N_PORT: z.coerce.number().int().positive().default(5679),
  })
  .parse(process.env);

const server = await startMockN8nServer(env.N8N_WEBHOOK_SECRET, env.MOCK_N8N_PORT, true);
console.log(`[mock-n8n] ${server.url}`);
