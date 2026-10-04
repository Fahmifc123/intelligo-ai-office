import { WhatsappPayload } from '@intelligo/shared';
import { proposeAction } from './propose';
import { defineTool } from './types';

export const proposeWhatsappReply = defineTool({
  name: 'propose_whatsapp_reply',
  description:
    'Usulkan balasan WhatsApp ke satu calon peserta. Pesan TIDAK langsung terkirim: Owner menyetujui dulu. to: nomor HP (08xx atau 62xx).',
  inputSchema: WhatsappPayload,
  statusText: 'Siapkan balasan WhatsApp',
  requiresApproval: true,
  async execute(input, ctx) {
    return proposeAction(ctx, 'send_whatsapp', input);
  },
});
