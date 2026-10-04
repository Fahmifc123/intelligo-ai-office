import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { describe, expect, it } from 'vitest';
import { agentsConfig } from '../src/agents.config';
import {
  buildSystemPromptTemplate,
  fillKnowledgeSnippets,
  KNOWLEDGE_PLACEHOLDER,
} from '../src/prompts';
import { generateSeedSql } from '../src/seed';

const repoRoot = resolve(import.meta.dirname, '../../..');

describe('generateSeedSql', () => {
  it('matches the committed supabase/seed.sql (run `pnpm db:seed:gen` if this fails)', () => {
    const example = parseEnv(readFileSync(resolve(repoRoot, '.env.example'), 'utf8'));
    const orgId = example.ORG_ID;
    const modelWork = example.MODEL_WORK;
    if (!orgId || !modelWork) throw new Error('.env.example harus berisi ORG_ID dan MODEL_WORK');
    const committed = readFileSync(resolve(repoRoot, 'supabase/seed.sql'), 'utf8');
    expect(generateSeedSql({ orgId, modelWork })).toBe(committed);
  });

  it('escapes single quotes', () => {
    const agent = agentsConfig[0];
    if (!agent) throw new Error('no agents');
    const sql = generateSeedSql({
      orgId: '00000000-0000-0000-0000-000000000001',
      modelWork: 'm',
      agents: [{ ...agent, focus: "Jum'at review" }],
    });
    expect(sql).toContain("'Jum''at review'");
  });

  it('seeds one agent row and one state row per agent', () => {
    const sql = generateSeedSql({ orgId: '00000000-0000-0000-0000-000000000001', modelWork: 'm' });
    for (const agent of agentsConfig) {
      expect(sql.split(`\n    '${agent.id}',\n`).length - 1, `agent ${agent.id}`).toBe(1);
      expect(sql.split(`  ('${agent.id}', `).length - 1, `state ${agent.id}`).toBe(1);
    }
  });
});

describe('system prompt template', () => {
  const template = buildSystemPromptTemplate({
    name: 'Sinta',
    role: 'CS Chat 24 Jam',
    focus: 'Balas chat.',
  });

  it('fills name, role, and focus and keeps the knowledge placeholder', () => {
    expect(template).toContain('Kamu adalah Sinta, karyawan AI dengan peran CS Chat 24 Jam');
    expect(template).toContain('Tanggung jawab: Balas chat.');
    expect(template).toContain(KNOWLEDGE_PLACEHOLDER);
  });

  it('inserts at most three knowledge snippets', () => {
    const filled = fillKnowledgeSnippets(template, ['A', 'B', 'C', 'D']);
    expect(filled).not.toContain(KNOWLEDGE_PLACEHOLDER);
    expect(filled).toContain('C');
    expect(filled).not.toMatch(/\nD$/);
  });

  it('marks empty knowledge explicitly', () => {
    expect(fillKnowledgeSnippets(template, [])).toContain('(belum ada dokumen yang relevan)');
  });
});
