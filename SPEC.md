# Intelligo AI Office — Product & Technical Spec

Versi: 1.0 · Owner: Fahmi (Intelligo ID) · Tanggal: 4 Oktober 2026

Dokumen ini adalah sumber kebenaran untuk membangun Intelligo AI Office dengan Claude Code. Kerjakan per fase (bagian 13). Jangan loncat fase sebelum acceptance criteria fase sebelumnya terpenuhi.

---

## 1. Ringkasan

Intelligo AI Office adalah kantor virtual isometrik berbasis web. Setiap karakter di kantor adalah agen AI dengan peran tetap (CS, Content Writer, Proposal Writer, Billing, dan seterusnya). Owner memberi tugas lewat UI. Agen mengerjakan tugas memakai Claude API dan tool nyata (n8n webhook, Google Drive, Gmail, WhatsApp via n8n). AI Manager mereview setiap hasil sebelum hasil dianggap selesai atau dieksekusi ke dunia nyata.

Visual kantor hanya representasi. Nilai produknya ada di lapisan agen, antrean tugas, review, dan integrasi.

Prototipe referensi (single HTML, Canvas 2D) sudah ada dan dipakai sebagai acuan perilaku visual: karakter berjalan antar meja, status bubble, rapat, istirahat, chat per agen, review oleh manager.

## 2. Tujuan dan non-tujuan

### Tujuan

1. Owner bisa mendelegasikan pekerjaan operasional Intelligo ID ke 12 agen AI dari satu layar.
2. Setiap tugas punya jejak lengkap: siapa mengerjakan, input, output, review, aksi yang dieksekusi, biaya token.
3. Aksi yang berdampak keluar (kirim WA, kirim email, kirim invoice) selalu lewat approval manusia secara default.
4. Visual kantor real-time: status karakter mencerminkan state tugas sebenarnya di backend.
5. Bisa dipakai sebagai demo kelas AI Automation dan sebagai produk yang bisa dijual ke klien.

### Non-tujuan (v1)

- Multi-tenant SaaS dengan billing. v1 single-tenant (Intelligo ID). Skema data tetap menyiapkan `org_id`.
- Agen yang saling chat bebas tanpa tugas. Kolaborasi antar agen hanya lewat delegasi tugas.
- Editor kantor drag-and-drop. Layout kantor didefinisikan di file config.
- Voice / TTS.

## 3. Pengguna dan peran

| Peran  | Akses                                                                    |
| ------ | ------------------------------------------------------------------------ |
| Owner  | Semua: kelola agen, kirim tugas, approve aksi, lihat biaya, ubah setting |
| Staff  | Kirim tugas, chat agen, lihat hasil. Tidak bisa approve aksi eksternal   |
| Viewer | Hanya melihat kantor dan papan tugas (mode demo kelas)                   |

## 4. Arsitektur

```
Browser (Next.js + PixiJS)
  │  HTTPS (server actions / route handlers)
  │  Supabase Realtime (subscribe tasks, agent_states, events)
  ▼
Next.js server (apps/web)
  │  insert task → Postgres
  ▼
Postgres (Supabase) ── pg-boss queue
  ▲                       │
  │                       ▼
  └──── Worker (apps/worker, Node 20)
           ├─ Router (Haiku)       : pilih agen untuk tugas "auto"
           ├─ Agent runner (Sonnet): tool-use loop per tugas
           ├─ Reviewer (Haiku/Sonnet): review hasil
           └─ Tools ─► n8n webhooks, Google Drive, Gmail, internal tools
```

Prinsip:

- Frontend tidak pernah memanggil Claude API langsung. Semua lewat worker.
- Worker adalah satu-satunya proses yang menulis `agent_states` dan `task_events`. Frontend hanya membaca dan merender.
- Visual (posisi karakter, animasi jalan) dihitung di client dari `agent_states.activity`. Posisi tidak disimpan di database.

## 5. Tech stack

