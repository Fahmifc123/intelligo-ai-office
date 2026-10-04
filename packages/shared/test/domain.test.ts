import { describe, expect, it } from 'vitest';
import { formatKnowledgeSnippet, ilikePatterns, keywords, rankKnowledge } from '../src/knowledge';
import { KNOWLEDGE_SEED } from '../src/knowledge.seed';
import { maskEmail, maskPhone, maskPii } from '../src/mask';
import { computeCostUsd, findPrice, parsePricingOverrides } from '../src/pricing';
import { canTransition, nextAfterReview, nextAfterRun, TASK_TRANSITIONS } from '../src/tasks';
import { TASK_STATUSES } from '../src/schemas';

describe('task state machine', () => {
  it('covers every status', () => {
    expect(Object.keys(TASK_TRANSITIONS).sort()).toEqual([...TASK_STATUSES].sort());
  });

  it('follows the SPEC lifecycle', () => {
    expect(canTransition('queued', 'routing')).toBe(true);
    expect(canTransition('queued', 'in_progress')).toBe(true);
    expect(canTransition('in_progress', 'awaiting_review')).toBe(true);
    expect(canTransition('awaiting_review', 'needs_revision')).toBe(true);
    expect(canTransition('needs_revision', 'in_progress')).toBe(true);
    expect(canTransition('awaiting_approval', 'executing')).toBe(true);
    expect(canTransition('executing', 'done')).toBe(true);
  });

  it('never leaves a terminal status', () => {
    for (const to of TASK_STATUSES) {
      expect(canTransition('done', to)).toBe(false);
      expect(canTransition('cancelled', to)).toBe(false);
    }
    expect(canTransition('done', 'in_progress')).toBe(false);
  });

  it('revises at most twice, then finishes with a manual check flag', () => {
    expect(nextAfterReview('revise', 0, false)).toEqual({
      status: 'needs_revision',
      revisionCount: 1,
      manualCheck: false,
    });
    expect(nextAfterReview('revise', 1, false)).toEqual({
      status: 'needs_revision',
      revisionCount: 2,
      manualCheck: false,
    });
    expect(nextAfterReview('revise', 2, false)).toEqual({
      status: 'done',
      revisionCount: 2,
      manualCheck: true,
    });
    expect(nextAfterReview('revise', 2, true).status).toBe('awaiting_approval');
  });

  it('routes approved work with proposed actions to approval', () => {
    expect(nextAfterReview('approved', 0, true).status).toBe('awaiting_approval');
    expect(nextAfterReview('approved', 1, false).status).toBe('done');
  });

  it('skips review for the manager', () => {
    expect(nextAfterRun(false, false)).toBe('awaiting_review');
    expect(nextAfterRun(true, false)).toBe('done');
    expect(nextAfterRun(true, true)).toBe('awaiting_approval');
  });
});

describe('pricing', () => {
  it('matches model ids by prefix, including dated ids', () => {
    expect(findPrice('claude-haiku-4-5-20251001')).toEqual(findPrice('claude-haiku-4-5'));
    expect(findPrice('claude-sonnet-5-5')?.input).toBe(2);
    expect(findPrice('unknown-model')).toBeUndefined();
  });

  it('computes cost from all token kinds', () => {
    const price = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 };
    expect(
      computeCostUsd(price, {
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }),
    ).toBe(2);
    expect(
      computeCostUsd(price, {
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 2000,
        cacheWriteTokens: 400,
      }),
    ).toBeCloseTo(0.0084, 6);
  });

  it('accepts overrides from MODEL_PRICING_JSON', () => {
    const overrides = parsePricingOverrides(
      '{"my-model":{"input":1,"output":2,"cacheRead":0,"cacheWrite":0}}',
    );
    expect(findPrice('my-model-v2', overrides)?.output).toBe(2);
    expect(() => parsePricingOverrides('{"x":{"input":-1}}')).toThrow();
  });
});

describe('masking', () => {
  it('masks phone numbers and emails', () => {
    expect(maskPhone('081234569950')).toBe('0812****9950');
    expect(maskEmail('fahmi@intelligo.id')).toBe('fa***@intelligo.id');
    expect(maskPii('Hubungi 081234569950 atau budi@contoh.com')).toBe(
      'Hubungi 0812****9950 atau bu***@contoh.com',
    );
  });
});

describe('knowledge search', () => {
  it('extracts keywords without stopwords', () => {
    expect(keywords('Berapa harga Bootcamp untuk Batch 21?')).toEqual([
      'harga',
      'bootcamp',
      'batch',
    ]);
  });

  it('ranks the bootcamp document first for a price question', () => {
    const ranked = rankKnowledge(KNOWLEDGE_SEED, 'harga bootcamp batch 21');
    expect(ranked[0]?.title).toContain('Bootcamp');
    expect(ranked.length).toBeLessThanOrEqual(3);
  });

  it('boosts requested tags', () => {
    const ranked = rankKnowledge(KNOWLEDGE_SEED, 'pengingat', ['billing']);
    expect(ranked[0]?.tags).toContain('billing');
  });

  it('returns nothing when nothing matches', () => {
    expect(rankKnowledge(KNOWLEDGE_SEED, 'kuantum astrofisika')).toEqual([]);
  });

  it('never lets user wildcards into ilike patterns', () => {
    expect(ilikePatterns('diskon 100%_promo')).toEqual(['%diskon%', '%100%', '%promo%']);
  });

  it('formats snippets with a size cap', () => {
    const doc = { id: 'x', title: 'Doc', tags: ['a'], content: 'x'.repeat(50) };
    expect(formatKnowledgeSnippet(doc, 10)).toContain('[dipotong]');
  });
});
