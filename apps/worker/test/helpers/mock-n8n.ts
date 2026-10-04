import { createServer, type Server } from 'node:http';
import { SIGNATURE_HEADER, verifySignature } from '@intelligo/shared/hmac';

export interface ReceivedCall {
  path: string;
  body: string;
  json: Record<string, unknown>;
  signatureValid: boolean;
}

export interface MockN8n {
  url: string;
  calls: ReceivedCall[];
  /** HTTP status for the next calls (default 200). */
  respondWith(status: number, body?: unknown): void;
  close(): Promise<void>;
}

/** Minimal n8n stand-in: records webhook calls and checks X-Intelligo-Signature. */
export async function startMockN8n(secret: string): Promise<MockN8n> {
  const calls: ReceivedCall[] = [];
  let status = 200;
  let reply: unknown = { ok: true };
  const server: Server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
    });
    req.on('end', () => {
      const signature = String(req.headers[SIGNATURE_HEADER.toLowerCase()] ?? '');
      calls.push({
        path: req.url ?? '',
        body,
        json: JSON.parse(body || '{}') as Record<string, unknown>,
        signatureValid: verifySignature(body, signature, secret),
      });
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(reply));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}/webhook`,
    calls,
    respondWith(nextStatus, nextBody = { ok: nextStatus < 400 }) {
      status = nextStatus;
      reply = nextBody;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
