// Sign-in, roles from the role doc, and the tasks: add, rename, delete to the bin. A "* " title is a note: no box, no
// swipe to complete.
import AxeBuilder from './axe.mjs';
import { test, expect, clickOpens, signIn, add, synced, serverHas, db, uniq, today, APP, finger, gesturesReady, steps, openTab, space } from './fixtures.mjs';

test('signed out: the sign-in screen, accessible', { tag: '@smoke' }, async ({ phone }) => {
  const page = await phone();
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#signed-out')).toBeVisible();
  expect(await AxeBuilder(page)).toEqual([]);
});

test('an account with no role sees no list until an admin adds it', async ({ phone }) => {
  const page = await phone();
  await signIn(page, null);
  await expect(page.locator('#list-view')).toBeHidden();
  await expect(page.locator('#uid')).not.toBeEmpty();
});

test('a member adds, edits and deletes; the delete lands in the bin', { tag: '@smoke' }, async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('item');
  await add(page, t);
  await synced(page);
  await serverHas(t);
  expect(await AxeBuilder(page)).toEqual([]);

  await clickOpens(page.locator('#today .td-row-main').filter({ hasText: t }), page.locator('#task-sheet'));
  await page.fill('#task-sheet .td-task-title', t + ' edited');
  await page.press('#task-sheet .td-task-title', 'Enter');
  await expect(page.locator('#today')).toContainText(t + ' edited');
  await serverHas(t + ' edited');

  await page.locator('#task-sheet [aria-label="More"]').click();
  await page.getByRole('menuitem', { name: 'Delete task' }).click();
  await expect(page.locator('#task-sheet')).toBeHidden();
  await expect(page.locator('#today')).not.toContainText(t);
  await expect.poll(async () => (await db.list(`${space()}/bin`)).some(b => b.data?.title === t + ' edited'), { timeout: 15_000 }).toBe(true);
  await expect.poll(async () => (await db.list(`${space()}/tasks`)).some(d => d.title === t + ' edited')).toBe(false);
});

test('each person has their own list: two members never see each other’s tasks', { tag: '@smoke' }, async ({ phone }) => {
  const a = await phone(), b = await phone();
  await signIn(a, 'member');
  const spaceA = space(), ta = uniq('mine-a');
  await add(a, ta);
  await synced(a);
  await serverHas(ta);
  await signIn(b, 'member');
  const tb = uniq('mine-b');
  await add(b, tb);
  await synced(b);
  await serverHas(tb);
  expect(space()).not.toBe(spaceA);
  await expect(b.locator('#today')).toContainText(tb);
  await expect(b.locator('#today')).not.toContainText(ta);
  await expect(a.locator('#today')).not.toContainText(tb);
  expect((await db.list(`${spaceA}/tasks`)).map(d => d.title)).not.toContain(tb);
});

test('a viewer reads but cannot add or edit', async ({ phone }) => {
  const t = uniq('seen');
  const page = await phone();
  await signIn(page, 'viewer');
  // (a viewer's own space, filled from outside: they can't add to it themselves)
  await db.put(`${space()}/tasks/${t}`, { title: t, projectId: 'inbox', due: { date: today() }, done: false, updatedAt: Date.now() });
  await expect(page.locator('#today')).toContainText(t);
  await expect(page.locator('#fab')).toBeHidden();
  await expect(page.locator('#today .td-row').filter({ hasText: t }).locator('.td-check')).toBeDisabled();
});

test('a role change reaches the page by itself (role doc v ahead of the token)', async ({ phone }) => {
  const page = await phone();
  const { uid } = await signIn(page, 'viewer');
  await expect(page.locator('#fab')).toBeHidden();
  await db.put(`members/${uid}`, { role: 'member', v: 2 });
  await expect(page.locator('#fab')).toBeVisible();
  await db.del(`members/${uid}`);
  await expect(page.locator('#no-access')).toBeVisible({ timeout: 15_000 });
});

