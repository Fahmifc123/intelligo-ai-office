import { ilikePatterns, keywords, rankKnowledge, type RankedKnowledge } from '@intelligo/shared';
import { z } from 'zod';
import type { Queryable } from '../lib/db';

const Candidate = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
});

/** v1 knowledge search: SQL prefilter on tags + ilike, ranked in code (SPEC section 8). */
export async function searchKnowledge(
  q: Queryable,
  orgId: string,
  query: string,
  tags: readonly string[] = [],
  limit = 3,
): Promise<RankedKnowledge[]> {
  const terms = keywords(query);
  const patterns = ilikePatterns(query);
  if (terms.length === 0 && tags.length === 0) return [];
  const result = await q.query(
    `select id::text, title, content, tags from public.knowledge_docs
      where org_id = $1
        and (tags && $2::text[] or tags && $3::text[] or title ilike any($4::text[]) or content ilike any($4::text[]))
      limit 50`,
    [orgId, tags, terms, patterns.length > 0 ? patterns : ['%%%']],
  );
  const docs = result.rows.map((row) => Candidate.parse(row));
  return rankKnowledge(docs, query, tags, limit);
}
