import { officeLayout } from '@intelligo/shared';
import { expect, test, type Page } from '@playwright/test';
import { loginAs, waitForOffice } from './helpers/auth';
import { closeDb, db, resetOffice } from './helpers/db';

interface Position {
  x: number;
  y: number;
  walking: boolean;
}

const position = (page: Page, agentId: string): Promise<Position | null> =>
  page.evaluate((id) => window.__office?.agentGridPosition(id) ?? null, agentId);

/** Desk footprints without clearance: a character must never stand inside one. */
const DESKS = officeLayout.desks.map((d) => ({
  x0: d.x - d.w / 2,
  y0: d.y,
  x1: d.x + d.w / 2,
  y1: d.y + d.d,
}));
const insideDesk = (p: Position): boolean =>
  DESKS.some((d) => p.x > d.x0 && p.x < d.x1 && p.y > d.y0 && p.y < d.y1);

test.beforeEach(async () => {
  await resetOffice();
});

test.afterAll(async () => {
  await closeDb();
});

test('mengubah activity di DB menggerakkan karakter di dua browser dalam < 1 detik', async ({
  browser,
}) => {
  const owner = await browser.newPage();
  const viewer = await browser.newPage();
  await loginAs(owner, 'owner@intelligo.test');
  await loginAs(viewer, 'viewer@intelligo.test');
  await Promise.all([waitForOffice(owner), waitForOffice(viewer)]);

  const before = await position(owner, 'cs');
  expect(before).not.toBeNull();

  const changedAt = Date.now();
  await db().query(
    `update public.agent_states set activity = 'break', status_text = 'Ngopi dulu', target_spot = 'pantry' where agent_id = 'cs'`,
  );

  const startedWalking = async (page: Page): Promise<number> => {
    await expect
      .poll(async () => (await position(page, 'cs'))?.walking ?? false, {
        timeout: 5_000,
        intervals: [25],
      })
      .toBe(true);
    return Date.now() - changedAt;
  };
  const [ownerDelay, viewerDelay] = await Promise.all([
    startedWalking(owner),
    startedWalking(viewer),
  ]);
  test.info().annotations.push({
    type: 'latency',
    description: `owner ${ownerDelay} ms, viewer ${viewerDelay} ms`,
  });
  expect(ownerDelay).toBeLessThan(1_000);
  expect(viewerDelay).toBeLessThan(1_000);

  // Rendering pauses in background tabs (SPEC 12.2), so watch the walk in the front tab.
  await owner.bringToFront();
  // Walk the whole way while sampling positions: never inside a desk.
  const samples: Position[] = [];
  await expect
    .poll(
      async () => {
        const p = await position(owner, 'cs');
        if (p) samples.push(p);
        return p?.walking ?? true;
      },
      { timeout: 20_000, intervals: [50] },
    )
    .toBe(false);
  expect(samples.length).toBeGreaterThan(5);
  expect(samples.filter(insideDesk)).toEqual([]);

  const end = await position(owner, 'cs');
  const pantry = officeLayout.spots.pantry.some(
    ([x, y]) => end && Math.hypot(end.x - x, end.y - y) < 0.05,
  );
  expect(pantry).toBe(true);
  await expect(owner.getByTestId('status-cs')).toHaveText('Ngopi dulu');
  await expect(viewer.getByTestId('status-cs')).toHaveText('Ngopi dulu');

  const fps = await owner.evaluate(() => window.__office?.fps ?? 0);
  test.info().annotations.push({ type: 'fps', description: fps.toFixed(1) });
  // Headless Chromium renders WebGL on the CPU (SwiftShader); a GPU laptop runs far faster.
  expect(fps).toBeGreaterThan(12);
});

test('Rapat tim memindahkan agen bebas ke ruang rapat lalu kembali setelah 25 detik', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await loginAs(page, 'owner@intelligo.test');
  await waitForOffice(page);
  await page.getByRole('button', { name: 'Rapat tim' }).click();
  await expect(page.getByRole('button', { name: 'Rapat tim' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('status-writer')).toHaveText('Rapat mingguan');
  await expect
    .poll(
      async () =>
        (
          await db().query(
            `select count(*)::int as n from public.agent_states where activity = 'meeting'`,
          )
        ).rows[0].n,
    )
    .toBe(12);
  await expect(page.getByTestId('status-writer')).not.toHaveText('Rapat mingguan', {
    timeout: 40_000,
  });
  const { rows } = await db().query(
    `select count(*)::int as n from public.agent_states where activity = 'meeting'`,
  );
  expect(rows[0].n).toBe(0);
});

test('Jam istirahat bisa dinyalakan dan dimatikan, Viewer tidak bisa menekannya', async ({
  browser,
}) => {
  const owner = await browser.newPage();
  const viewer = await browser.newPage();
  await loginAs(owner, 'owner@intelligo.test');
  await loginAs(viewer, 'viewer@intelligo.test');
  await Promise.all([waitForOffice(owner), waitForOffice(viewer)]);

  await expect(viewer.getByRole('button', { name: 'Jam istirahat' })).toBeDisabled();
  await owner.getByRole('button', { name: 'Jam istirahat' }).click();
  await expect(viewer.getByRole('button', { name: 'Jam istirahat' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect
    .poll(
      async () =>
        (
          await db().query(
            `select count(*)::int as n from public.agent_states where activity = 'break'`,
          )
        ).rows[0].n,
    )
    .toBe(12);
  await owner.getByRole('button', { name: 'Jam istirahat' }).click();
  await expect
    .poll(
      async () =>
        (
          await db().query(
            `select count(*)::int as n from public.agent_states where activity = 'break'`,
          )
        ).rows[0].n,
    )
    .toBe(0);
});
