import { expect, test } from '@playwright/test';
import { loginAs, waitForOffice } from './helpers/auth';
import { closeDb, db, resetOffice } from './helpers/db';
import { clearN8nCalls, n8nCalls } from './helpers/n8n';

test.beforeEach(async () => {
  await resetOffice();
  await clearN8nCalls();
});

test.afterAll(async () => {
  await closeDb();
});

test('Fase 9: carousel Laras > Dimas > Rani masuk review manusia dengan gambar, tidak diposting', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const title = 'Buat carousel Instagram promo Bootcamp Batch 21';
  await loginAs(page, 'owner@intelligo.test');
  await waitForOffice(page);
  await page.getByLabel('Isi tugas').fill(title);
  await page.getByRole('button', { name: 'Kirim', exact: true }).click();

  await expect(page.getByTestId('approval-badge')).toHaveText('1', { timeout: 150_000 });
  await page.goto('/approvals');
  const card = page.getByTestId('approval-card').filter({ hasText: 'Review desain carousel' });
  await expect(card).toBeVisible();
  const preview = card.getByTestId('carousel-preview');
  await expect(preview.getByRole('img')).toHaveCount(3);
  // The slides are real files in Supabase Storage (bucket posters) and load in the browser.
  await expect
    .poll(() =>
      preview
        .getByRole('img')
        .evaluateAll((imgs) => imgs.every((img) => (img as HTMLImageElement).naturalWidth > 0)),
    )
    .toBe(true);
  await expect(card).toContainText('Rp 7.500.000');

  await card.getByRole('button', { name: 'Setujui', exact: true }).click();
  await expect(card.getByTestId('approval-status')).toHaveText('Disetujui', { timeout: 30_000 });
  await expect
    .poll(
      async () =>
        (
          await db().query<{ status: string }>(
            'select status from public.tasks where title = $1 and parent_task_id is null',
            [title],
          )
        ).rows[0]?.status,
      { timeout: 60_000 },
    )
    .toBe('done');
  expect(await n8nCalls()).toEqual([]);
});