| Lapisan        | Pilihan                                               | Catatan                                                                   |
| -------------- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| Monorepo       | pnpm workspaces + Turborepo                           | `apps/web`, `apps/worker`, `packages/shared`                              |
| Frontend       | Next.js 15 (App Router), React 19, TypeScript strict  |                                                                           |
| Render kantor  | PixiJS v8                                             | Isometric 2.5D. Bukan Three.js untuk v1 agar ringan dan mudah di-maintain |
| Styling        | Tailwind CSS v4                                       | Tema navy + orange Intelligo, light dan dark                              |
| Database       | Supabase Postgres + Realtime + Auth                   |                                                                           |
| Queue          | pg-boss                                               | Di atas Postgres yang sama, tanpa Redis                                   |
| LLM            | Anthropic SDK (`@anthropic-ai/sdk`)                   | Kerja: `claude-sonnet-5-5`. Routing & review: `claude-haiku-4-5-20251001` |
| Validasi       | Zod                                                   | Semua input API, output JSON LLM, dan tool input                          |
| Integrasi aksi | n8n (self-host atau cloud) via webhook                | WA, email, invoice, posting sosmed                                        |
| Test           | Vitest (unit), Playwright (e2e)                       |                                                                           |
| Deploy         | Vercel (web), Railway/Fly.io (worker), Supabase cloud |                                                                           |

Model ID dikonfigurasi lewat env, jangan di-hardcode di kode agen.

## 6. Struktur repo

```
intelligo-ai-office/
├─ apps/
│  ├─ web/
│  │  ├─ app/
│  │  │  ├─ (office)/page.tsx            # layar utama kantor
│  │  │  ├─ tasks/[id]/page.tsx          # detail tugas
│  │  │  ├─ agents/page.tsx              # kelola agen
│  │  │  ├─ approvals/page.tsx           # antrean approval aksi
│  │  │  ├─ settings/page.tsx
│  │  │  └─ api/                         # route handlers
│  │  ├─ components/
│  │  │  ├─ office/                      # PixiJS scene
│  │  │  │  ├─ OfficeCanvas.tsx
│  │  │  │  ├─ scene/iso.ts              # proyeksi isometrik
│  │  │  │  ├─ scene/layout.ts           # muat office.layout.json
│  │  │  │  ├─ scene/pathfinding.ts      # A* di grid
│  │  │  │  ├─ scene/AgentSprite.ts
│  │  │  │  └─ scene/StatusBubble.ts
│  │  │  ├─ panel/                       # composer, board, feed, chat
│  │  │  └─ ui/
│  │  └─ lib/ (supabase client, realtime hooks)
│  └─ worker/
│     ├─ src/
│     │  ├─ index.ts                     # boot pg-boss, register jobs
│     │  ├─ jobs/route-task.ts
│     │  ├─ jobs/run-task.ts
│     │  ├─ jobs/review-task.ts
│     │  ├─ jobs/execute-action.ts
│     │  ├─ jobs/idle-tick.ts            # status santai berkala
│     │  ├─ agent/runner.ts              # tool-use loop
│     │  ├─ agent/prompts.ts
│     │  ├─ tools/                       # satu file per tool
│     │  └─ lib/ (anthropic, db, cost)
├─ packages/
│  └─ shared/
│     ├─ src/schemas.ts                  # Zod schema bersama
│     ├─ src/types.ts
│     └─ src/agents.config.ts            # definisi 12 agen
├─ config/
│  └─ office.layout.json                 # grid, meja, zona, spot
├─ supabase/
│  ├─ migrations/
│  └─ seed.sql
├─ SPEC.md
└─ CLAUDE.md
```

## 7. Model data (Postgres)

Semua tabel punya `org_id uuid not null` dan `created_at timestamptz default now()`. RLS aktif di semua tabel, filter `org_id` dari JWT.

