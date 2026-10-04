import { AgentConfig, type ToolName } from './schemas';
import type { AgentConfigInput } from './types';

/** Every agent ends its run by calling submit_result. */
const CORE_TOOLS: readonly ToolName[] = ['submit_result'];

const withCore = (tools: ToolName[]): ToolName[] => [...CORE_TOOLS, ...tools];

const agentInputs: AgentConfigInput[] = [
  {
    id: 'manager',
    name: 'Raka',
    role: 'AI Manager',
    focus: 'Mengkoordinasi tim, membagi tugas, dan mereview kualitas hasil kerja agen lain.',
    deskId: 'd-3-0',
    isManager: true,
    tools: withCore(['delegate_task', 'search_knowledge', 'list_tasks']),
    idleLines: ['Cek hasil sebelum dikirim', 'Prioritaskan antrean tugas', 'Pantau KPI mingguan'],
    appearance: { shirt: '#1f3a6b', hair: '#1b1b1f', skin: '#e8b48c' },
  },
  {
    id: 'cs',
    name: 'Sinta',
    role: 'CS Chat 24 Jam',
    focus:
      'Membalas chat WhatsApp calon peserta dengan ramah, jelas, dan mengarahkan ke pendaftaran.',
    deskId: 'd-0-0',
    tools: withCore(['search_knowledge', 'propose_whatsapp_reply']),
    idleLines: [
      'Balas chat calon peserta',
      'Follow-up pendaftar kemarin',
      'Jawab pertanyaan jadwal kelas',
    ],
    appearance: { shirt: '#e8761a', hair: '#2a1a12', skin: '#f0c39e' },
  },
  {
    id: 'writer',
    name: 'Dimas',
    role: 'Content Writer',
    focus: 'Menulis caption, artikel, dan copy pemasaran yang persuasif.',
    deskId: 'd-1-0',
    tools: withCore(['search_knowledge', 'save_draft']),
    idleLines: ['Draft artikel blog', 'Tulis headline landing page', 'Riset topik konten'],
    appearance: { shirt: '#2f8f83', hair: '#151515', skin: '#d9a07a' },
  },
  {
    id: 'socmed',
    name: 'Laras',
    role: 'Social Media Manager',
    focus: 'Menyusun kalender konten dan strategi media sosial.',
    deskId: 'd-2-0',
    tools: withCore(['save_draft', 'propose_schedule_post']),
    idleLines: ['Jadwalkan 14 posting', 'Balas komentar Instagram', 'Cek insight Reels'],
    appearance: { shirt: '#c2417a', hair: '#3b2416', skin: '#f2c8a5' },
  },
  {
    id: 'leads',
    name: 'Bima',
    role: 'B2B Lead Generator',
    focus: 'Mencari dan menilai calon klien corporate training.',
    deskId: 'd-0-1',
    tools: withCore(['read_sheet', 'score_leads', 'save_draft']),
    idleLines: ['Skor leads: panas / dingin', 'Cari kontak HR perusahaan', 'Rapikan data CRM'],
    appearance: { shirt: '#5b5bd6', hair: '#121212', skin: '#c98e65' },
  },
  {
    id: 'proposal',
    name: 'Nadia',
    role: 'Proposal Writer',
    focus: 'Menyusun proposal dan penawaran pelatihan corporate yang rapi dan meyakinkan.',
    deskId: 'd-1-1',
    tools: withCore(['search_knowledge', 'create_google_doc']),
    idleLines: ['Susun proposal corporate', 'Revisi RAB pelatihan', 'Siapkan quotation'],
    appearance: { shirt: '#8a5a2b', hair: '#24160e', skin: '#efc09a' },
  },
  {
    id: 'billing',
    name: 'Arif',
    role: 'Invoice & Billing',
    focus: 'Mengelola invoice, penagihan, dan pengingat pembayaran dengan sopan.',
    deskId: 'd-2-1',
    tools: withCore(['read_sheet', 'propose_invoice', 'propose_email']),
    idleLines: ['Tagih invoice jatuh tempo', 'Rekap pembayaran cicilan', 'Kirim bukti bayar'],
    appearance: { shirt: '#4e7d2e', hair: '#1a1a1a', skin: '#d6a27c' },
  },
  {
    id: 'curriculum',
    name: 'Wulan',
    role: 'Curriculum Designer',
    focus: 'Merancang silabus, modul, dan learning outcome pelatihan.',
    deskId: 'd-3-1',
    tools: withCore(['search_knowledge', 'create_google_doc']),
    idleLines: ['Update silabus bootcamp', 'Susun modul n8n', 'Buat rubrik penilaian'],
    appearance: { shirt: '#7a3fb0', hair: '#2b1810', skin: '#f3cba8' },
  },
  {
    id: 'analyst',
    name: 'Yoga',
    role: 'Data Analyst',
    focus: 'Menganalisis data penjualan, pendaftaran, dan performa kampanye.',
    deskId: 'd-0-2',
    tools: withCore(['read_sheet', 'run_analysis']),
    idleLines: ['Grafik omzet 3 bulan', 'Analisis konversi iklan', 'Dashboard peserta aktif'],
    appearance: { shirt: '#1f7fb8', hair: '#0f0f12', skin: '#cf9670' },
  },
  {
    id: 'ads',
    name: 'Fajar',
    role: 'Ads Specialist',
    focus: 'Merencanakan dan mengoptimasi iklan berbayar di Meta dan Google.',
    deskId: 'd-1-2',
    tools: withCore(['read_sheet', 'save_draft']),
    idleLines: ['Atur budget iklan Meta', 'A/B test creative', 'Optimasi audiens'],
    appearance: { shirt: '#b8452f', hair: '#161616', skin: '#e0aa82' },
  },
  {
    id: 'scheduler',
    name: 'Citra',
    role: 'Admin Kelas & Jadwal',
    focus: 'Mengatur jadwal kelas, trainer, dan komunikasi teknis ke peserta.',
    deskId: 'd-2-2',
    tools: withCore(['read_sheet', 'propose_whatsapp_broadcast']),
    idleLines: ['Atur jadwal trainer', 'Kirim link Zoom kelas', 'Rekap absensi peserta'],
    appearance: { shirt: '#2d8a4e', hair: '#3a2a1a', skin: '#f1c6a2' },
  },
  {
    id: 'success',
    name: 'Intan',
    role: 'Customer Success',
    focus: 'Menjaga kepuasan peserta dan alumni serta mendorong repeat order.',
    deskId: 'd-3-2',
    tools: withCore(['search_knowledge', 'propose_email', 'save_draft']),
    idleLines: ['Survei kepuasan alumni', 'Kumpulkan testimoni', 'Tawarkan kelas lanjutan'],
    appearance: { shirt: '#c28a12', hair: '#20130c', skin: '#eebf98' },
  },
];

/** The 12 AI agents of Intelligo AI Office, validated at import time. */
export const agentsConfig: readonly AgentConfig[] = agentInputs.map((input) =>
  AgentConfig.parse(input),
);

export const MANAGER_AGENT_ID = 'manager';

export function getAgentConfig(id: string): AgentConfig | undefined {
  return agentsConfig.find((agent) => agent.id === id);
}
