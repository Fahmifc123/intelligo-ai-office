import { EmailPayload } from '@intelligo/shared';
import { proposeAction } from './propose';
import { defineTool } from './types';

export const proposeEmail = defineTool({
  name: 'propose_email',
  description:
    'Usulkan email dari akun resmi Intelligo ID. Email TIDAK langsung terkirim: Owner menyetujui dulu.',
  inputSchema: EmailPayload,
  statusText: (input) => `Siapkan email: ${input.subject}`,
  requiresApproval: true,
  async execute(input, ctx) {
    return proposeAction(ctx, 'send_email', input);
  },
});
