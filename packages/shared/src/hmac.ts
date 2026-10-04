import { createHmac, timingSafeEqual } from 'node:crypto';

/** SPEC 11: X-Intelligo-Signature = hex HMAC-SHA256 of the raw request body. */
export const SIGNATURE_HEADER = 'X-Intelligo-Signature';

export function signBody(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

/** Constant-time check, as an n8n workflow (or the mock server) should do. */
export function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(signBody(body, secret), 'hex');
  const given = Buffer.from(signature, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
