import { describe, expect, it } from 'vitest';
import {
  invoiceTotal,
  normalizePhone,
  parseActionPayload,
  payloadDiff,
  WhatsappBroadcastPayload,
} from '../src/actions';
import { signBody, verifySignature } from '../src/hmac';

describe('normalizePhone', () => {
  it('accepts common Indonesian formats', () => {
    expect(normalizePhone('081234567890')).toBe('6281234567890');
    expect(normalizePhone('+62 812-3456-7890')).toBe('6281234567890');
    expect(normalizePhone('6281234567890')).toBe('6281234567890');
    expect(normalizePhone('81234567890')).toBe('6281234567890');
  });

  it('rejects landlines, short numbers, and garbage', () => {
    expect(normalizePhone('0221234567')).toBeNull();
    expect(normalizePhone('0812')).toBeNull();
    expect(normalizePhone('0812xxxx9950')).toBeNull();
  });
});

describe('action payloads', () => {
  it('normalizes the WhatsApp number', () => {
    const result = parseActionPayload('send_whatsapp', {
      to: '0812-3456-7890',
      message: 'Halo Kak',
    });
    expect(result).toEqual({ ok: true, value: { to: '6281234567890', message: 'Halo Kak' } });
  });

  it('caps broadcasts at 50 recipients', () => {
    const recipients = Array.from({ length: 51 }, (_, i) => ({
      to: `0812345678${String(i).padStart(2, '0')}`,
    }));
    expect(WhatsappBroadcastPayload.safeParse({ recipients, message: 'Halo {nama}' }).success).toBe(
      false,
    );
    expect(
      WhatsappBroadcastPayload.safeParse({ recipients: recipients.slice(0, 50), message: 'Halo' })
        .success,
    ).toBe(true);
  });

  it('validates email and invoice fields', () => {
    expect(
      parseActionPayload('send_email', { to: 'bukan-email', subject: 'x', body: 'y' }).ok,
    ).toBe(false);
    const invoice = parseActionPayload('create_invoice', {
      customer_name: 'PT Contoh',
      items: [{ description: 'Corporate training', quantity: 2, unit_price: 1_500_000 }],
      due_date: '2026-10-20',
    });
    expect(invoice.ok).toBe(true);
    expect(
      invoiceTotal([
        { quantity: 2, unit_price: 1_500_000 },
        { quantity: 1, unit_price: 250_000 },
      ]),
    ).toBe(3_250_000);
  });

  it('requires an ISO time with offset for scheduled posts', () => {
    expect(
      parseActionPayload('schedule_post', {
        platform: 'instagram',
        caption: 'x',
        scheduled_at: '2026-10-10 19:00',
      }).ok,
    ).toBe(false);
    expect(
      parseActionPayload('schedule_post', {
        platform: 'instagram',
        caption: 'x',
        scheduled_at: '2026-10-10T19:00:00+07:00',
      }).ok,
    ).toBe(true);
  });

  it('diffs edited payloads', () => {
    expect(payloadDiff({ to: '62812', message: 'a' }, { to: '62812', message: 'b' })).toEqual({
      message: { before: 'a', after: 'b' },
    });
  });
});

describe('HMAC signature', () => {
  it('signs and verifies the raw body', () => {
    const body = JSON.stringify({ kind: 'send_whatsapp', message: 'Halo' });
    const signature = signBody(body, 'rahasia');
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(verifySignature(body, signature, 'rahasia')).toBe(true);
    expect(verifySignature(`${body} `, signature, 'rahasia')).toBe(false);
    expect(verifySignature(body, signature, 'lain')).toBe(false);
    expect(verifySignature(body, 'abc', 'rahasia')).toBe(false);
  });
});
