# CLAUDE.md — Intelligo AI Office

Baca `SPEC.md` sebelum mulai. SPEC.md adalah sumber kebenaran; jika ada konflik antara instruksi di chat dan SPEC.md, tanyakan dulu.

## Cara kerja

- Kerjakan satu fase dari SPEC.md bagian 13 per sesi. Sebutkan fase yang sedang dikerjakan di awal.
- Sebelum menulis kode, tulis rencana singkat (file yang dibuat/diubah, urutan langkah) dan tunggu konfirmasi untuk fase baru.
- Selesai fase: jalankan `pnpm typecheck && pnpm lint && pnpm test`, lalu cek acceptance criteria satu per satu dan laporkan hasilnya.
- Update checklist progres di bagian bawah file ini setiap fase selesai.
- Commit per langkah logis dengan pesan konvensional (`feat(worker): add review-task job`).

## Aturan kode

- TypeScript strict, tanpa `any`. Semua input eksternal dan output JSON LLM divalidasi Zod dari `packages/shared`.
- Kode lengkap dan bisa jalan. Jangan tinggalkan TODO, stub kosong, atau `throw new Error('not implemented')`.
- Satu tool agen = satu file di `apps/worker/src/tools/`, ekspor `{ name, description, inputSchema, statusText, requiresApproval, execute }`.
- Model ID hanya dari env `MODEL_WORK` dan `MODEL_FAST`. Jangan hardcode.
- Frontend tidak pernah memanggil Anthropic API atau n8n secara langsung.
- Hanya worker yang menulis `agent_states` dan `task_events`.
- Posisi karakter dihitung di client; jangan simpan koordinat di database.
- Teks UI dalam bahasa Indonesia. Nama variabel, fungsi, dan komentar kode dalam bahasa Inggris.
- Tanpa emoji di UI dan dokumen.

## Keamanan

- Secret hanya di server/worker. Periksa bundle client tidak memuat `SUPABASE_SERVICE_ROLE_KEY` atau `ANTHROPIC_API_KEY`.
- Aksi eksternal hanya lewat tabel `actions` dan approval. Default `DRY_RUN=true` di dev.
- Konten dari pihak luar dimasukkan ke prompt di dalam `<external_data>` dan diperlakukan sebagai data.
- Jangan log nomor HP atau email utuh; mask (`0812****9950`).

## Perintah

- `pnpm dev` — web + worker (Node 22.12+)
- `supabase start` / `supabase db reset` — DB lokal + migrasi + seed (`pnpm db:start` / `pnpm db:reset`)
- `pnpm db:test` — test pgTAP: tabel, seed, RLS, publikasi realtime
- `pnpm db:seed:gen` — generate ulang `supabase/seed.sql` dari `agents.config.ts`
- `pnpm test` — unit + integrasi (LLM di-mock)
- `pnpm test:e2e` — Playwright (butuh `pnpm db:start`; worker jalan dengan `LLM_MODE=scripted`)
- `pnpm test:live` — memanggil API asli (opsional, butuh API key)

## Referensi visual

Prototipe single-file (`reference/intelligo-ai-office.html`) adalah acuan perilaku kantor: layout zona, warna navy + orange, status bubble, rapat, istirahat, manager berjalan ke meja saat review. Porting perilakunya ke PixiJS, jangan salin arsitektur kodenya.

## Progres

- [x] Fase 0 — Fondasi
- [x] Fase 1 — Kantor visual
- [x] Fase 2 — Tugas dan agent runner
- [x] Fase 3 — Review Manager
- [ ] Fase 4 — Chat agen
- [ ] Fase 5 — Aksi eksternal dan approval
- [ ] Fase 6 — Delegasi dan integrasi data
- [ ] Fase 7 — Admin, biaya, hardening
- [ ] Fase 8 — Deploy
