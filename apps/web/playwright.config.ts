import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const rootEnv = resolve(import.meta.dirname, '../../.env');
try {
  process.loadEnvFile(rootEnv);
} catch {
  // .env is optional when the variables come from the environment (CI).
}

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const E2E_N8N_SECRET = 'e2e-n8n-secret';
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
      command: 'pnpm --filter @intelligo/worker mock:n8n',
      cwd: resolve(import.meta.dirname, '../..'),
      env: { N8N_WEBHOOK_SECRET: E2E_N8N_SECRET, MOCK_N8N_PORT: '5679' },
      url: 'http://127.0.0.1:5679/health',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'pnpm --filter @intelligo/worker start',
      cwd: resolve(import.meta.dirname, '../..'),
      env: {
        LLM_MODE: 'scripted',
        LOG_LEVEL: 'warn',
        HEALTH_PORT: '8788',
        IDLE_TICK_ENABLED: 'false',
        // Real execution path (signed webhooks to the mock); settings.dry_run still decides per test.
        DRY_RUN: 'false',
        N8N_BASE_URL: 'http://127.0.0.1:5679/webhook',
        N8N_WEBHOOK_SECRET: E2E_N8N_SECRET,
      },
      url: 'http://127.0.0.1:8788/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      // E2E_WEB_COMMAND='pnpm start' runs the suite against a production build (CSP, headers).
      command: process.env.E2E_WEB_COMMAND ?? 'pnpm dev',
      env: { LLM_MODE: 'scripted' },
      url: `${baseURL}/api/health`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
