import 'server-only';
import { rankKnowledge, type RankedKnowledge } from '@intelligo/shared';
import { z } from 'zod';
import { getAdminSupabase } from '../supabase/admin';

const Doc = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
});

/** Knowledge search for chat (same ranking as the worker; the org's knowledge base is small). */
export async function searchKnowledgeForChat(
  orgId: string,
  query: string,
  tags: readonly string[] = [],
): Promise<RankedKnowledge[]> {
  const { data } = await getAdminSupabase()
    .from('knowledge_docs')
    .select('id, title, content, tags')
    .eq('org_id', orgId)
    .limit(300);
  const docs = (data ?? []).flatMap((row) => {
    const parsed = Doc.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
  return rankKnowledge(docs, query, tags, 3);
}
