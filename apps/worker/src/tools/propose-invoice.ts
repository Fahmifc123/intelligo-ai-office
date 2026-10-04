import { InvoicePayload, invoiceTotal } from '@intelligo/shared';
import { proposeAction } from './propose';
import { defineTool } from './types';

export const proposeInvoice = defineTool({
  name: 'propose_invoice',
  description:
    'Usulkan invoice (template Intelligo, tanpa PPN karena non-PKP). Harga per item dalam rupiah tanpa desimal. Owner menyetujui sebelum invoice dibuat.',
  inputSchema: InvoicePayload,
  statusText: (input) => `Siapkan invoice ${input.customer_name}`,
  requiresApproval: true,
  async execute(input, ctx) {
    return proposeAction(ctx, 'create_invoice', {
      ...input,
      total: invoiceTotal(input.items),
      currency: 'IDR',
      tax: 0,
    });
  },
});
