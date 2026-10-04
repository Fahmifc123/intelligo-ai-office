import { describe, expect, it } from 'vitest';
import { agentsConfig, getAgentConfig, MANAGER_AGENT_ID } from '../src/agents.config';
import { findDesk, officeLayout } from '../src/layout';
import { TOOL_NAMES } from '../src/schemas';

describe('agentsConfig', () => {
  it('defines the 12 agents from the spec', () => {
    expect(agentsConfig.map((a) => a.id)).toEqual([
      'manager',
      'cs',
      'writer',
      'socmed',
      'leads',
      'proposal',
      'billing',
      'curriculum',
      'analyst',
      'ads',
      'scheduler',
      'success',
    ]);
  });

  it('has unique ids, names, and desks', () => {
    for (const key of ['id', 'name', 'deskId'] as const) {
      const values = agentsConfig.map((a) => a[key]);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('places every agent at a desk that exists in the layout', () => {
    for (const agent of agentsConfig) {
      expect(findDesk(officeLayout, agent.deskId), agent.id).toBeDefined();
    }
  });

  it('has exactly one manager', () => {
    const managers = agentsConfig.filter((a) => a.isManager);
    expect(managers.map((a) => a.id)).toEqual([MANAGER_AGENT_ID]);
  });

  it('gives every agent submit_result and only known tools', () => {
    for (const agent of agentsConfig) {
      expect(agent.tools).toContain('submit_result');
      for (const tool of agent.tools) expect(TOOL_NAMES).toContain(tool);
    }
  });

  it('restricts delegate_task to the manager', () => {
    const delegators = agentsConfig.filter((a) => a.tools.includes('delegate_task'));
    expect(delegators.map((a) => a.id)).toEqual([MANAGER_AGENT_ID]);
  });

  it('looks up agents by id', () => {
    expect(getAgentConfig('writer')?.name).toBe('Dimas');
    expect(getAgentConfig('unknown')).toBeUndefined();
  });
});
