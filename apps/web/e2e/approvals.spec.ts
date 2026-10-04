import { expect, test, type Page } from '@playwright/test';
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

const latestTask = async (title: string) =>
  (
    await db().query(
      `select id::text, status, assignee_id from public.tasks where title = $1 order by created_at desc limit 1`,
      [title],
    )
  ).rows[0] as { id: string; status: string; assignee_id: string } | undefined;

async function sendTask(page: Page, text: string): Promise<void> {
  await page.getByLabel('Isi tugas').fill(text);
  await page.getByRole('button', { name: 'Kirim', exact: true }).click();
}

test('Fase 5: balasan WA masuk /approvals, tanpa approval tidak terkirim, setelah disetujui n8n menerima payload ber-signature valid', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const title = 'Balas calon peserta 081234567890 yang tanya jadwal Batch 21';
  const owner = await browser.newPage();
  await loginAs(owner, 'owner@intelligo.test');
  await waitForOffice(owner);
  await sendTask(owner, title);

  await expect
    .poll(async () => (await latestTask(title))?.status, { timeout: 60_000 })
    .toBe('awaiting_approval');
  expect((await latestTask(title))?.assignee_id).toBe('cs');
  await expect(owner.getByTestId('approval-badge')).toHaveText('1');
  // Nothing leaves without approval.
  expect(await n8nCalls()).toEqual([]);

  // Staff sees the queue but cannot decide.
  const staff = await browser.newPage();
  await loginAs(staff, 'staff@intelligo.test');
  await staff.goto('/approvals');
  const staffCard = staff.getByTestId('approval-card').first();
  await expect(staffCard).toContainText('Hanya Owner yang bisa menyetujui');
  await expect(staffCard.getByRole('button', { name: 'Setujui', exact: true })).toHaveCount(0);

  await db().query(`update public.settings set dry_run = false`);
  await owner.goto('/approvals');
  const card = owner.getByTestId('approval-card').first();
  await expect(card).toContainText('Balasan WhatsApp');
  await expect(card).toContainText('081234567890');
  await expect(card).toContainText('Batch 21 mulai 3 November 2026');
  await card.getByRole('button', { name: 'Setujui', exact: true }).click();

  await expect.poll(async () => (await n8nCalls()).length, { timeout: 30_000 }).toBe(1);
  const [call] = await n8nCalls();
  expect(call?.workflow).toBe('wa-send');
  expect(call?.signatureValid).toBe(true);
  expect(call?.body).toMatchObject({ kind: 'send_whatsapp', payload: { to: '6281234567890' } });

  await expect(
    owner
      .locator('[data-testid="approval-card"]', { hasText: 'Balasan WhatsApp' })
      .getByTestId('approval-status'),
  ).toHaveText('Terkirim');
  await expect.poll(async () => (await latestTask(title))?.status).toBe('done');
});

test('Edit lalu setujui mengirim pesan yang diedit dan mencatat diff; Tolak tidak mengirim apa pun', async ({
  page,
}) => {
  await db().query(`update public.settings set dry_run = false`);
  await loginAs(page, 'owner@intelligo.test');
  await waitForOffice(page);
  await sendTask(page, 'Balas calon peserta 081298765432 yang tanya jadwal kelas');
  await sendTask(page, 'Balas calon peserta 085711112222 yang tanya jadwal Batch 21 juga');
  await expect
    .poll(
      async () =>
        (
          await db().query(
            `select count(*)::int as n from public.actions where status = 'proposed'`,
          )
        ).rows[0].n,
      { timeout: 90_000 },
    )
    .toBe(2);

  await page.goto('/approvals');
  const editCard = page.locator('[data-testid="approval-card"]', { hasText: '081298765432' });
  await editCard.getByRole('button', { name: 'Edit lalu setujui' }).click();
  await editCard.getByLabel('Pesan').fill('Halo Kak, jadwal terbaru kami kirim besok pagi ya.');
  await editCard.getByRole('button', { name: 'Simpan dan setujui' }).click();

  const rejectCard = page.locator('[data-testid="approval-card"]', { hasText: '085711112222' });
  await rejectCard.getByRole('button', { name: 'Tolak' }).click();
  await expect(rejectCard.getByTestId('approval-status')).toHaveText('Ditolak');

  await expect.poll(async () => (await n8nCalls()).length, { timeout: 30_000 }).toBe(1);
  const [call] = await n8nCalls();
  expect(call?.body).toMatchObject({
    payload: { to: '6281298765432', message: 'Halo Kak, jadwal terbaru kami kirim besok pagi ya.' },
  });
  await expect
    .poll(
      async () =>
        (
          await db().query(
            `select payload from public.task_events where type = 'approval' and payload ->> 'decision' = 'edited'`,
          )
        ).rows[0]?.payload,
    )
    .toMatchObject({
      diff: { message: { after: 'Halo Kak, jadwal terbaru kami kirim besok pagi ya.' } },
    });
});
