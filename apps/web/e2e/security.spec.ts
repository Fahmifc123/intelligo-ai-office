import { expect, test } from '@playwright/test';
import { loginAs, waitForOffice } from './helpers/auth';
import { closeDb, resetOffice } from './helpers/db';

test.afterAll(async () => {
  await closeDb();
});

test('Header keamanan HTTP terpasang', async ({ request }) => {
  const response = await request.get('/login');
  expect(response.ok()).toBe(true);
  const headers = response.headers();
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['permissions-policy']).toContain('camera=()');
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['x-powered-by']).toBeUndefined();
});

test('Kantor berjalan tanpa pelanggaran CSP', async ({ page }) => {
  await resetOffice();
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(
        `Content Security Policy violation: ${event.violatedDirective} ${event.blockedURI}`,
      );
    });
  });
  await loginAs(page, 'owner@intelligo.test');
  await waitForOffice(page);
  expect(violations).toEqual([]);
});

test('API chat menolak permintaan tanpa sesi', async ({ request }) => {
  const response = await request.post('/api/chat', {
    data: { agentId: 'cs', message: 'Halo' },
  });
  expect(response.status()).toBe(401);
});
