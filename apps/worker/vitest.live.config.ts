import { defineConfig } from 'vitest/config';

// `pnpm test:live`: real Claude API calls, run on demand only (never in `pnpm test`).
export default defineConfig({
  test: {
    include: ['test/live/**/*.live.test.ts'],
    testTimeout: 320_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
