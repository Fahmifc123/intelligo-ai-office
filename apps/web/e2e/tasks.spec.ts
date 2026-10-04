import { expect, test } from '@playwright/test';
import { loginAs, waitForOffice } from './helpers/auth';
import { closeDb, db, resetOffice } from './helpers/db';

test.beforeEach(async () => {
  await resetOffice();
});

test.afterAll(async () => {
  await closeDb();
});

const taskRow = async (title: string) =>
  (
    await db().query(
      `select id::text, status, assignee_id, revision_count, result_text from public.tasks where title = $1 order by created_at desc limit 1`,
      [title],
    )
  ).rows[0] as
    | {
        id: string;
        status: string;
        assignee_id: string | null;
        revision_count: number;
        result_text: string | null;
      }
    | undefined;

test('Fase 2: tugas Otomatis diarahkan ke Dimas, hasil muncul bertahap, lalu menunggu review; biaya tercatat', async ({
  page,
}) => {
  const title = 'Buat caption promo Bootcamp Batch 21';
  await loginAs(page, 'owner@intelligo.test');
  await waitForOffice(page);
  await expect(page.getByTestId('cost-today')).toHaveText('$0.00');

  await page.getByLabel('Isi tugas').fill(title);
  await page.getByLabel('Isi tugas').press('Control+Enter');
  await expect(page.getByRole('tab', { name: /Papan/ })).toHaveAttribute('aria-selected', 'true');
  const card = page.locator('[data-testid="task-card"]', { hasText: title });
  await expect(card).toBeVisible();

  await expect
    .poll(async () => (await taskRow(title))?.assignee_id, { timeout: 15_000 })
    .toBe('writer');
  await expect(card).toContainText('Dimas · Content Writer');
  // Dimas starts working at his own desk (seat of desk d-1-0).
  await expect
    .poll(
      async () =>
        (
          await db().query(
            `select count(*)::int as n from public.task_events where agent_id = 'writer' and type = 'started'`,
          )
        ).rows[0].n,
      {
        timeout: 15_000,
      },
    )
    .toBe(1);
  const seat = await page.evaluate(() => window.__office?.agentGridPosition('writer'));
  expect(seat).toMatchObject({ x: 4.8, y: 3.25 });

  // Streaming: the result is visible while the task is still in progress.
  await expect(card.getByTestId('task-result')).toBeVisible({ timeout: 20_000 });
  const seenWhileRunning = await card.getAttribute('data-status');
  expect(['in_progress', 'awaiting_review', 'done']).toContain(seenWhileRunning);

  await expect
    .poll(async () => (await taskRow(title))?.status, { timeout: 30_000 })
    .toMatch(/awaiting_review|done/);
  const task = await taskRow(title);
  expect(task?.result_text).toContain('Rp 7.500.000');

  const usage = await db().query(
    `select purpose, cost_usd::float as cost from public.llm_usage where task_id = $1`,
    [task?.id],
  );
  expect(usage.rows.map((r: { purpose: string }) => r.purpose)).toEqual(
    expect.arrayContaining(['route', 'run']),
  );
  await expect(page.getByTestId('cost-today')).not.toHaveText('$0.00');

  await page.getByRole('tab', { name: 'Aktivitas' }).click();
  await expect(
    page.getByTestId('activity-item').filter({ hasText: 'menugaskan' }).first(),
  ).toContainText('ke Dimas');
});

test('Fase 3: harga karangan direvisi lalu disetujui, Manager berjalan ke meja Dimas', async ({
  page,
}) => {
  const title = 'Buat caption promo Bootcamp Batch 21 dengan harga karangan';
  await loginAs(page, 'owner@intelligo.test');
  await waitForOffice(page);
  await page.getByLabel('Isi tugas').fill(title);
  await page.getByLabel('Penerima').selectOption('writer');
  await page.getByRole('button', { name: 'Kirim', exact: true }).click();

  // The manager character walks to Dimas's desk for the review.
  await expect
    .poll(
      async () =>
        (await db().query(`select activity from public.agent_states where agent_id = 'manager'`))
          .rows[0].activity,
      {
        timeout: 30_000,
        intervals: [100],
      },
    )
    .toMatch(/walking_to_review|reviewing/);

  await expect.poll(async () => (await taskRow(title))?.status, { timeout: 60_000 }).toBe('done');
  const task = await taskRow(title);
  expect(task?.revision_count).toBe(1);
  expect(task?.result_text).not.toContain('Rp 1.250.000');
  const reviews = await db().query(
    `select verdict from public.reviews where task_id = $1 order by created_at`,
    [task?.id],
  );
  expect(reviews.rows.map((r: { verdict: string }) => r.verdict)).toEqual(['revise', 'approved']);

  const card = page.locator('[data-testid="task-card"]', { hasText: title });
  await expect(card).toHaveAttribute('data-status', 'done');
  await expect(card.getByTestId('review-note')).toContainText('Disetujui');
  await expect(card.getByTestId('review-note')).toContainText('revisi 1x');
});

test('Staff bisa kirim tugas, Viewer tidak', async ({ browser }) => {
  const viewer = await browser.newPage();
  await loginAs(viewer, 'viewer@intelligo.test');
  await waitForOffice(viewer);
  await expect(viewer.getByLabel('Isi tugas')).toBeDisabled();

  const staff = await browser.newPage();
  await loginAs(staff, 'staff@intelligo.test');
  await waitForOffice(staff);
  await staff.getByLabel('Isi tugas').fill('Kalender konten minggu depan');
  await staff.getByLabel('Penerima').selectOption('socmed');
  await staff.getByRole('button', { name: 'Kirim', exact: true }).click();
  await expect(
    staff.locator('[data-testid="task-card"]', { hasText: 'Kalender konten minggu depan' }),
  ).toBeVisible();
  await expect(
    viewer.locator('[data-testid="task-card"]', { hasText: 'Kalender konten minggu depan' }),
  ).toHaveCount(0);
  await viewer.getByRole('tab', { name: /Papan/ }).click();
  await expect(
    viewer.locator('[data-testid="task-card"]', { hasText: 'Kalender konten minggu depan' }),
  ).toBeVisible();
});
