# Intelligo AI Office

Kantor virtual isometrik berisi 12 karyawan AI untuk operasional Intelligo ID. Spesifikasi lengkap ada di `SPEC.md`, aturan kerja ada di `CLAUDE.md`.

## Struktur

- `apps/web`: Next.js 15 (App Router), Tailwind v4, Supabase client
- `apps/worker`: Node worker, pg-boss, agent runner
- `packages/shared`: Zod schema, tipe, konfigurasi 12 agen, generator seed
- `config/office.layout.json`: grid, meja, zona, spot kantor
- `supabase/`: migrasi, seed, test pgTAP

## Menjalankan lokal

Prasyarat: Node 22.12+, pnpm 10, Docker (untuk Supabase lokal).

```bash
pnpm install
cp .env.example .env
pnpm db:start        # supabase start; salin anon key dan service role key ke .env
pnpm db:reset        # migrasi + seed 12 agen
pnpm db:test         # cek tabel, seed, RLS, realtime (pgTAP)
pnpm dev             # web di http://localhost:3000 + worker
```

Setelah mengubah `packages/shared/src/agents.config.ts`, jalankan `pnpm db:seed:gen` untuk membuat ulang `supabase/seed.sql`.

## Cek kualitas

```bash
pnpm typecheck && pnpm lint && pnpm test
```
