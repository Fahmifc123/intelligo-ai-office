import type { Page } from '@playwright/test';
import { E2eEnv } from './env';

/** Signs in through the real magic link flow (token_hash from the admin API, as in the email). */
export async function loginAs(page: Page, email: string): Promise<void> {
  const response = await fetch(`${E2eEnv.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: E2eEnv.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${E2eEnv.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  if (!response.ok)
    throw new Error(`generate_link gagal: ${response.status} ${await response.text()}`);
  const body = (await response.json()) as {
    hashed_token?: string;
    properties?: { hashed_token?: string };
  };
  const token = body.hashed_token ?? body.properties?.hashed_token;
  if (!token) throw new Error('hashed_token tidak ada di respons generate_link');
  await page.goto(`/auth/confirm?token_hash=${token}&type=magiclink`);
  await page.waitForURL((url) => url.pathname === '/');
}

/** Waits until the Pixi scene is mounted and realtime is connected. */
export async function waitForOffice(page: Page): Promise<void> {
  await page.locator('[data-testid="office-canvas"][data-ready="true"]').waitFor();
  await page.locator('[data-testid="realtime-status"][data-status="live"]').waitFor();
}
