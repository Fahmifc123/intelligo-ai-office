import type { z } from 'zod';
import type { AgentConfig, AgentId } from './schemas';

/** Agent config before Zod defaults are applied (as written in agents.config.ts). */
export type AgentConfigInput = z.input<typeof AgentConfig>;

/** Named spot groups in office.layout.json. */
export type SpotName = 'pantry' | 'meeting' | 'lounge' | 'wander';

/**
 * Value of agent_states.target_spot. The client resolves it to coordinates;
 * positions are never stored in the database.
 */
export type TargetSpot = 'desk' | SpotName | `desk:${AgentId}`;
