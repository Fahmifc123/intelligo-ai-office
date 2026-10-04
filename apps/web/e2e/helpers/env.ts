import { z } from 'zod';

export const E2eEnv = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    ORG_ID: z.guid(),
  })
  .parse(process.env);