```sql
create type agent_activity as enum ('working','idle','break','meeting','walking_to_review','reviewing','offline');
create type task_status as enum ('queued','routing','in_progress','awaiting_review','needs_revision','awaiting_approval','executing','done','failed','cancelled');
create type action_status as enum ('proposed','approved','rejected','executed','failed');

create table agents (
  id text primary key,                  -- 'cs', 'writer', 'manager', ...
  org_id uuid not null,
  name text not null,                   -- 'Sinta'
  role text not null,                   -- 'CS Chat 24 Jam'
  focus text not null,                  -- deskripsi tanggung jawab
  system_prompt text not null,
  model text not null,                  -- diisi dari env default, bisa override
  tools text[] not null default '{}',   -- nama tool yang boleh dipakai
  desk_id text not null,                -- referensi ke office.layout.json
  appearance jsonb not null,            -- {shirt, hair, skin}
  idle_lines text[] not null default '{}',
  is_manager boolean not null default false,
  enabled boolean not null default true,
  monthly_token_budget int,             -- null = tanpa batas
  created_at timestamptz default now()
);

create table agent_states (
  agent_id text primary key references agents(id),
  org_id uuid not null,
  activity agent_activity not null default 'idle',
  status_text text not null default '',
  current_task_id uuid,
  target_spot text,                     -- 'desk' | 'pantry' | 'meeting' | 'desk:<agent_id>'
  updated_at timestamptz default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  title text not null,
  instructions text,
  requested_by uuid not null,           -- auth.users.id
  assignee_id text references agents(id),
  assign_mode text not null check (assign_mode in ('auto','manual')),
  parent_task_id uuid references tasks(id),   -- untuk delegasi antar agen
  status task_status not null default 'queued',
  priority smallint not null default 2, -- 1 tinggi, 3 rendah
  result_text text,
  result_json jsonb,
  revision_count int not null default 0,
  error text,
  created_at timestamptz default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table task_events (                 -- timeline + activity feed
  id bigserial primary key,
  org_id uuid not null,
  task_id uuid references tasks(id),
  agent_id text references agents(id),
  type text not null,                     -- 'routed','started','tool_call','tool_result','draft','review','approval','executed','failed','note'
  payload jsonb not null default '{}',
  created_at timestamptz default now()
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  task_id uuid not null references tasks(id),
  reviewer_id text not null references agents(id),
  verdict text not null check (verdict in ('approved','revise')),
  notes text not null,
  scores jsonb,                           -- {accuracy, tone, completeness} 1-5
  created_at timestamptz default now()
);

create table actions (                     -- aksi berdampak eksternal
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  task_id uuid not null references tasks(id),
  agent_id text not null references agents(id),
  kind text not null,                     -- 'send_whatsapp','send_email','create_invoice','schedule_post'
  payload jsonb not null,
  status action_status not null default 'proposed',
  approved_by uuid,
  approved_at timestamptz,
  executed_at timestamptz,
  response jsonb,
  created_at timestamptz default now()
);

create table chat_messages (
  id bigserial primary key,
  org_id uuid not null,
  agent_id text not null references agents(id),
  user_id uuid not null,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz default now()
);

create table llm_usage (
  id bigserial primary key,
  org_id uuid not null,
  agent_id text references agents(id),
  task_id uuid references tasks(id),
  purpose text not null,                  -- 'route','run','review','chat'
  model text not null,
  input_tokens int not null,
  output_tokens int not null,
  cache_read_tokens int not null default 0,
  cost_usd numeric(10,6) not null,
  created_at timestamptz default now()
);

create table knowledge_docs (              -- konteks perusahaan untuk agen
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  title text not null,
  content text not null,                  -- markdown
  tags text[] not null default '{}',      -- 'harga','program','sop-cs'
  updated_at timestamptz default now()
);
```

Realtime: aktifkan publikasi untuk `agent_states`, `tasks`, `task_events`, `actions`.

## 8. Definisi agen

Disimpan di `packages/shared/src/agents.config.ts` lalu di-seed ke tabel `agents`.

```ts
export const AgentConfig = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  focus: z.string(),
  deskId: z.string(),
  isManager: z.boolean().default(false),
  tools: z.array(z.string()),
  idleLines: z.array(z.string()).min(2),
  appearance: z.object({ shirt: z.string(), hair: z.string(), skin: z.string() }),
});
```

