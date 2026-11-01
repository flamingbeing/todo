// The 1.0 engine features the starter shows: sign-out keeps this device's data, forget wipes it, refused saves wait
// in a list, the task sheet follows its task live (watchDoc), the list marks what changed, and "Check for updates".
import { test, expect, clickOpens, signIn, signInAgain, add, synced, serverHas, uniq, db, itemIdOf, today, APP, openSettings, openToday } from './fixtures.mjs';

const kept = page => page.evaluate(async () => {
  let n = 0;
  for (const { name } of await indexedDB.databases()) {
    if (!/todo/.test(name || '')) continue;
    n += await new Promise(res => {
      const r = indexedDB.open(name);
      r.onsuccess = async () => {
        const d = r.result; let c = 0;
        for (const s of d.objectStoreNames) c += await new Promise(ok => { const q = d.transaction(s).objectStore(s).count(); q.onsuccess = () => ok(q.result); q.onerror = () => ok(0); });
        d.close(); res(c);
      };
      r.onerror = () => res(0);
    });
  }
  return n;
});

// Browse (the way to Settings) is a module loaded the first time it is needed or in an idle moment after the start; a
// phone keeps it offline through its service worker, which these pages have none of (emulator mode). So Settings is
// opened once while online, before a test that goes there offline.
const loadSettings = async page => { await openSettings(page); await openToday(page); };

test('sign-out keeps the phone’s data and unsent saves; the same account carries on', async ({ phone }) => {
  const page = await phone();
  const { email } = await signIn(page, 'member');
  await synced(page);
  await loadSettings(page);
  const t = uniq('kept');
  await page.context().setOffline(true);
  await add(page, t);
  await openSettings(page);
  await page.click('#sign-out');
  await openToday(page);
  await expect(page.locator('#signed-out')).toBeVisible();
  await expect(page.locator('#sign-out-msg')).toContainText('kept on this device');
  expect(await kept(page)).toBeGreaterThan(0);
  await page.context().setOffline(false);
  await page.evaluate(e => window.starter.signInAs(e), email);
  await expect(page.locator('#list-view')).toBeVisible();
  await expect(page.locator('#today')).toContainText(t);
  await serverHas(t);
});

test('forget this device: refused while unsent, then wipes the phone', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  await loadSettings(page);
  await page.context().setOffline(true);
  await add(page, uniq('unsent'));
  await openSettings(page);
  await page.click('#sign-out');
  await openToday(page);
  await page.click('#forget');
  await expect(page.locator('#forget-msg')).toContainText('not sent yet');
  await expect(page.locator('#forget-force')).toBeVisible();
  await page.click('#forget-force');
  await expect(page.locator('#forget-msg')).toContainText('Forgotten');
  expect(await kept(page)).toBe(0);
});

test('a save the server refuses waits in a list until retried or discarded', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  // a task the rules no longer accept as it is (written elsewhere with no priority): completing it here is refused, the
  // page goes on, and the copy waits in the refused list
  const t = uniq('refused');
  await db.put(`spaces/_/tasks/${t}`, { title: t, projectId: 'inbox', order: Date.now(), done: false, createdAt: Date.now(), updatedAt: Date.now(), due: { date: today() } });
  await page.getByRole('checkbox', { name: `Complete: ${t}` }).click();
  await expect(page.locator('#refused li')).toHaveCount(1, { timeout: 15_000 });
  await page.click('#refused li button.discard');
  await expect(page.locator('#refused li')).toHaveCount(0);
  await synced(page);
});

test('the task sheet follows its task: a change elsewhere shows, a delete elsewhere closes it', async ({ phone }) => {
  const a = await phone(), b = await phone();
  const { email } = await signIn(a, 'member');
  await signInAgain(b, email);
  const t = uniq('live');
  // the watch says what changed: note every item marked so (other tests share the list, and their saves move the mark)
  await b.evaluate(() => {
    const seen = window.changedSeen = /** @type {string[]} */ ([]);
    new MutationObserver(() => document.querySelectorAll('#today li.changed').forEach(li => seen.push(li.textContent || '')))
      .observe(document.getElementById('today'), { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  });
  await add(a, t);
  await expect(b.locator('#today')).toContainText(t);
  await expect.poll(() => b.evaluate(t => window.changedSeen.some(x => x.includes(t)), t)).toBe(true);
  await clickOpens(b.locator('#today .td-row-main').filter({ hasText: t }), b.locator('#task-sheet'));
  const itemId = await itemIdOf(t);
  const doc = await db.get(`spaces/_/tasks/${itemId}`);
  const noNulls = JSON.parse(JSON.stringify(doc, (k, v) => v === null ? undefined : v));   // (the admin helper can't write null)
  await db.put(`spaces/_/tasks/${itemId}`, { ...noNulls, title: t + '-2', updatedAt: Date.now() });
  await expect(b.locator('#task-sheet .td-task-title')).toHaveValue(t + '-2');
  await db.del(`spaces/_/tasks/${itemId}`);
  await expect(b.locator('#task-sheet')).not.toBeVisible();
  await expect(b.locator('.toast').last()).toContainText('deleted on another device');
});

test('check for updates: a new version takes over at once', async ({ phone }) => {
  const page = await phone();
  await page.goto(APP + '&sw', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);
  await page.evaluate(() => { window.__same = true; });
  await page.request.get('/__test/bump');
  await openSettings(page, 'About');   // the About rows are in Settings
  await page.locator('.ui-check-update').click();
  await expect.poll(() => page.evaluate(() => window.__same).catch(() => undefined), { timeout: 30_000 }).toBeUndefined();
});
