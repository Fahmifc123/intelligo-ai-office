import { z } from 'zod';
import { ToolError, type AgentTool, type RegisteredTool } from './types';

/** Wraps a typed tool: Zod-validates model input and turns failures into tool errors. */
export function register<I>(tool: AgentTool<I>): RegisteredTool {
  const generated = z.toJSONSchema(tool.inputSchema, { io: 'input' }) as Record<string, unknown>;
  const jsonSchema = Object.fromEntries(
    Object.entries(generated).filter(([key]) => key !== '$schema'),
  );
  return {
    name: tool.name,
    description: tool.description,
    requiresApproval: tool.requiresApproval,
    jsonSchema: { ...jsonSchema, type: 'object' },
    statusText(input) {
      if (typeof tool.statusText === 'string') return tool.statusText;
      const parsed = tool.inputSchema.safeParse(input);
      return parsed.success ? tool.statusText(parsed.data) : tool.name;
    },
    async run(rawInput, context) {
      const parsed = tool.inputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return {
          content: {
            error: 'INVALID_INPUT',
            issues: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
          },
          summary: `Input ${tool.name} tidak valid`,
          isError: true,
        };
      }
      try {
        return await tool.execute(parsed.data, context);
      } catch (error) {
        if (error instanceof ToolError) {
          return { content: { error: error.message }, summary: error.message, isError: true };
        }
        throw error;
      }
    },
  };
}