| id         | Nama  | Peran                | Tools utama                                       |
| ---------- | ----- | -------------------- | ------------------------------------------------- |
| manager    | Raka  | AI Manager           | `delegate_task`, `search_knowledge`, `list_tasks` |
| cs         | Sinta | CS Chat 24 Jam       | `search_knowledge`, `propose_whatsapp_reply`      |
| writer     | Dimas | Content Writer       | `search_knowledge`, `save_draft`                  |
| socmed     | Laras | Social Media Manager | `save_draft`, `propose_schedule_post`             |
| leads      | Bima  | B2B Lead Generator   | `read_sheet`, `score_leads`, `save_draft`         |
| proposal   | Nadia | Proposal Writer      | `search_knowledge`, `create_google_doc`           |
| billing    | Arif  | Invoice & Billing    | `read_sheet`, `propose_invoice`, `propose_email`  |
| curriculum | Wulan | Curriculum Designer  | `search_knowledge`, `create_google_doc`           |
| analyst    | Yoga  | Data Analyst         | `read_sheet`, `run_analysis`                      |
| ads        | Fajar | Ads Specialist       | `read_sheet`, `save_draft`                        |
| scheduler  | Citra | Admin Kelas & Jadwal | `read_sheet`, `propose_whatsapp_broadcast`        |
| success    | Intan | Customer Success     | `search_knowledge`, `propose_email`, `save_draft` |

### Template system prompt

```
Kamu adalah {name}, karyawan AI dengan peran {role} di Intelligo ID,
lembaga pelatihan Data Science & AI di Bandung (bootcamp, private course,
corporate training untuk perusahaan dan instansi).

Tanggung jawab: {focus}

Aturan:
- Bahasa Indonesia natural dan profesional. Tanpa emoji di dokumen formal.
- Jangan mengarang harga, nama klien, angka, atau jadwal. Cari dulu dengan
  search_knowledge. Jika tidak ada, tulis placeholder [harga], [tanggal].
- Aksi yang keluar ke pihak luar hanya boleh lewat tool propose_*. Kamu tidak
  pernah mengirim apa pun langsung.
- Jika tugas di luar peranmu, gunakan delegate_task (hanya Manager) atau
  jelaskan di hasil bahwa tugas sebaiknya dialihkan.
- Akhiri dengan memanggil tool submit_result.

Konteks perusahaan:
{knowledge_snippets}
```

`knowledge_snippets` diisi maksimal 3 dokumen paling relevan dari `knowledge_docs` (v1: pencarian berbasis tag + `ilike`; v2: pgvector).

## 9. Siklus hidup tugas

```
queued ──(auto)──► routing ──► in_progress
   └──(manual)──────────────►  in_progress
in_progress ──► awaiting_review ──► (approved) ──► [ada action proposed?]
                     │                                ├─ ya ► awaiting_approval ─► executing ─► done
                     │                                └─ tidak ► done
                     └──(revise, revision_count < 2) ► needs_revision ─► in_progress
                     └──(revise, revision_count >= 2) ► done (flag "perlu cek manual")
any ──(error 3x)──► failed
any ──(owner)──► cancelled
```

Aturan:

- Manager tidak mereview tugasnya sendiri. Tugas milik Manager langsung ke `done` atau `awaiting_approval`.
- Satu agen mengerjakan satu tugas dalam satu waktu. Tugas lain mengantre (pg-boss `singletonKey = agent_id`).
- Prioritas 1 diambil lebih dulu.
- Review dijalankan berurutan per manager (satu review aktif), karena karakter manager harus berjalan ke meja agen.

### Job pg-boss

| Job              | Trigger                        | Isi                                                                                  |
| ---------------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| `route-task`     | insert task `assign_mode=auto` | Haiku, output JSON `{agent_id, reason}`, validasi Zod, fallback ke `manager`         |
| `run-task`       | task masuk `in_progress`       | Agent runner (bagian 10)                                                             |
| `review-task`    | task masuk `awaiting_review`   | Set manager `walking_to_review` → `reviewing`, panggil reviewer, tulis `reviews`     |
| `execute-action` | action `approved`              | Panggil n8n webhook sesuai `kind`, simpan response                                   |
| `idle-tick`      | cron tiap 20 detik             | Agen tanpa tugas: acak status santai (kerja ringan 60%, pantry 20%, jalan-jalan 20%) |

Setiap perubahan state menulis `agent_states` + satu baris `task_events`.

## 10. Agent runner (tool-use loop)

Pseudocode `apps/worker/src/agent/runner.ts`:

