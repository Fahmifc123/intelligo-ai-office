import { WhatsappBroadcastPayload } from '@intelligo/shared';
import { proposeAction } from './propose';
import { defineTool } from './types';

export const proposeWhatsappBroadcast = defineTool({
  name: 'propose_whatsapp_broadcast',
  description:
    'Usulkan broadcast WhatsApp ke maksimal 50 penerima (pakai {nama} untuk personalisasi). Wajib disetujui Owner sebelum terkirim.',
  inputSchema: WhatsappBroadcastPayload,
  statusText: (input) => `Siapkan broadcast ke ${input.recipients.length} orang`,
  requiresApproval: true,
  async execute(input, ctx) {
    return proposeAction(ctx, 'send_whatsapp_bulk', input);
  },
});
