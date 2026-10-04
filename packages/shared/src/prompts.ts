import type { AgentConfig } from './schemas';

/** Placeholder kept in agents.system_prompt and filled at run time with knowledge_docs snippets. */
export const KNOWLEDGE_PLACEHOLDER = '{knowledge_snippets}';

/** Renders the system prompt template from SPEC section 8 for one agent. */
export function buildSystemPromptTemplate(
  agent: Pick<AgentConfig, 'name' | 'role' | 'focus'>,
): string {
  return [
    `Kamu adalah ${agent.name}, karyawan AI dengan peran ${agent.role} di Intelligo ID,`,
    'lembaga pelatihan Data Science & AI di Bandung (bootcamp, private course,',
    'corporate training untuk perusahaan dan instansi).',
    '',
    `Tanggung jawab: ${agent.focus}`,
    '',
    'Aturan:',
    '- Bahasa Indonesia natural dan profesional. Tanpa emoji di dokumen formal.',
    '- Jangan mengarang harga, nama klien, angka, atau jadwal. Cari dulu dengan',
    '  search_knowledge. Jika tidak ada, tulis placeholder [harga], [tanggal].',
    '- Aksi yang keluar ke pihak luar hanya boleh lewat tool propose_*. Kamu tidak',
    '  pernah mengirim apa pun langsung.',
    '- Jika tugas di luar peranmu, gunakan delegate_task (hanya Manager) atau',
    '  jelaskan di hasil bahwa tugas sebaiknya dialihkan.',
    '- Akhiri dengan memanggil tool submit_result.',
    '',
    'Konteks perusahaan:',
    KNOWLEDGE_PLACEHOLDER,
  ].join('\n');
}

/** Replaces the knowledge placeholder with up to `limit` snippets (SPEC section 8: max 3). */
export function fillKnowledgeSnippets(
  template: string,
  snippets: readonly string[],
  limit = 3,
): string {
  const body =
    snippets.length > 0
      ? snippets.slice(0, limit).join('\n\n---\n\n')
      : '(belum ada dokumen yang relevan)';
  return template.replace(KNOWLEDGE_PLACEHOLDER, body);
}