```ts
async function runTask(task, agent) {
  setState(agent.id, 'working', `Mengerjakan: ${task.title}`, task.id);
  const messages = [{ role: 'user', content: buildTaskPrompt(task) }];
  for (let step = 0; step < MAX_STEPS /* 8 */; step++) {
    const res = await anthropic.messages.create({
      model: agent.model,
      max_tokens: 4096,
      system: [
        { type: 'text', text: buildSystemPrompt(agent), cache_control: { type: 'ephemeral' } },
      ],
      tools: toolDefsFor(agent),
      messages,
    });
    recordUsage(res.usage, agent, task, 'run');
    if (res.stop_reason !== 'tool_use') break;
    const results = [];
    for (const block of res.content.filter((b) => b.type === 'tool_use')) {
      logEvent(task, 'tool_call', { name: block.name, input: block.input });
      setState(agent.id, 'working', toolStatusText(block.name)); // "Cari info harga", dll
      const out = await executeTool(block.name, block.input, ctx); // Zod-validated
      logEvent(task, 'tool_result', { name: block.name, summary: summarize(out) });
      results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out) });
      if (block.name === 'submit_result') return finish(task, block.input);
    }
    messages.push({ role: 'assistant', content: res.content }, { role: 'user', content: results });
  }
  fail(task, 'Agen tidak menyelesaikan tugas dalam batas langkah');
}
```

Ketentuan:

- `MAX_STEPS = 8`, timeout total 5 menit per tugas.
- Cek `monthly_token_budget` sebelum mulai. Jika habis, tugas `failed` dengan pesan jelas.
- Retry otomatis hanya untuk error API 429/5xx, maksimal 3 kali dengan backoff eksponensial.
- Prompt caching pada system prompt dan definisi tool.

### Daftar tool

Semua tool: Zod schema input, fungsi `execute(input, ctx)`, dan `statusText` untuk bubble.

| Tool                         | Efek                                                                                | Butuh approval                 |
| ---------------------------- | ----------------------------------------------------------------------------------- | ------------------------------ |
| `submit_result`              | `{summary, content, format: 'text'                                                  | 'markdown'}` → simpan hasil    | -   |
| `search_knowledge`           | cari `knowledge_docs`                                                               | -                              |
| `save_draft`                 | simpan draft ke `result_json.drafts[]`                                              | -                              |
| `list_tasks`                 | lihat tugas berjalan                                                                | -                              |
| `delegate_task`              | buat subtask untuk agen lain (manager only, maks 3 per tugas)                       | -                              |
| `read_sheet`                 | baca Google Sheet via n8n webhook `GET`                                             | -                              |
| `score_leads`                | skor leads dengan rubrik tetap, output tabel                                        | -                              |
| `run_analysis`               | agregasi data dari sheet (sum, group by, tren) di worker, tanpa eksekusi kode bebas | -                              |
| `create_google_doc`          | buat Google Doc via n8n, kembalikan URL                                             | Tidak (internal), tapi dicatat |
| `propose_whatsapp_reply`     | buat `actions` kind `send_whatsapp`                                                 | Ya                             |
| `propose_whatsapp_broadcast` | buat `actions` kind `send_whatsapp_bulk`, maks 50 penerima                          | Ya, wajib Owner                |
| `propose_email`              | buat `actions` kind `send_email`                                                    | Ya                             |
| `propose_invoice`            | buat `actions` kind `create_invoice`                                                | Ya                             |
| `propose_schedule_post`      | buat `actions` kind `schedule_post`                                                 | Ya                             |

Setting `auto_approve_kinds` di tabel settings (default kosong) memungkinkan Owner mengizinkan kind tertentu tanpa approval manual.

### Reviewer

Input: tugas, hasil, actions proposed. Output JSON (Zod):

```json
{ "verdict": "approved" | "revise", "notes": "maks 40 kata", "scores": { "accuracy": 1-5, "tone": 1-5, "completeness": 1-5 } }
```

Rubrik review di prompt: tidak ada angka/harga karangan, sesuai peran, bahasa sesuai, aksi eksternal masuk akal dan alamat penerima valid. Jika `revise`, catatan reviewer dikirim sebagai pesan tambahan ke runner pada iterasi berikutnya.

## 11. Integrasi n8n

Worker memanggil n8n lewat satu helper `callN8n(workflow, payload)`.

