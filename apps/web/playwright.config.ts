import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const rootEnv = resolve(import.meta.dirname, '../../.env');
try {
  process.loadEnvFile(rootEnv);
} catch {
  // .env is optional when the variables come from the environment (CI).
}

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

/**
 * End-to-end tests run against local Supabase (`pnpm db:start`), the worker in scripted LLM
 * mode, and the Next.js dev server. Both servers are started here unless already running.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: [
    {
      command: 'pnpm --filter @intelligo/worker start',
      cwd: resolve(import.meta.dirname, '../..'),
      env: {
        LLM_MODE: 'scripted',
        LOG_LEVEL: 'warn',
        HEALTH_PORT: '8788',
        IDLE_TICK_ENABLED: 'false',
      },
      url: 'http://127.0.0.1:8788/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm dev',
      env: { LLM_MODE: 'scripted' },
      url: `${baseURL}/api/health`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
