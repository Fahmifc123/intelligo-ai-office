import { expect, test } from '@playwright/test';
import { loginAs, waitForOffice } from './helpers/auth';
import { closeDb, db, resetOffice } from './helpers/db';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const DOC_TITLE = 'E2E: Jadwal kelas malam';

test.beforeEach(async () => {
  await resetOffice();
  await db().query('delete from public.knowledge_docs where title = $1', [DOC_TITLE]);
});

test.afterAll(async () => {
  await db().query('delete from public.knowledge_docs where title = $1', [DOC_TITLE]);
  await closeDb();
});

test('Budget habis: tugas gagal dengan pesan jelas dan tidak memanggil LLM', async ({ page }) => {
  const title = 'Buat caption promo kelas malam Batch 21';
  await db().query(`update public.agents set monthly_token_budget = 1000 where id = 'writer'`);
  await db().query(
    `insert into public.llm_usage (org_id, agent_id, purpose, model, input_tokens, output_tokens, cost_usd)
     values ($1, 'writer', 'run', 'test-model', 5000, 100, 0.011)`,
    [ORG_ID],
  );

  await loginAs(page, 'owner@intelligo.test');
  await waitForOffice(page);
  await page.getByLabel('Isi tugas').fill(title);
  await page.getByRole('button', { name: 'Kirim', exact: true }).click();

  const card = page.locator('[data-testid="task-card"]', { hasText: title });
  await expect(card).toContainText('Budget token bulanan Dimas habis', { timeout: 30_000 });
  const row = (
    await db().query<{ status: string; calls: number }>(
      `select t.status, (select count(*)::int from public.llm_usage u where u.task_id = t.id and u.purpose = 'run') as calls
         from public.tasks t where t.title = $1`,
      [title],
    )
  ).rows[0];
  expect(row).toEqual({ status: 'failed', calls: 0 });

  // The Agents page shows the budget as exhausted.
  await page.goto('/agents');
  await expect(page.getByTestId('agent-writer')).toContainText(
    '5.000 / 1.000 token input bulan ini',
  );
  await expect(page.getByTestId('agent-writer').getByLabel('100% budget terpakai')).toBeVisible();
});

test('Owner mengubah budget agen dan menambah dokumen knowledge; Staff hanya bisa melihat', async ({
  browser,
}) => {
  const owner = await browser.newPage();
  await loginAs(owner, 'owner@intelligo.test');
  await owner.goto('/agents');
  const writer = owner.getByTestId('agent-writer');
  await writer.getByRole('button', { name: 'Ubah agen' }).click();
  await writer.getByLabel('Budget token bulanan').fill('750000');
  await writer.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(writer.getByRole('status')).toHaveText('Tersimpan.');
  const budget = await db().query<{ monthly_token_budget: number }>(
    `select monthly_token_budget from public.agents where id = 'writer'`,
  );
  expect(budget.rows[0]?.monthly_token_budget).toBe(750000);

  await owner.goto('/settings');
  await owner.getByRole('button', { name: 'Tambah dokumen' }).click();
  await owner.getByLabel('Judul').fill(DOC_TITLE);
  await owner.getByLabel(/^Tag/).fill('jadwal, program');
  await owner
    .getByLabel('Isi (markdown)')
    .fill('Kelas malam Batch 21 berlangsung Senin dan Kamis pukul 19.00 sampai 21.00 WIB.');
  await owner.getByRole('button', { name: 'Simpan dokumen' }).click();
  await expect(owner.getByTestId('knowledge-doc').filter({ hasText: DOC_TITLE })).toBeVisible();
  const doc = await db().query<{ tags: string[] }>(
    'select tags from public.knowledge_docs where title = $1',
    [DOC_TITLE],
  );
  expect(doc.rows[0]?.tags).toEqual(['jadwal', 'program']);

  const staff = await browser.newPage();
  await loginAs(staff, 'staff@intelligo.test');
  await staff.goto('/agents');
  const staffWriter = staff.getByTestId('agent-writer');
  await staffWriter.getByRole('button', { name: 'Lihat detail' }).click();
  await expect(staffWriter).toContainText('Hanya Owner yang bisa mengubah agen.');
  await expect(staffWriter.getByLabel('Budget token bulanan')).toBeDisabled();
  await staff.goto('/settings');
  await expect(staff.getByText('Hanya Owner yang bisa mengubah pengaturan.')).toBeVisible();
  await expect(staff.getByRole('button', { name: 'Tambah dokumen' })).toHaveCount(0);
});

test('Detail tugas menampilkan hasil, biaya, dan timeline', async ({ page }) => {
  test.setTimeout(120_000);
  const title = 'Buat caption promo Bootcamp Batch 21';
  await loginAs(page, 'owner@intelligo.test');
  await waitForOffice(page);
  await page.getByLabel('Isi tugas').fill(title);
  await page.getByRole('button', { name: 'Kirim', exact: true }).click();

  await expect
    .poll(
      async () =>
        (
          await db().query<{ status: string }>('select status from public.tasks where title = $1', [
            title,
          ])
        ).rows[0]?.status,
      { timeout: 60_000 },
    )
    .toBe('done');

  const card = page.locator('[data-testid="task-card"]', { hasText: title });
  await card.getByRole('link', { name: 'Detail' }).click();
  await page.waitForURL(/\/tasks\//, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByTestId('task-final-result')).not.toBeEmpty();
  await expect(page.getByTestId('task-cost')).toContainText('$');
  const types = await page
    .getByTestId('timeline-item')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-type')));
  expect(types).toEqual(expect.arrayContaining(['routed', 'started', 'tool_call', 'review']));
});
