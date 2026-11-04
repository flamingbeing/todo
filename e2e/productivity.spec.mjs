// Productivity (Browse > Reporting > chart button): Daily and Weekly tabs; a ring with today's (or this week's) finished
// tasks against the goal set in Settings > Productivity (this device, off by default); the streak; the last 7 days (or
// 4 weeks) as vertical bars, oldest to newest, split by project colour. Counts only. The page passes axe, light and dark.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, db, openTab, openSettings, settingsBack, space } from './fixtures.mjs';

const now = () => ({ createdAt: Date.now(), updatedAt: Date.now() });
const put = (id, fields) => db.put(`${space()}/tasks/${id}`, { projectId: 'inbox', order: Date.now(), priority: 4, done: false, ...now(), ...fields });
const openProductivity = async page => {
  await openTab(page, 'browse');
  await page.locator('#browse').getByRole('button', { name: 'Reporting' }).click();
  await page.locator('#reporting-chart').click();
  await expect(page.locator('#productivity-page')).toBeVisible();
};

test('the tabs, the ring, the streak and stacked bars per project; a goal shows in the ring', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const pid = uniq('p'), a = uniq('done'), b = uniq('done');
  await db.put(`${space()}/projects/${pid}`, { name: uniq('Proj'), color: 'blue', parentId: null, view: 'list', order: Date.now(), ...now() });
  await put(a, { title: a, done: true, doneAt: Date.now() });
  await put(b, { title: b, projectId: pid, done: true, doneAt: Date.now() });
  await synced(page);
  await openProductivity(page);
  const host = page.locator('#productivity');

  const tabs = host.getByRole('tab');
  await expect(tabs).toHaveText(['Daily', 'Weekly']);
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await expect(host.locator('.td-ring-cap')).toHaveText('tasks');
  await expect.poll(async () => +(await host.locator('.td-ring-n').textContent())).toBeGreaterThanOrEqual(2);
  await expect(host.locator('.td-prod-line')).toContainText('Today:');
  await expect(host.locator('.td-streak-n')).toContainText('day');
  await expect(host.locator('.td-prod-h')).toHaveText('Completed in the last 7 days');
  await expect(host.locator('.td-bars-row')).toHaveCount(7);
  const todayBar = host.locator('.td-bars-row.is-today');
  await expect(todayBar).toHaveCount(1);
  await expect(todayBar.locator(`.td-bars-part[data-pid="${pid}"]`)).toHaveCount(1);
  await expect(todayBar.locator('.td-bars-part[data-pid="inbox"]')).toHaveCount(1);
  await expect(host.locator('.td-bars-goal')).toHaveCount(0);   // goals are off until set
  // vertical 24 px columns, oldest to newest: today's is the last, at the right, and every day has its track, done or not
  await expect(host.locator('.td-bars-row').last()).toHaveClass(/is-today/);
  const cols = await host.locator('.td-bars-track').evaluateAll(ts => ts.map(t => { const r = t.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(r.x)]; }));
  expect(cols.every(([w, h]) => w === 24 && h === 120)).toBe(true);
  expect(cols.every(([, , x], i) => i === 0 || x > cols[i - 1][2])).toBe(true);
  for (const colorScheme of /** @type {const} */ (['light', 'dark'])) {
    await page.emulateMedia({ colorScheme });
    expect(await AxeBuilder(page)).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: 'light' });

  await tabs.nth(1).click();
  await expect(host.getByRole('tab', { name: 'Weekly' })).toHaveAttribute('aria-selected', 'true');
  await expect(host.locator('.td-prod-h')).toHaveText('Completed in the last 4 weeks');
  await expect(host.locator('.td-bars-row')).toHaveCount(4);
  await expect(host.locator('.td-bars-row').last()).toHaveClass(/is-today/);   // this week at the right
  await host.getByRole('tab', { name: 'Daily' }).click();

  // a daily goal in Settings > Productivity: "n/3" in the ring and a dashed line on the bars
  await openSettings(page, 'Productivity');
  await page.getByRole('combobox', { name: /Daily goal/ }).selectOption({ label: '3 tasks' }).catch(async () => {
    await page.locator('#settings-host').getByText('Daily goal', { exact: true }).click();
    await page.getByRole('option', { name: '3 tasks', exact: true }).click();
  });
  await settingsBack(page);
  await openProductivity(page);
  await expect(host.locator('.td-ring-n')).toHaveText(/^\d+\/3$/);
  await expect(host.locator('.td-bars-goal')).toHaveCount(1);
  await expect(host.getByRole('button', { name: 'Edit goal' })).toBeVisible();
});
