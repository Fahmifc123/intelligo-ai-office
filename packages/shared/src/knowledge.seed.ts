/**
 * Example knowledge base for local development and demos. Every figure here is a placeholder
 * marked CONTOH; replace it with official data on the Pengaturan page before real use.
 */
export interface KnowledgeSeed {
  id: string;
  title: string;
  tags: string[];
  content: string;
}

export const KNOWLEDGE_SEED: readonly KnowledgeSeed[] = [
  {
    id: '6b0f3a51-0000-4000-8000-000000000001',
    title: 'Bootcamp Data Science Batch 21 (CONTOH)',
    tags: ['program', 'bootcamp', 'harga', 'jadwal'],
    content: [
      '# Bootcamp Data Science Batch 21',
      '',
      'CONTOH: ganti dengan data resmi sebelum dipakai.',
      '',
      '- Investasi: Rp 7.500.000 (bisa dicicil 2 kali)',
      '- Mulai kelas: 3 November 2026',
      '- Durasi: 12 minggu, kelas Weekend (Sabtu-Minggu) dan Weekdays (Senin, Rabu, Jumat malam)',
      '- Materi: Python, SQL, statistik, machine learning, dashboard, capstone project',
      '- Benefit: mentor praktisi, portofolio, sertifikat, career coaching',
      '- Pendaftaran: [link-pendaftaran]',
    ].join('\n'),
  },
  {
    id: '6b0f3a51-0000-4000-8000-000000000002',
    title: 'Private Course (CONTOH)',
    tags: ['program', 'private', 'harga', 'jadwal'],
    content: [
      '# Private Course',
      '',
      'CONTOH: ganti dengan data resmi sebelum dipakai.',
      '',
      '- Investasi: Rp 450.000 per sesi (90 menit), minimal paket 8 sesi',
      '- Jadwal fleksibel, disepakati dengan trainer',
      '- Topik: Python, data analysis, machine learning, n8n automation',
    ].join('\n'),
  },
  {
    id: '6b0f3a51-0000-4000-8000-000000000003',
    title: 'Corporate Training (CONTOH)',
    tags: ['program', 'corporate', 'proposal', 'harga'],
    content: [
      '# Corporate Training',
      '',
      'CONTOH: ganti dengan data resmi sebelum dipakai.',
      '',
      '- Format: in-house atau online, 2 sampai 5 hari',
      '- Harga ditentukan per penawaran (jumlah peserta, durasi, kustomisasi materi). Jangan menyebut angka tanpa persetujuan.',
      '- Struktur proposal: latar belakang, tujuan, silabus per hari, output terukur, trainer, investasi, fasilitas',
      '- Klien sebelumnya: [nama-klien] (minta izin sebelum menyebut)',
    ].join('\n'),
  },
  {
    id: '6b0f3a51-0000-4000-8000-000000000004',
    title: 'SOP CS WhatsApp',
    tags: ['sop-cs', 'cs', 'whatsapp'],
    content: [
      '# SOP CS WhatsApp',
      '',
      '- Sapa dengan "Halo Kak" dan sebut nama bila diketahui.',
      '- Jawab singkat, jelas, ramah. Tanpa emoji berlebihan.',
      '- Jangan menjanjikan diskon atau jadwal yang tidak ada di knowledge base.',
      '- Akhiri dengan ajakan: kirim link pendaftaran atau tawarkan bantuan cek jadwal.',
      '- Pesan keluar selalu lewat persetujuan Owner (propose_whatsapp_reply).',
    ].join('\n'),
  },
  {
    id: '6b0f3a51-0000-4000-8000-000000000005',
    title: 'Info Pembayaran dan Invoice (CONTOH)',
    tags: ['billing', 'invoice', 'pembayaran'],
    content: [
      '# Info Pembayaran dan Invoice',
      '',
      'CONTOH: ganti dengan data resmi sebelum dipakai.',
      '',
      '- Intelligo ID non-PKP: invoice tanpa PPN.',
      '- Rekening resmi: [nama-bank] [nomor-rekening] a.n. [nama-pemilik]',
      '- Pengingat: H-3 sebelum jatuh tempo, lalu di hari jatuh tempo.',
      '- Cicilan bootcamp: 2 kali, jarak 30 hari.',
    ].join('\n'),
  },
];
