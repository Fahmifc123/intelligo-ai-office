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

test('Fase 6: Manager mendelegasikan ke Bima lalu Nadia, hasil akhir berisi link Google Doc', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const title = 'Siapkan penawaran untuk lead panas minggu ini';
  await loginAs(page, 'owner@intelligo.test');
  await waitForOffice(page);
  await page.getByLabel('Isi tugas').fill(title);
  await page.getByLabel('Penerima').selectOption('manager');
  await page.getByRole('button', { name: 'Kirim', exact: true }).click();

  const card = page.locator('[data-testid="task-card"]', { hasText: title });
  await expect(card.getByRole('list', { name: 'Subtugas' })).toContainText('Bima', {
    timeout: 60_000,
  });
  await expect(card.getByRole('list', { name: 'Subtugas' })).toContainText('Nadia', {
    timeout: 90_000,
  });
  await expect(card).toHaveAttribute('data-status', 'done', { timeout: 90_000 });
  await expect(card.getByTestId('task-result')).toContainText(
    'https://docs.google.com/document/d/mock-',
  );

  const subtasks = await db().query(
    `select a.name, t.status from public.tasks t join public.agents a on a.id = t.assignee_id
      where t.parent_task_id = (select id from public.tasks where title = $1) order by t.created_at`,
    [title],
  );
  expect(subtasks.rows).toEqual([
    { name: 'Bima', status: 'done' },
    { name: 'Nadia', status: 'done' },
  ]);
  const workflows = (await n8nCalls()).map((c) => c.workflow);
  expect(workflows).toEqual(expect.arrayContaining(['sheet-read', 'doc-create']));
});
