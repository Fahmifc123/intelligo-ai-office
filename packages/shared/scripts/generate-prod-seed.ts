import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { z } from 'zod';
import { MemberRole } from '../src/schemas';
import { generateSeedSql, type SeedMember } from '../src/seed';

// Production bootstrap seed: real member emails instead of the *.intelligo.test accounts, and
// the sample (CONTOH) knowledge docs only on request. Run once against a fresh Supabase project;
// re-running resets agent tools edited in /agents.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const envFile = resolve(repoRoot, '.env.production');
const fromFile = existsSync(envFile)
  ? (parseEnv(readFileSync(envFile, 'utf8')) as Record<string, string>)
  : {};

const emailList = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
  .pipe(z.array(z.email()));

const ProdSeedEnv = z.object({
  ORG_ID: z.guid(),
  MODEL_WORK: z.string().min(1),
  OWNER_EMAILS: emailList.refine((list) => list.length > 0, 'minimal satu email Owner'),
  STAFF_EMAILS: emailList,
  VIEWER_EMAILS: emailList,
  SEED_SAMPLE_KNOWLEDGE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  MONTHLY_TOKEN_BUDGET: z.coerce.number().int().positive().default(2_000_000),
});

const parsed = ProdSeedEnv.safeParse({ ...fromFile, ...process.env });
if (!parsed.success) {
  console.error('Env untuk seed produksi tidak valid:', z.prettifyError(parsed.error));
  process.exit(1);
}
const env = parsed.data;

const members: SeedMember[] = [
  ...env.OWNER_EMAILS.map((email) => ({ email, role: MemberRole.enum.owner })),
  ...env.STAFF_EMAILS.map((email) => ({ email, role: MemberRole.enum.staff })),
  ...env.VIEWER_EMAILS.map((email) => ({ email, role: MemberRole.enum.viewer })),
];

const outPath = resolve(repoRoot, 'supabase/seed.production.sql');
writeFileSync(
  outPath,
  generateSeedSql({
    orgId: env.ORG_ID,
    modelWork: env.MODEL_WORK,
    monthlyTokenBudget: env.MONTHLY_TOKEN_BUDGET,
    members,
    ...(env.SEED_SAMPLE_KNOWLEDGE ? {} : { knowledge: [] }),
  }),
);
console.log(`Seed produksi ditulis ke ${outPath} (${members.length} anggota).`);
