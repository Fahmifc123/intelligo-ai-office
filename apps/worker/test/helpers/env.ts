import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const rootEnv = resolve(import.meta.dirname, '../../../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

/** Admin connection used to create throwaway databases for integration tests. */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const hasTestDatabase = Boolean(TEST_DATABASE_URL);
