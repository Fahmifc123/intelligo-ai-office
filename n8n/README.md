# Workflow n8n untuk Intelligo AI Office

Worker memanggil n8n lewat webhook `POST {N8N_BASE_URL}/{path}` dengan body JSON dan header
`X-Intelligo-Signature` berisi HMAC-SHA256 (hex) dari body mentah memakai `N8N_WEBHOOK_SECRET`.
Setiap workflow wajib memverifikasi signature sebelum melakukan apa pun. Timeout 30 detik; balasan
non-2xx membuat aksi berstatus `failed`.

## Workflow

| Path             | Dipakai untuk                                    | File contoh                              |
| ---------------- | ------------------------------------------------ | ---------------------------------------- |
| `sheet-read`     | tool `read_sheet`, `run_analysis`, `score_leads` | `sheet-read.json`                        |
| `doc-create`     | tool `create_google_doc`                         | (buat sendiri, balas `{ "url": "..." }`) |
| `wa-send`        | aksi `send_whatsapp` dan `send_whatsapp_bulk`    | `wa-send.json` (dry-run)                 |
| `email-send`     | aksi `send_email`                                | (buat sendiri)                           |
| `invoice-create` | aksi `create_invoice` (tanpa PPN, non-PKP)       | (buat sendiri)                           |
| `post-schedule`  | aksi `schedule_post`                             | (buat sendiri)                           |

Body aksi berbentuk `{ action_id, task_id, kind, payload, sent_at }`. Pakai `action_id` sebagai
kunci idempotensi supaya aksi yang sama tidak terkirim dua kali.

`sheet-read` menerima `{ sheet, range? }` dan membalas `{ rows: [...] }`. ID spreadsheet diambil dari
env n8n `INTELLIGO_SPREADSHEET_ID`, jadi aplikasi tidak menyimpan ID sheet.

## Impor

1. Di n8n: Workflows, Import from file, pilih `sheet-read.json` atau `wa-send.json`.
2. Set env n8n:
   - `N8N_WEBHOOK_SECRET` sama dengan di worker
   - `NODE_FUNCTION_ALLOW_BUILTIN=crypto` (node Code memakai modul `crypto`)
   - `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` (node Code membaca `$env`)
   - `INTELLIGO_SPREADSHEET_ID` untuk `sheet-read`
3. Hubungkan kredensial Google Sheets di node "Google Sheets" (`REPLACE_ME`).
4. `wa-send.json` masih dry-run: ganti node "Dry-run WhatsApp" dengan provider WhatsApp yang dipakai
   (Fonnte, Wablas, atau WA Cloud API).

## Verifikasi signature (node Code)

```js
const crypto = require('crypto');
const item = $input.first();
const raw = Buffer.from(item.binary.data.data, 'base64').toString('utf8');
const signature = String(item.json.headers['x-intelligo-signature'] || '');
const expected = crypto
  .createHmac('sha256', $env.N8N_WEBHOOK_SECRET)
  .update(raw, 'utf8')
  .digest('hex');
const valid =
  signature.length === expected.length &&
  crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
if (!valid) throw new Error('Signature tidak valid');
return [{ json: JSON.parse(raw) }];
```

Webhook harus mengaktifkan opsi **Raw Body** agar signature dihitung dari byte yang sama.

## Mock lokal

`pnpm n8n:mock` menjalankan pengganti n8n di `http://127.0.0.1:5679/webhook` yang memverifikasi
signature, mencatat panggilan (`GET /__calls`), dan menyajikan sheet contoh dari
`sample-data/sheets.json`. Isi `N8N_BASE_URL=http://127.0.0.1:5679/webhook` di `.env` untuk demo.
