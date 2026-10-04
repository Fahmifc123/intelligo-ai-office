import { SchedulePostPayload } from '@intelligo/shared';
import { proposeAction } from './propose';
import { defineTool } from './types';

export const proposeSchedulePost = defineTool({
  name: 'propose_schedule_post',
  description:
    'Usulkan jadwal posting media sosial (instagram, facebook, linkedin, tiktok). scheduled_at ISO 8601 dengan zona waktu, misal 2026-10-10T19:00:00+07:00. Owner menyetujui dulu.',
  inputSchema: SchedulePostPayload,
  statusText: (input) => `Jadwalkan posting ${input.platform}`,
  requiresApproval: true,
  async execute(input, ctx) {
    return proposeAction(ctx, 'schedule_post', input);
  },
});
