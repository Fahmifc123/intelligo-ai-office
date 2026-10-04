import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { maskPii } from '@intelligo/shared';
import { SIGNATURE_HEADER, verifySignature } from '@intelligo/shared/hmac';
import { z } from 'zod';

export interface MockCall {
  workflow: string;
  body: unknown;
  signatureValid: boolean;
  receivedAt: string;
}

export interface MockN8nServer {
  url: string;
  port: number;
  calls: MockCall[];
  close(): Promise<void>;
}

const sheets = z
  .record(z.string(), z.array(z.record(z.string(), z.unknown())))
  .parse(
    JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../../n8n/sample-data/sheets.json'), 'utf8'),
    ),
  );

const SheetRequest = z.object({ sheet: z.string(), range: z.string().optional() });
const DocRequest = z.object({ title: z.string(), markdown: z.string() });

function reply(
  workflow: string,
  body: unknown,
  callNumber: number,
): { status: number; json: unknown } {
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
      const id = `mock-${callNumber}-${Date.now().toString(36)}`;
      return {
        status: 200,
        json: { url: `https://docs.google.com/document/d/${id}/edit`, document_id: id },
      };
    }
    default:
      return { status: 200, json: { ok: true, workflow } };
  }
}

/**
 * Local stand-in for n8n: verifies X-Intelligo-Signature like the real workflows must, records
 * calls (GET /__calls, DELETE to reset), and serves the sample sheets from n8n/sample-data.
 */
export function startMockN8nServer(secret: string, port = 0, log = false): Promise<MockN8nServer> {
  const calls: MockCall[] = [];
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
      const signatureValid = verifySignature(
        raw,
        String(req.headers[SIGNATURE_HEADER.toLowerCase()] ?? ''),
        secret,
      );
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
      calls.push({ workflow, body, signatureValid, receivedAt: new Date().toISOString() });
      if (log)
        console.log(
          `[mock-n8n] ${workflow} signature=${signatureValid ? 'valid' : 'INVALID'} ${maskPii(raw).slice(0, 200)}`,
        );
      if (!signatureValid) return send(401, { error: 'Signature tidak valid' });
      const result = reply(workflow, body, calls.length);
      send(result.status, result.json);
    });
  });
  return new Promise((resolvePromise) => {
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolvePromise({
        url: `http://127.0.0.1:${actualPort}/webhook`,
        port: actualPort,
        calls,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}
