/** Minimal stopword list so common Indonesian words do not dominate keyword matching. */
const STOPWORDS = new Set([
  'yang',
  'dan',
  'untuk',
  'dengan',
  'dari',
  'atau',
  'ini',
  'itu',
  'ada',
  'akan',
  'pada',
  'kami',
  'kita',
  'saya',
  'anda',
  'kak',
  'buat',
  'buatkan',
  'tolong',
  'mohon',
  'bisa',
  'juga',
  'sudah',
  'belum',
  'apa',
  'berapa',
  'bagaimana',
  'tentang',
  'para',
  'agar',
  'supaya',
  'the',
  'and',
  'for',
]);

/** Lowercased keywords (3+ characters, no stopwords, deduplicated). */
export function keywords(text: string, max = 12): string[] {
  const words = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return [...new Set(words)].slice(0, max);
}

export interface KnowledgeCandidate {
  id: string;
  title: string;
  content: string;
  tags: string[];
}

export interface RankedKnowledge extends KnowledgeCandidate {
  score: number;
}

/**
 * Scores documents against a query (SPEC 8: v1 tag + ilike search; the SQL prefilter uses ilike,
 * this ranks the candidates). Tag hits weigh most, then title, then body occurrences.
 */
export function rankKnowledge(
  docs: readonly KnowledgeCandidate[],
  query: string,
  tags: readonly string[] = [],
  limit = 3,
): RankedKnowledge[] {
  const terms = keywords(query);
  const wantedTags = new Set(tags.map((t) => t.toLowerCase()));
  const ranked = docs.map((doc) => {
    const title = doc.title.toLowerCase();
    const body = doc.content.toLowerCase();
    const docTags = doc.tags.map((t) => t.toLowerCase());
    let score = 0;
    for (const tag of docTags) {
      if (wantedTags.has(tag)) score += 5;
      if (terms.includes(tag)) score += 3;
    }
    for (const term of terms) {
      if (title.includes(term)) score += 2;
      const hits = body.split(term).length - 1;
      score += Math.min(hits, 3);
    }
    return { ...doc, score };
  });
  return ranked
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}

/** ilike patterns for the SQL prefilter (escapes % and _). */
export function ilikePatterns(query: string): string[] {
  return keywords(query).map((term) => `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
}

/** Formats documents for the system prompt's knowledge section. */
export function formatKnowledgeSnippet(doc: KnowledgeCandidate, maxChars = 1800): string {
  const body =
    doc.content.length > maxChars ? `${doc.content.slice(0, maxChars)}\n[dipotong]` : doc.content;
  return `## ${doc.title}\nTag: ${doc.tags.join(', ') || '-'}\n\n${body}`;
}
