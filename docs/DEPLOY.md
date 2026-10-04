# Deploy Intelligo AI Office

Target produksi (SPEC 13, Fase 8):

| Komponen                       | Layanan                      | Catatan                                     |
| ------------------------------ | ---------------------------- | ------------------------------------------- |
| Database, auth, realtime       | Supabase cloud               | Region Singapore (`ap-southeast-1`)         |
| Web (Next.js)                  | Vercel                       | Domain `office.intelligo.id`, region `sin1` |
| Worker (pg-boss, agent runner) | Railway atau Fly.io          | Tepat satu instance                         |
| Workflow eksternal             | n8n (self-hosted atau cloud) | Webhook ber-HMAC                            |

Urutan: Supabase, worker, web, n8n, lalu uji end-to-end dari domain publik.

## 1. Supabase cloud

1. Buat project baru di region Singapore. Simpan password database.
2. Hubungkan repo dan jalankan migrasi:

   ```bash
   supabase login
   supabase link --project-ref <project-ref>
   supabase db push            # semua file di supabase/migrations
   ```

3. Seed produksi (12 agen, settings, anggota asli). Buat `.env.production` di root (sudah di-gitignore):

   ```bash
   ORG_ID=<uuid baru, mis. dari `uuidgen`>
   MODEL_WORK=claude-sonnet-5-5
   OWNER_EMAILS=owner@intelligo.id
   STAFF_EMAILS=cs@intelligo.id,marketing@intelligo.id
   VIEWER_EMAILS=
   # true untuk ikut memasukkan 5 dokumen CONTOH ke knowledge base
   SEED_SAMPLE_KNOWLEDGE=false
   ```

   ```bash
   pnpm db:seed:prod
   psql "<connection string session pooler>" -f supabase/seed.production.sql
   ```

   Jalankan sekali saja. Menjalankan ulang akan mengembalikan daftar tools agen yang sudah diubah di halaman Agen. Setelah itu anggota dan knowledge base dikelola dari halaman Pengaturan.

4. Authentication > URL Configuration:
   - Site URL: `https://office.intelligo.id`
   - Redirect URLs: `https://office.intelligo.id/auth/callback`, `https://office.intelligo.id/auth/confirm`
5. Authentication > Email Templates > Magic Link: subjek `Link masuk Intelligo AI Office`, isi dari `supabase/templates/magic_link.html` (link ke `{{ .SiteURL }}/auth/confirm?token_hash=...`). Lakukan hal yang sama untuk template Confirm signup, karena login pertama seorang anggota memakai template itu.
6. Authentication > SMTP: pasang SMTP sendiri (mis. Google Workspace atau Resend). SMTP bawaan Supabase dibatasi beberapa email per jam dan tidak cocok untuk produksi.
7. Sign up tetap aktif (magic link membuat user saat login pertama). Akses dibatasi oleh tabel `org_members`: server action login hanya mengirim link ke email yang terdaftar, dan RLS hanya membuka data untuk user dengan klaim `org_id`.
8. Realtime tidak perlu diatur manual; migrasi sudah menambahkan tabel ke publikasi `supabase_realtime`.
9. Catat dari Project Settings > API: Project URL, anon key, service role key. Dari Database > Connect: connection string **Session pooler** (port 5432).

Verifikasi: `supabase test db --linked` menjalankan test pgTAP (RLS, seed, publikasi) terhadap project cloud.

## 2. Worker (Railway atau Fly.io)

Worker memakai `LISTEN/NOTIFY` dan advisory lock pg-boss, jadi `DATABASE_URL` harus koneksi sesi: direct connection (`db.<ref>.supabase.co:5432`, IPv6) atau Session pooler (`...pooler.supabase.com:5432`). Jangan memakai Transaction pooler (port 6543).

Jalankan tepat satu instance. Antrean `run-task` memakai singleton per agen dan dispatcher mengasumsikan satu pendengar.

### Environment worker

| Variabel                                                    | Nilai                                                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                              | Connection string sesi (lihat di atas)                                                           |
| `ORG_ID`                                                    | Sama dengan seed                                                                                 |
| `ANTHROPIC_API_KEY`                                         | Key produksi                                                                                     |
| `MODEL_WORK` / `MODEL_FAST`                                 | `claude-sonnet-5-5` / `claude-haiku-4-5-20251001`                                                |
| `N8N_BASE_URL`                                              | Mis. `https://n8n.intelligo.id/webhook`                                                          |
| `N8N_WEBHOOK_SECRET`                                        | Secret acak panjang, sama dengan di n8n                                                          |
| `DRY_RUN`                                                   | `false` (Owner masih bisa menyalakan dry-run dari Pengaturan; seed memulai dengan dry-run aktif) |
| `ALERT_WEBHOOK_URL`                                         | Opsional: incoming webhook Slack atau Discord                                                    |
| `LOG_LEVEL`                                                 | `info`                                                                                           |
| `USD_TO_IDR`, `MAX_STEPS`, `EFFORT_WORK`, `TASK_TIMEOUT_MS` | Opsional, default sesuai `.env.example`                                                          |

