import { expect, test } from '@playwright/test';
import { loginAs, waitForOffice } from './helpers/auth';
import { closeDb, db, resetOffice } from './helpers/db';

test.beforeEach(async () => {
  await resetOffice();
});

test.afterAll(async () => {
  await closeDb();
});

test('Fase 4: chat dengan Sinta menjawab harga dari knowledge base dan riwayat tersimpan', async ({
  page,
}) => {
  await loginAs(page, 'owner@intelligo.test');
  await waitForOffice(page);
  await page.getByTestId('team-cs').click();
  const panel = page.getByTestId('chat-panel');
  await expect(panel).toContainText('Sinta');
  await expect(panel).toContainText('Belum ada chat');

  await page.getByLabel('Pesan chat').fill('Berapa harga Bootcamp Data Science Batch 21?');
  await page.getByLabel('Pesan chat').press('Enter');
  await expect(panel.getByTestId('chat-user')).toHaveText(
    'Berapa harga Bootcamp Data Science Batch 21?',
  );
  await expect(panel.getByTestId('chat-assistant')).toContainText('Rp 7.500.000', {
    timeout: 20_000,
  });

  const usage = await db().query(
    `select count(*)::int as n from public.llm_usage where purpose = 'chat' and agent_id = 'cs'`,
  );
  expect(usage.rows[0].n).toBeGreaterThanOrEqual(1);

  await page.reload();
  await waitForOffice(page);
  await page.getByTestId('team-cs').click();
  await expect(panel.getByTestId('chat-user')).toHaveText(
    'Berapa harga Bootcamp Data Science Batch 21?',
  );
  await expect(panel.getByTestId('chat-assistant')).toContainText('Rp 7.500.000');
});

test('chat bersifat pribadi per pengguna dan Viewer tidak bisa chat', async ({ browser }) => {
  const owner = await browser.newPage();
  await loginAs(owner, 'owner@intelligo.test');
  await waitForOffice(owner);
  await owner.getByTestId('team-cs').click();
  await owner.getByLabel('Pesan chat').fill('Halo Sinta');
  await owner.getByLabel('Pesan chat').press('Enter');
  await expect(owner.getByTestId('chat-assistant')).not.toHaveText('', { timeout: 20_000 });

  const staff = await browser.newPage();
  await loginAs(staff, 'staff@intelligo.test');
  await waitForOffice(staff);
  await staff.getByTestId('team-cs').click();
  await expect(staff.getByTestId('chat-panel')).toContainText('Belum ada chat');

  const viewer = await browser.newPage();
  await loginAs(viewer, 'viewer@intelligo.test');
  await waitForOffice(viewer);
  await viewer.getByTestId('team-cs').click();
  await expect(viewer.getByLabel('Pesan chat')).toBeDisabled();
  const response = await viewer.request.post('/api/chat', {
    data: { agentId: 'cs', message: 'tes' },
  });
  expect(response.status()).toBe(403);
});
