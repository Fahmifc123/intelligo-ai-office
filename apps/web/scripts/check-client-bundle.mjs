// Fails when the browser bundle (.next/static) contains a server secret: either the variable
// name or, when it is set in the environment, its value. Run after `next build`.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SECRETS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
  'N8N_WEBHOOK_SECRET',
  'DATABASE_URL',
];

const rootEnv = resolve(import.meta.dirname, '../../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const staticDir = resolve(import.meta.dirname, '../.next/static');
if (!existsSync(staticDir)) {
  console.error('Folder .next/static tidak ada. Jalankan `pnpm build` dulu.');
  process.exit(1);
}

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

const needles = SECRETS.flatMap((name) => {
  const value = process.env[name]?.trim();
  return [
    { label: `nama ${name}`, text: name },
    ...(value && value.length >= 8 ? [{ label: `nilai ${name}`, text: value }] : []),
  ];
});

const findings = [];
let scanned = 0;
for (const file of files(staticDir)) {
  scanned += 1;
  const content = readFileSync(file, 'utf8');
  for (const needle of needles) {
    if (content.includes(needle.text)) findings.push(`${needle.label} di ${file}`);
  }
}

if (findings.length > 0) {
  console.error(`Bundle client memuat secret:\n${findings.join('\n')}`);
  process.exit(1);
}
console.log(`Bundle client bersih: ${scanned} file diperiksa, ${needles.length} pola.`);
