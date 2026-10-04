import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';

// Single .env at the monorepo root, shared with the worker. Next runs with cwd = apps/web.
// loadEnvFile never overrides variables that are already set (e.g. by Vercel).
const rootEnv = resolve(process.cwd(), '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@intelligo/shared'],
  // Linting runs from the monorepo root (`pnpm lint`) with the shared flat config.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
