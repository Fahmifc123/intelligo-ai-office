import { z } from 'zod';
import type { ActionKind } from './schemas';

/** Normalizes Indonesian mobile numbers to 62xxxxxxxxxx; returns null when invalid. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '').replace(/^\+/, '');
  let normalized = digits;
  if (normalized.startsWith('0')) normalized = `62${normalized.slice(1)}`;
  if (normalized.startsWith('8')) normalized = `62${normalized}`;
  if (!/^628\d{7,12}$/.test(normalized)) return null;
  return normalized;
}

export const Phone = z.string().transform((value, ctx) => {
  const phone = normalizePhone(value);
  if (!phone) {
    ctx.addIssue({ code: 'custom', message: 'Nomor WhatsApp tidak valid (contoh: 081234567890)' });
    return z.NEVER;
  }
  return phone;
});

const Email = z.email('Alamat email tidak valid');

export const WhatsappPayload = z.object({
  to: Phone,
  recipient_name: z.string().max(80).optional(),
  message: z.string().min(1).max(4096),
});

/** SPEC: broadcasts are capped at 50 recipients and always need the Owner. */
export const MAX_BROADCAST_RECIPIENTS = 50;

export const WhatsappBroadcastPayload = z.object({
  recipients: z
    .array(z.object({ to: Phone, name: z.string().max(80).optional() }))
    .min(1)
    .max(MAX_BROADCAST_RECIPIENTS, `Broadcast maksimal ${MAX_BROADCAST_RECIPIENTS} penerima`),
  message: z.string().min(1).max(4096).describe('Boleh memakai {nama} untuk nama penerima'),
});

export const EmailPayload = z.object({
  to: Email,
  cc: z.array(Email).max(5).optional(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(20_000),
});

export const InvoiceItem = z.object({
  description: z.string().min(1).max(200),
  quantity: z.number().int().positive(),
  unit_price: z.number().int().nonnegative().describe('Rupiah, tanpa desimal'),
});

/** Intelligo ID is non-PKP: invoices carry no VAT. */
export const InvoicePayload = z.object({
  customer_name: z.string().min(1).max(160),
  customer_email: Email.optional(),
  customer_phone: Phone.optional(),
  items: z.array(InvoiceItem).min(1).max(30),
  due_date: z.iso.date('Format tanggal YYYY-MM-DD'),
  notes: z.string().max(1000).optional(),
});

export const SchedulePostPayload = z.object({
  platform: z.enum(['instagram', 'facebook', 'linkedin', 'tiktok']),
  caption: z.string().min(1).max(2200),
  scheduled_at: z.iso.datetime({
    offset: true,
    message: 'Waktu harus ISO 8601, misal 2026-10-10T19:00:00+07:00',
  }),
  media_url: z.url().optional(),
});

/** Instagram carousel limits: 2 to 10 slides. */
export const CAROUSEL_MIN_SLIDES = 2;
export const CAROUSEL_MAX_SLIDES = 10;

export const CarouselSlide = z.object({
  position: z.number().int().min(1).max(CAROUSEL_MAX_SLIDES),
  headline: z.string().min(1).max(120),
  body: z.string().max(300).default(''),
  url: z.url(),
});
export type CarouselSlide = z.infer<typeof CarouselSlide>;

/**
 * Human review of a generated carousel (internal: approving it sends nothing anywhere).
 * The reviewer can edit the caption before approving.
 */
export const DesignReviewPayload = z.object({
  title: z.string().min(1).max(160),
  caption: z.string().max(2200).default(''),
  planned_at: z.string().max(60).optional(),
  slides: z.array(CarouselSlide).min(CAROUSEL_MIN_SLIDES).max(CAROUSEL_MAX_SLIDES),
});

export const ACTION_PAYLOADS = {
  send_whatsapp: WhatsappPayload,
  send_whatsapp_bulk: WhatsappBroadcastPayload,
  send_email: EmailPayload,
  create_invoice: InvoicePayload,
  schedule_post: SchedulePostPayload,
  design_review: DesignReviewPayload,
} as const satisfies Record<ActionKind, z.ZodType>;

export function parseActionPayload(
  kind: ActionKind,
  payload: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const result = ACTION_PAYLOADS[kind].safeParse(payload);
  if (result.success) return { ok: true, value: result.data as Record<string, unknown> };
  return {
    ok: false,
    error: result.error.issues
      .map((i) => `${i.path.join('.') || 'payload'}: ${i.message}`)
      .join('; '),
  };
}

export function invoiceTotal(items: readonly { quantity: number; unit_price: number }[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
}

/** Kinds handled inside the app: approving them records the decision, nothing is sent. */
export const INTERNAL_ACTION_KINDS: readonly ActionKind[] = ['design_review'];

/** n8n webhook path per external action kind (SPEC section 11). */
export const N8N_WORKFLOWS: Record<Exclude<ActionKind, 'design_review'>, string> = {
  send_whatsapp: 'wa-send',
  send_whatsapp_bulk: 'wa-send',
  send_email: 'email-send',
  create_invoice: 'invoice-create',
  schedule_post: 'post-schedule',
};

export const ACTION_KIND_LABELS: Record<ActionKind, string> = {
  send_whatsapp: 'Balasan WhatsApp',
  send_whatsapp_bulk: 'Broadcast WhatsApp',
  send_email: 'Email',
  create_invoice: 'Invoice',
  schedule_post: 'Jadwal posting',
  design_review: 'Review desain carousel',
};

/** Kinds the Owner may allow without manual approval (never broadcasts). */
export const AUTO_APPROVABLE_KINDS: readonly ActionKind[] = [
  'send_whatsapp',
  'send_email',
  'create_invoice',
  'schedule_post',
];

/** Shallow diff for the approval timeline when the Owner edits a payload. */
export function payloadDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      diff[key] = { before: before[key], after: after[key] };
  }
  return diff;
}