// S1: removing someone ends their access, not only their role doc: the Worker deletes the doc and revokes the account
// (revoked/{uid}: the rules refuse at once; claims cleared; refresh tokens ended)
test('an admin removes a member: the page loses the list, writes are refused, the session ends', async ({ phone }) => {
  const admin = await phone(), gone = await phone();
  const { uid: adminUid } = await signIn(admin, 'admin');
  const { uid } = await signIn(gone, 'member');
  // a page can't delete a role doc any more (the rules), and only admins may ask the Worker
  expect(await gone.evaluate(u => window.starter.members().remove(u), adminUid)).toBe('Admins only.');
  expect(await admin.evaluate(u => window.starter.members().remove(u), uid)).toBe('');
  expect(await db.get(`members/${uid}`)).toBeFalsy();
  expect(await db.get(`revoked/${uid}`)).toBeTruthy();
  await expect(gone.locator('#list-view')).toBeHidden({ timeout: 15_000 });
  // after a token refresh the token carries no role; the sessions were ended (validSince: real Firebase then refuses the
  // refresh token and the page signs out; the Auth emulator doesn't check it on refresh, so the test reads the account)
  expect(await gone.evaluate(async () => {
    const { getAuth } = await import('firebase/auth');
    const u = getAuth().currentUser;
    return u ? (await u.getIdTokenResult(true).then(r => r.claims.g ?? 'none', e => e.code)) : 'signed out';
  })).not.toHaveProperty('_');
  const account = await (await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'}/identitytoolkit.googleapis.com/v1/projects/demo-todo/accounts:lookup`,
    { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: [uid] }) })).json();
  expect(Number(account.users[0].validSince)).toBeGreaterThan(0);
  // added back later: the next claims ask clears revoked/ and the list returns
  expect(await admin.evaluate(u => window.starter.members().setRole(u, 'viewer'), uid)).toBe('');
  expect(await db.get(`members/${uid}`)).toMatchObject({ role: 'viewer', v: 1 });
});

// A token refresh restarts Firestore's Listen stream; a role change written just then must still reach the page (the
// Firestore emulator before v1.22 lost such changes: firebase-tools is pinned past it, package.json "rules")
test('a role change during a token refresh still reaches the page', async ({ phone }) => {
  const page = await phone();
  const { uid } = await signIn(page, 'viewer');
  const refresh = () => page.evaluate(async () => { const { getAuth } = await import('firebase/auth'); void getAuth().currentUser?.getIdToken(true); });
  for (let v = 2; v < 10; v += 2) {
    await refresh();
    await db.put(`members/${uid}`, { role: 'member', v });
    await expect(page.locator('#fab')).toBeVisible();
    await refresh();
    await db.put(`members/${uid}`, { role: 'viewer', v: v + 1 });
    await expect(page.locator('#fab')).toBeHidden();
  }
});

test('typing the next task while the last one saves keeps the new draft (slow or offline network)', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  await page.locator('#fab').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await page.context().setOffline(true);
  const first = uniq('first'), second = uniq('second');
  // both user actions in one task, so the next draft is typed before the first save resolves
  await page.evaluate(({ first, second }) => {
    const box = /** @type {HTMLInputElement} */ (document.querySelector('#add-sheet .td-add-title'));
    box.value = first;
    /** @type {HTMLFormElement} */ (document.querySelector('#add-sheet .td-add')).requestSubmit();
    box.value = second;
    box.dispatchEvent(new Event('input', { bubbles: true }));
  }, { first, second });
  await expect(page.locator('#add-sheet .td-add-title')).toHaveValue(second);
  await page.press('#add-sheet .td-add-title', 'Enter');
  await expect(page.locator('#add-sheet .td-add-title')).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(page.locator('#today')).toContainText(first);
  await expect(page.locator('#today')).toContainText(second);
  await page.context().setOffline(false);
  await serverHas(first);
  await serverHas(second);
});

test('a title starting "* " shows no box and a swipe right does not complete it', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('note');
  await db.put(`${space()}/tasks/${t}`, { title: `* ${t}`, projectId: 'inbox', order: Date.now(), priority: 4, done: false, due: { date: today() }, createdAt: Date.now(), updatedAt: Date.now() });
  await synced(page);
  await gesturesReady(page);
  const row = `#today .td-row[data-id="${t}"]`;
  await expect(page.locator(`${row} .td-title`)).toHaveText(t);
  await expect(page.locator(row)).toHaveClass(/is-plain/);
  await expect(page.locator(`${row} > .td-check`)).toBeHidden();
  await expect(page.getByRole('checkbox', { name: `Complete: * ${t}` })).toHaveCount(0);
  expect(await AxeBuilder(page)).toEqual([]);
  await finger(page, row, steps(260, 4, 8));
  await page.waitForTimeout(600);
  expect((await db.get(`${space()}/tasks/${t}`))?.done).toBe(false);
  await expect(page.locator(row)).toBeVisible();
});

test('the Inbox ••• menu: Add section, Copy link to Inbox, Comments, View activity, in that order', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  await openTab(page, 'inbox');
  await expect(page.locator('#inbox-page')).toBeVisible();
  await page.locator('#more-btn').click();
  const items = page.getByRole('menuitem');
  await expect(items.first()).toBeVisible();
  const names = (await items.allInnerTexts()).map(t => t.trim().split('\n')[0]);
  expect(names.slice(0, 4)).toEqual(['Add section', 'Copy link to Inbox', 'Comments', 'View activity']);
  expect(await AxeBuilder(page)).toEqual([]);
  await page.keyboard.press('Escape');
});