- Base URL dan secret dari env: `N8N_BASE_URL`, `N8N_WEBHOOK_SECRET`.
- Header `X-Intelligo-Signature: HMAC-SHA256(body, secret)`. Workflow n8n wajib memverifikasi.
- Workflow minimal yang disiapkan di n8n (nama webhook path):
  - `sheet-read` → baca range Google Sheet, kembalikan JSON rows
  - `doc-create` → buat Google Doc dari markdown, kembalikan URL
  - `wa-send` → kirim WA (via provider WA yang dipakai Intelligo)
  - `email-send` → kirim email dari akun resmi
  - `invoice-create` → buat invoice (template Intelligo, tanpa PPN karena non-PKP)
  - `post-schedule` → jadwalkan posting
- Timeout 30 detik. Response non-2xx → action `failed`, simpan body error.
- Mode `DRY_RUN=true` (default di dev): `execute-action` tidak memanggil n8n, hanya log payload.

Sertakan folder `n8n/` berisi export JSON workflow contoh untuk `sheet-read` dan `wa-send` (dry-run).

## 12. Spesifikasi UI

### 12.1 Layar utama `/`

Layout desktop: header, canvas kantor (kiri, fleksibel), panel operasional (kanan, 400px). Mobile: canvas di atas (tinggi ~65vw), panel di bawah.

Header: logo, chip status (jumlah bekerja / istirahat / rapat), jumlah tugas selesai hari ini, biaya hari ini (USD + perkiraan IDR), jam WIB, badge approval tertunda.

### 12.2 Canvas kantor (PixiJS)

- Grid 22 × 16 tile, tile 64 × 32 px pada skala 1. Layout dari `config/office.layout.json`:
  ```json
  { "grid": {"w": 22, "h": 16},
    "zones": [{"id":"work","rect":[0,0,13,16]}, {"id":"meeting","rect":[15,1,6,6]}, {"id":"pantry","rect":[15,9,7,7]}],
    "desks": [{"id":"d-0-0","x":1.8,"y":2,"seat":[1.8,3.25]}, "..."],
    "spots": {"pantry": [[19.7,10.4], "..."], "meeting": [[16.1,3.5], "..."], "lounge": [[16,13], "..."]},
    "walls": [...], "furniture": [...] }
  ```
- Pathfinding A* di grid 0.5 tile dengan obstacle dari `desks`, `walls`, `furniture`.
- Depth sorting berdasarkan `x + y`.
- Pemetaan `agent_states.activity` → perilaku visual:

| activity          | Target                                                      | Animasi                     |
| ----------------- | ----------------------------------------------------------- | --------------------------- |
| working           | kursi meja sendiri                                          | duduk, monitor menyala      |
| idle              | spot lounge/acak                                            | jalan, berdiri              |
| break             | spot pantry                                                 | berdiri, cangkir            |
| meeting           | spot ruang rapat                                            | duduk di meja rapat         |
| walking_to_review | samping meja agen yang direview (`target_spot = desk:<id>`) | jalan                       |
| reviewing         | samping meja agen                                           | berdiri, ikon kaca pembesar |
| offline           | tidak dirender                                              | -                           |

- Status bubble: titik warna activity, nama peran, `status_text` dipotong 26 karakter. Toggle tampil/sembunyi.
- Klik karakter: buka chat agen. Hover: highlight cincin oranye.
- Target 60 fps dengan 12 agen di laptop kelas menengah. Pause render saat tab tidak terlihat.
- Tema light dan dark mengikuti sistem, warna diambil dari CSS variables.

### 12.3 Panel operasional

1. **Composer tugas**: textarea, dropdown penerima (`Otomatis` default + 12 agen), prioritas, tombol kirim. Ctrl/Cmd+Enter untuk kirim. Chip contoh tugas.
2. **Tab Tim**: daftar agen, status, jumlah antrean.
3. **Tab Papan**: kolom Berjalan (queued, routing, in_progress, awaiting_review, needs_revision), Menunggu approval, Selesai. Kartu menampilkan agen, badge status, hasil (streaming saat dikerjakan), catatan review, tombol Salin, link ke detail.
4. **Tab Aktivitas**: feed dari `task_events`, terbaru di atas.
5. **Chat agen**: riwayat dari `chat_messages`, streaming jawaban. Chat tidak menjalankan tool propose_* (hanya `search_knowledge`).

