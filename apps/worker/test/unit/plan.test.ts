import { describe, expect, it } from 'vitest';
import { planIdleTick, planOfficeMode } from '../../src/office/plan';
import type { RosterEntry } from '../../src/office/roster';
import { sequenceRng } from '../helpers/db';

const entry = (overrides: Partial<RosterEntry> = {}): RosterEntry => ({
  agent_id: 'writer',
  name: 'Dimas',
  role: 'Content Writer',
  is_manager: false,
  enabled: true,
  idle_lines: ['Draft artikel blog', 'Riset topik konten'],
  activity: 'working',
  status_text: 'Draft artikel blog',
  current_task_id: null,
  target_spot: 'desk',
  ...overrides,
});

const normal = { meetingActive: false, breakMode: false };

describe('planIdleTick', () => {
  it('leaves agents alone when the change roll misses', () => {
    expect(planIdleTick([entry()], normal, sequenceRng([0.9]))).toEqual([]);
  });

  it('keeps light work at the desk for rolls below 0.6', () => {
    const [change] = planIdleTick([entry()], normal, sequenceRng([0.1, 0.5, 0.0]));
    expect(change).toMatchObject({
      activity: 'working',
      targetSpot: 'desk',
      statusText: 'Draft artikel blog',
    });
  });

  it('sends agents to the pantry for rolls between 0.6 and 0.8', () => {
    const [change] = planIdleTick([entry()], normal, sequenceRng([0.1, 0.7, 0.0]));
    expect(change).toMatchObject({ activity: 'break', targetSpot: 'pantry' });
  });

  it('sends agents walking for rolls above 0.8', () => {
    const [change] = planIdleTick([entry()], normal, sequenceRng([0.1, 0.9, 0.0, 0.2]));
    expect(change).toMatchObject({ activity: 'idle', targetSpot: 'lounge' });
  });

  it('brings away agents back to their desk', () => {
    const [change] = planIdleTick(
      [entry({ activity: 'break', target_spot: 'pantry' })],
      normal,
      sequenceRng([0.1, 0.0]),
    );
    expect(change).toMatchObject({ activity: 'working', targetSpot: 'desk' });
  });

  it('never touches busy, reviewing, or offline agents, or any agent during a mode', () => {
    const busy = [
      entry({ current_task_id: '11111111-1111-4111-8111-111111111111' }),
      entry({ agent_id: 'manager', activity: 'reviewing', target_spot: 'desk:writer' }),
      entry({ agent_id: 'cs', activity: 'offline' }),
    ];
    expect(planIdleTick(busy, normal, sequenceRng([0]))).toEqual([]);
    expect(
      planIdleTick([entry()], { meetingActive: true, breakMode: false }, sequenceRng([0])),
    ).toEqual([]);
    expect(
      planIdleTick([entry()], { meetingActive: false, breakMode: true }, sequenceRng([0])),
    ).toEqual([]);
  });
});

describe('planOfficeMode', () => {
  it('moves free agents to the meeting room and keeps busy agents working', () => {
    const changes = planOfficeMode(
      [entry(), entry({ agent_id: 'cs', current_task_id: '11111111-1111-4111-8111-111111111111' })],
      { meetingActive: true, breakMode: false },
      sequenceRng([0]),
    );
    expect(changes).toEqual([
      {
        agentId: 'writer',
        activity: 'meeting',
        statusText: 'Rapat mingguan',
        targetSpot: 'meeting',
      },
    ]);
  });

  it('sends free agents to the pantry during the break', () => {
    const [change] = planOfficeMode(
      [entry()],
      { meetingActive: false, breakMode: true },
      sequenceRng([0]),
    );
    expect(change).toMatchObject({
      activity: 'break',
      targetSpot: 'pantry',
      statusText: 'Makan siang',
    });
  });

  it('leaves ambient pantry visits alone in normal mode', () => {
    expect(planOfficeMode([entry({ activity: 'break' })], normal, sequenceRng([0]))).toEqual([]);
  });

  it('returns meeting and break agents to their desks when the mode ends', () => {
    const changes = planOfficeMode(
      [entry({ activity: 'meeting' }), entry({ agent_id: 'cs', activity: 'break' })],
      normal,
      sequenceRng([0]),
      true,
    );
    expect(changes.map((c) => [c.agentId, c.activity, c.targetSpot])).toEqual([
      ['writer', 'working', 'desk'],
      ['cs', 'working', 'desk'],
    ]);
  });

  it('takes disabled agents offline and brings re-enabled agents back', () => {
    const changes = planOfficeMode(
      [entry({ enabled: false }), entry({ agent_id: 'cs', activity: 'offline' })],
      normal,
      sequenceRng([0]),
    );
    expect(changes.map((c) => [c.agentId, c.activity])).toEqual([
      ['writer', 'offline'],
      ['cs', 'working'],
    ]);
  });
});
