/**
 * Local stand-in for n8n (dev demos and e2e). Verifies X-Intelligo-Signature like the real
 * workflows must, records every call (GET /__calls), and serves the sample sheets in
 * n8n/sample-data. Run: pnpm n8n:mock
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { maskPii } from '@intelligo/shared';
import { SIGNATURE_HEADER, verifySignature } from '@intelligo/shared/hmac';
import { z } from 'zod';

const env = z
  .object({
    N8N_WEBHOOK_SECRET: z.string().min(1, 'N8N_WEBHOOK_SECRET wajib diisi untuk mock n8n'),
    MOCK_N8N_PORT: z.coerce.number().int().positive().default(5679),
  })
  .parse(process.env);

const sheets = z
  .record(z.string(), z.array(z.record(z.string(), z.unknown())))
  .parse(
    JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../../n8n/sample-data/sheets.json'), 'utf8'),
    ),
  );

interface Call {
  workflow: string;
  body: unknown;
  signatureValid: boolean;
  receivedAt: string;
}
const calls: Call[] = [];

const SheetRequest = z.object({ sheet: z.string(), range: z.string().optional() });
const DocRequest = z.object({ title: z.string(), markdown: z.string() });

function reply(workflow: string, body: unknown): { status: number; json: unknown } {
  switch (workflow) {
    case 'sheet-read': {
      const request = SheetRequest.safeParse(body);
      if (!request.success) return { status: 400, json: { error: 'sheet wajib diisi' } };
      const rows = sheets[request.data.sheet];
      if (!rows) return { status: 404, json: { error: `Sheet "${request.data.sheet}" tidak ada` } };
      return { status: 200, json: { rows } };
    }
    case 'doc-create': {
      const request = DocRequest.safeParse(body);
      if (!request.success)
        return { status: 400, json: { error: 'title dan markdown wajib diisi' } };
      const id = `mock-${calls.length}-${Date.now().toString(36)}`;
      return {
        status: 200,
        json: { url: `https://docs.google.com/document/d/${id}/edit`, document_id: id },
      };
    }
    default:
      return { status: 200, json: { ok: true, workflow } };
  }
}

const server = createServer((req, res) => {
  const send = (status: number, json: unknown): void => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(json));
  };
  if (req.method === 'GET' && req.url === '/health') return send(200, { status: 'ok' });
  if (req.url === '/__calls') {
    if (req.method === 'DELETE') calls.length = 0;
    return send(200, calls);
  }
  const match = req.url?.match(/^\/webhook\/([a-z-]+)$/);
  if (req.method !== 'POST' || !match?.[1]) return send(404, { error: 'not found' });
  const workflow = match[1];
  let raw = '';
  req.on('data', (chunk: Buffer) => {
    raw += chunk.toString('utf8');
  });
  req.on('end', () => {
    const signature = String(req.headers[SIGNATURE_HEADER.toLowerCase()] ?? '');
    const signatureValid = verifySignature(raw, signature, env.N8N_WEBHOOK_SECRET);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }
    calls.push({ workflow, body, signatureValid, receivedAt: new Date().toISOString() });
    console.log(
      `[mock-n8n] ${workflow} signature=${signatureValid ? 'valid' : 'INVALID'} ${maskPii(raw).slice(0, 200)}`,
    );
    if (!signatureValid) return send(401, { error: 'Signature tidak valid' });
    const result = reply(workflow, body);
    send(result.status, result.json);
  });
});

server.listen(env.MOCK_N8N_PORT, '127.0.0.1', () => {
  console.log(`[mock-n8n] http://127.0.0.1:${env.MOCK_N8N_PORT}/webhook`);
});