### 12.4 `/approvals`

Daftar `actions` berstatus `proposed`: preview payload yang mudah dibaca (mis. bubble WA, preview email), tombol Setujui, Tolak, Edit lalu setujui. Edit menyimpan payload baru dan mencatat `task_events.type = 'approval'` dengan diff.

### 12.5 `/tasks/[id]`

Timeline lengkap dari `task_events`, tool calls (collapsible), hasil final, review, actions, biaya token tugas.

### 12.6 `/agents`

Tabel agen: aktif/nonaktif, edit system prompt, tools yang diizinkan, budget token bulanan, pemakaian bulan ini.

### 12.7 `/settings`

Knowledge base (CRUD `knowledge_docs`), `auto_approve_kinds`, mode dry-run, kurs USD→IDR untuk tampilan.

### Tombol global

- **Rapat tim**: semua agen tanpa tugas aktif → activity `meeting` selama 25 detik (state di backend agar semua viewer melihat sama).
- **Jam istirahat**: agen tanpa tugas → `break`. Antrean tetap diproses.

## 13. Plan per fase

Setiap fase diakhiri: semua test lulus, `pnpm typecheck` dan `pnpm lint` bersih, demo singkat sesuai acceptance criteria.

### Fase 0 — Fondasi (0,5 hari)

- Monorepo pnpm + Turborepo, TypeScript strict, ESLint, Prettier.
- Supabase project lokal (`supabase start`), migrasi bagian 7, seed 12 agen + `office.layout.json`.
- `.env.example` lengkap (bagian 15).
- **AC**: `pnpm dev` menjalankan web dan worker; tabel dan seed ada; RLS aktif.

### Fase 1 — Kantor visual statis-dinamis (1–2 hari)

- PixiJS scene: lantai, dinding, meja, ruang rapat, pantry, tanaman, 12 karakter.
- A* pathfinding, depth sorting, status bubble, klik/hover.
- Subscribe `agent_states` via Supabase Realtime; ubah baris secara manual di DB → karakter berpindah.
- Job `idle-tick` di worker.
- Tombol Rapat tim dan Jam istirahat.
- **AC**: mengubah `activity` satu agen di DB membuat karakter berjalan ke target dalam < 1 detik di dua browser sekaligus; tidak ada karakter menembus meja; 60 fps.

### Fase 2 — Tugas dan agent runner (2 hari)

- Composer, tab Papan, tab Aktivitas.
- Jobs `route-task`, `run-task` dengan tool: `submit_result`, `search_knowledge`, `save_draft`, `list_tasks`.
- Streaming hasil: runner menulis draft parsial ke `tasks.result_text` maks tiap 1 detik.
- Pencatatan `llm_usage` dan biaya.
- **AC**: tugas "Buat caption promo Bootcamp Batch 21" dengan mode Otomatis diarahkan ke Dimas, karakter Dimas ke meja, hasil muncul bertahap, status `awaiting_review`; biaya tercatat.

### Fase 3 — Review oleh Manager (1 hari)

- Job `review-task`, tabel `reviews`, siklus revisi maksimal 2 kali.
- Animasi manager berjalan ke meja agen lalu kembali.
- **AC**: tugas dengan hasil yang sengaja dibuat mengandung harga karangan mendapat `revise`, agen merevisi, lalu `approved`. Manager tidak pernah mereview dua tugas bersamaan.

### Fase 4 — Chat agen (0,5 hari)

- Panel chat, `chat_messages`, streaming via route handler yang memanggil worker endpoint internal atau langsung Anthropic dari server Next.js (hanya untuk chat, tanpa tool eksternal).
- **AC**: chat dengan Sinta menjawab pertanyaan harga memakai `knowledge_docs`, riwayat tersimpan setelah reload.

### Fase 5 — Aksi eksternal dan approval (2 hari)

