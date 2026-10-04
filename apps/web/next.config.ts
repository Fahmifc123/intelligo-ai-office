import { resolve } from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// Single .env at the monorepo root, shared with the worker. Next runs with cwd = apps/web.
loadEnvConfig(resolve(process.cwd(), '../..'));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@intelligo/shared'],
  // Linting runs from the monorepo root (`pnpm lint`) with the shared flat config.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
