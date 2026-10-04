import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { z } from 'zod';
import { generateSeedSql } from '../src/seed';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function readEnvFile(name: string): Record<string, string> {
  const path = resolve(repoRoot, name);
  return existsSync(path) ? (parseEnv(readFileSync(path, 'utf8')) as Record<string, string>) : {};
}

const SeedEnv = z.object({
  ORG_ID: z.guid(),
  MODEL_WORK: z.string().min(1),
});

// Precedence: process env > .env > .env.example
const merged = { ...readEnvFile('.env.example'), ...readEnvFile('.env'), ...process.env };
const parsed = SeedEnv.safeParse(merged);
if (!parsed.success) {
  console.error('Env untuk seed tidak valid:', z.prettifyError(parsed.error));
  process.exit(1);
}

const outPath = resolve(repoRoot, 'supabase/seed.sql');
writeFileSync(
  outPath,
  generateSeedSql({ orgId: parsed.data.ORG_ID, modelWork: parsed.data.MODEL_WORK }),
);
console.log(`Seed ditulis ke ${outPath}`);