- Tool `propose_*`, tabel `actions`, halaman `/approvals`, job `execute-action`, helper n8n + HMAC, mode dry-run.
- Export workflow n8n contoh di `n8n/`.
- **AC**: tugas "Balas calon peserta 0812xxxx yang tanya jadwal Batch 21" menghasilkan action `send_whatsapp` di `/approvals`; setelah disetujui dengan `DRY_RUN=false`, n8n menerima payload ber-signature valid; tanpa approval tidak ada yang terkirim.

### Fase 6 — Delegasi dan integrasi data (1–2 hari)

- `delegate_task` untuk Manager, subtask tampil sebagai turunan di Papan.
- `read_sheet`, `score_leads`, `run_analysis`, `create_google_doc`.
- **AC**: tugas "Siapkan penawaran untuk lead panas minggu ini" ke Manager → subtask ke Bima (skor leads) lalu Nadia (proposal Google Doc), hasil akhir berisi link Doc.

### Fase 7 — Admin, biaya, hardening (1 hari)

- `/agents`, `/settings`, `/tasks/[id]`, budget token per agen, rate limit kirim tugas (20/jam/user).
- Auth Supabase (email magic link), peran Owner/Staff/Viewer.
- Mode demo untuk kelas: Viewer melihat kantor read-only.
- Playwright e2e untuk alur Fase 2, 3, 5.
- **AC**: Staff tidak bisa approve; agen yang budgetnya habis menolak tugas dengan pesan jelas; semua e2e lulus.

### Fase 8 — Deploy (0,5 hari)

- Vercel (web), Railway/Fly (worker, 1 instance), Supabase cloud, domain `office.intelligo.id`.
- Health check worker, log terstruktur (pino), alert sederhana jika job gagal > 3 kali berturut.
- **AC**: produksi berjalan, satu tugas end-to-end berhasil dari domain publik.

Total estimasi: 10–13 hari kerja dengan Claude Code.

## 14. Keamanan dan biaya

- `ANTHROPIC_API_KEY`, secret n8n, service role Supabase hanya ada di worker dan server Next.js. Tidak pernah di client bundle.
- RLS: user hanya mengakses baris `org_id` miliknya. Worker memakai service role.
- Semua output LLM yang dipakai sebagai data (routing, review, tool input) divalidasi Zod. Gagal validasi → satu retry dengan pesan error, lalu fallback.
- Konten dari luar (isi chat calon peserta, isi sheet) diperlakukan sebagai data. Taruh di blok `<external_data>` dalam prompt dan instruksikan agen untuk tidak mengikuti instruksi di dalamnya.
- Broadcast WA dibatasi 50 penerima dan wajib approval Owner.
- Data pribadi peserta (nomor HP, email) tidak dikirim ke log aplikasi; log memakai versi termask.
- Biaya: tampilkan per tugas, per agen, per hari. Default budget bulanan per agen 2 juta token input, bisa diubah.

## 15. Environment variables

```
# web + worker
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=                      # untuk pg-boss
ORG_ID=                            # single-tenant v1

# worker
ANTHROPIC_API_KEY=
MODEL_WORK=claude-sonnet-5-5
MODEL_FAST=claude-haiku-4-5-20251001
N8N_BASE_URL=
N8N_WEBHOOK_SECRET=
DRY_RUN=true
USD_TO_IDR=16000
MAX_STEPS=8
```

## 16. Testing

- Unit (Vitest): proyeksi iso, A*, mesin state tugas, schema Zod, kalkulasi biaya, HMAC.
- Integrasi: runner dengan Anthropic client di-mock (fixture response tool_use), job pg-boss terhadap DB lokal.
- E2E (Playwright): kirim tugas → hasil → review; approval aksi dry-run.
- Fixture LLM disimpan di `apps/worker/test/fixtures/` agar test tidak memanggil API sungguhan. Satu test opsional `pnpm test:live` memanggil API asli.

## 17. Pertanyaan terbuka

1. Provider WhatsApp yang dipakai Intelligo saat ini (Fonnte, Wablas, WA Cloud API) menentukan workflow `wa-send`.
2. Sumber data leads dan pembayaran: Google Sheet mana dan struktur kolomnya.
3. Apakah kantor perlu bisa diakses peserta kelas sebagai demo publik (mode Viewer tanpa login).
4. Apakah v2 akan dijual ke klien (multi-tenant), yang mempengaruhi prioritas `org_id` dan billing.