Jangan set `LLM_MODE` (default `live`). Worker menolak `LLM_MODE=scripted` saat `NODE_ENV=production`.

### Railway

`railway.json` di root sudah menunjuk ke `apps/worker/Dockerfile`, satu replika, health check `/health`.

```bash
railway init
railway up
```

Isi variabel di dashboard Railway. Tidak perlu domain publik.

### Fly.io

```bash
fly apps create intelligo-worker
fly secrets set DATABASE_URL=... ANTHROPIC_API_KEY=... N8N_WEBHOOK_SECRET=... ORG_ID=... \
  MODEL_WORK=claude-sonnet-5-5 MODEL_FAST=claude-haiku-4-5-20251001 N8N_BASE_URL=...
fly deploy . --config apps/worker/fly.toml --dockerfile apps/worker/Dockerfile
fly scale count 1
```

### Health check dan alert

- `GET /health` di port `HEALTH_PORT` (default 8787): `200 {"status":"ok"}` saat database menjawab, `status: "degraded"` bila ada antrean yang gagal lebih dari 3 kali berturut-turut, `503` bila database tidak bisa dihubungi.
- Log JSON (pino) ke stdout, dengan `service: "intelligo-worker"`. Nomor HP dan email di-mask.
- Job yang gagal lebih dari 3 kali berturut-turut menulis log `level: 50` dengan `alert: true` dan, jika `ALERT_WEBHOOK_URL` diisi, mengirim satu pesan (`text` untuk Slack, `content` untuk Discord). Pesan kedua dikirim saat antrean itu pulih.

Uji image secara lokal:

```bash
docker build -f apps/worker/Dockerfile -t intelligo-worker .
docker run --rm --env-file .env -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:54322/postgres -p 8787:8787 intelligo-worker
curl http://localhost:8787/health
```

## 3. Web (Vercel)

1. Import repo, Root Directory `apps/web`. Vercel memakai `apps/web/vercel.json`: install pnpm workspace, `pnpm build`, lalu `pnpm check:bundle` yang menggagalkan build bila bundle client memuat nama atau nilai secret server.
2. Environment variables (Production):

   | Variabel                        | Nilai                                                 |
   | ------------------------------- | ----------------------------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`      | Project URL                                           |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key                                              |
   | `SUPABASE_SERVICE_ROLE_KEY`     | service role key (server saja)                        |
   | `ORG_ID`                        | Sama dengan worker                                    |
   | `ANTHROPIC_API_KEY`             | Untuk chat agen (dipanggil dari route handler server) |
   | `MODEL_WORK` / `MODEL_FAST`     | Sama dengan worker                                    |
   | `USD_TO_IDR`, `EFFORT_CHAT`     | Opsional                                              |

   Hanya dua variabel `NEXT_PUBLIC_*` yang boleh terlihat di browser.

3. Domain: tambahkan `office.intelligo.id`, lalu buat CNAME `office` ke `cname.vercel-dns.com` di DNS intelligo.id.
4. Header keamanan (CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS) diatur di `next.config.ts`. CSP `connect-src` mengikuti `NEXT_PUBLIC_SUPABASE_URL`, jadi build ulang setelah mengganti project Supabase.

## 4. n8n

Impor workflow dari `n8n/` (lihat `n8n/README.md`). Setiap workflow memverifikasi header `X-Intelligo-Signature` (HMAC-SHA256 hex dari body dengan `N8N_WEBHOOK_SECRET`) sebelum melakukan apa pun. Isi kredensial WhatsApp, Gmail, Google Sheets, Google Docs, dan Meta di n8n, bukan di worker.

Sebelum mematikan dry-run, uji tiap workflow dengan satu aksi yang disetujui sementara `DRY_RUN=true` di Pengaturan, lalu periksa log worker (`dry-run: aksi tidak dikirim`).

## 5. Verifikasi produksi (AC Fase 8)

1. `curl https://<worker>/health` atau cek status health check di Railway/Fly: `status: ok`.
2. Buka `https://office.intelligo.id`, masuk dengan email Owner lewat magic link.
3. Kantor tampil dengan 12 agen dan indikator realtime `live`.
4. Kirim tugas Otomatis, mis. `Buat caption promo Bootcamp Batch 21`. Tugas diarahkan, dikerjakan, direview Manager, dan selesai. Biaya muncul di header dan di halaman detail tugas.
5. Kirim satu tugas balasan WhatsApp. Aksi muncul di Approval; setujui dan pastikan n8n menerima payload ber-signature.
6. Cek halaman Agen: pemakaian token dan biaya per agen bertambah.

## 6. Operasional

- Budget: tiap agen punya budget token input per bulan (WIB). Saat habis, tugas gagal dengan pesan `Budget token bulanan <nama> habis` dan Owner bisa menaikkannya di halaman Agen.
- Migrasi baru: `supabase db push`, lalu deploy ulang worker dan web.
- Restart worker aman: job yang terputus ditandai gagal dan tugasnya diantrekan ulang saat start.
- Rotasi secret: ganti di Vercel/Railway/Fly dan n8n bersamaan untuk `N8N_WEBHOOK_SECRET`.
