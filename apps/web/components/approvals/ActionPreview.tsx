import {
  EmailPayload,
  InvoicePayload,
  invoiceTotal,
  SchedulePostPayload,
  WhatsappBroadcastPayload,
  WhatsappPayload,
  type ActionKind,
} from '@intelligo/shared';
import { formatDateTimeWib, formatIdr } from '@/lib/format';

const displayPhone = (phone: string): string =>
  phone.startsWith('62') ? `0${phone.slice(2)}` : phone;

function Bubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-md rounded-2xl rounded-tl-sm bg-[#dcf8c6] px-3 py-2 text-sm whitespace-pre-wrap text-[#14213d] dark:bg-[#1f4d3a] dark:text-[#e6ebf5]">
      {children}
    </div>
  );
}

function Invalid({ payload }: { payload: unknown }) {
  return (
    <pre className="overflow-auto rounded-lg bg-surface-2 p-2 text-xs">
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}

/** Readable preview of what will be sent (SPEC 12.4). */
export function ActionPreview({ kind, payload }: { kind: ActionKind; payload: unknown }) {
  switch (kind) {
    case 'send_whatsapp': {
      const p = WhatsappPayload.safeParse(payload);
      if (!p.success) return <Invalid payload={payload} />;
      return (
        <div className="grid gap-1.5">
          <p className="text-xs text-muted">
            Ke WhatsApp{' '}
            <span className="font-mono font-semibold text-ink">{displayPhone(p.data.to)}</span>
            {p.data.recipient_name ? ` (${p.data.recipient_name})` : ''}
          </p>
          <Bubble>{p.data.message}</Bubble>
        </div>
      );
    }
    case 'send_whatsapp_bulk': {
      const p = WhatsappBroadcastPayload.safeParse(payload);
      if (!p.success) return <Invalid payload={payload} />;
      return (
        <div className="grid gap-1.5">
          <p className="text-xs text-muted">
            Broadcast ke{' '}
            <span className="font-semibold text-ink">{p.data.recipients.length} penerima</span>
          </p>
          <ul className="flex flex-wrap gap-1 text-xs">
            {p.data.recipients.slice(0, 12).map((r) => (
              <li key={r.to} className="rounded-full bg-surface-2 px-2 py-0.5 font-mono">
                {r.name ? `${r.name} · ` : ''}
                {displayPhone(r.to)}
              </li>
            ))}
            {p.data.recipients.length > 12 ? (
              <li className="text-muted">+{p.data.recipients.length - 12} lainnya</li>
            ) : null}
          </ul>
          <Bubble>{p.data.message}</Bubble>
        </div>
      );
    }
    case 'send_email': {
      const p = EmailPayload.safeParse(payload);
      if (!p.success) return <Invalid payload={payload} />;
      return (
        <div className="overflow-hidden rounded-xl border border-line">
          <dl className="grid grid-cols-[70px_1fr] gap-x-2 gap-y-1 border-b border-line bg-surface-2 px-3 py-2 text-xs">
            <dt className="text-muted">Kepada</dt>
            <dd className="font-mono">{p.data.to}</dd>
            {p.data.cc?.length ? (
              <>
                <dt className="text-muted">Cc</dt>
                <dd className="font-mono">{p.data.cc.join(', ')}</dd>
              </>
            ) : null}
            <dt className="text-muted">Subjek</dt>
            <dd className="font-semibold">{p.data.subject}</dd>
          </dl>
          <p className="px-3 py-2 text-sm whitespace-pre-wrap">{p.data.body}</p>
        </div>
      );
    }
    case 'create_invoice': {
      const p = InvoicePayload.safeParse(payload);
      if (!p.success) return <Invalid payload={payload} />;
      return (
        <div className="overflow-hidden rounded-xl border border-line text-sm">
          <div className="flex flex-wrap justify-between gap-2 border-b border-line bg-surface-2 px-3 py-2 text-xs">
            <span>
              Untuk <span className="font-semibold">{p.data.customer_name}</span>
            </span>
            <span>Jatuh tempo {p.data.due_date}</span>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="text-muted">
              <tr>
                <th className="px-3 py-1.5 font-semibold">Item</th>
                <th className="px-3 py-1.5 text-right font-semibold">Qty</th>
                <th className="px-3 py-1.5 text-right font-semibold">Harga</th>
              </tr>
            </thead>
            <tbody>
              {p.data.items.map((item, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-3 py-1.5">{item.description}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{item.quantity}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatIdr(item.unit_price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="flex justify-between border-t border-line px-3 py-2 text-sm font-semibold">
            <span>Total (tanpa PPN, non-PKP)</span>
            <span className="tabular-nums">{formatIdr(invoiceTotal(p.data.items))}</span>
          </p>
        </div>
      );
    }
    case 'schedule_post': {
      const p = SchedulePostPayload.safeParse(payload);
      if (!p.success) return <Invalid payload={payload} />;
      return (
        <div className="grid gap-1.5">
          <p className="text-xs text-muted">
            <span className="font-semibold text-ink capitalize">{p.data.platform}</span> · tayang{' '}
            {formatDateTimeWib(new Date(p.data.scheduled_at))} WIB
          </p>
          <p className="rounded-xl border border-line p-3 text-sm whitespace-pre-wrap">
            {p.data.caption}
          </p>
        </div>
      );
    }
  }
}
