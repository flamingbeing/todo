// Access requests: anyone signed in with Google but without a role asks for access (requests/{uid}); an admin sees
// them in Settings > Access requests and lets them in (a member, through /api/members/) or declines.
import { test, expect, signIn, db, openSettings } from './fixtures.mjs';

test('a new person asks for access; an admin lets them in and their list opens by itself', async ({ phone }) => {
  const admin = await phone(), asker = await phone();
  await signIn(admin, 'admin');
  const { uid, email } = await signIn(asker, '');
  await expect(asker.locator('#no-access')).toContainText('Access requested');
  await expect.poll(() => db.get(`requests/${uid}`).then(d => d?.email)).toBe(email);

  await openSettings(admin, 'Access requests');
  const row = admin.locator(`.td-people-row[data-uid="${uid}"]`);
  await expect(row).toContainText(email);
  await row.getByRole('button', { name: 'Let in' }).click();
  await expect(admin.locator('.td-people-note')).toContainText('can now use the app');
  await expect(row).toHaveCount(0);
  expect((await db.get(`members/${uid}`))?.role).toBe('member');
  await expect(asker.locator('#list-view')).toBeVisible({ timeout: 15_000 });
});

test('an admin declines a request; members never see the page', async ({ phone }) => {
  const admin = await phone(), asker = await phone(), member = await phone();
  await signIn(admin, 'admin');
  const { uid } = await signIn(asker, '');
  await expect.poll(() => db.get(`requests/${uid}`).then(d => !!d)).toBe(true);
  await openSettings(admin, 'Access requests');
  await admin.locator(`.td-people-row[data-uid="${uid}"]`).getByRole('button', { name: 'Decline' }).click();
  await expect(admin.locator(`.td-people-row[data-uid="${uid}"]`)).toHaveCount(0);
  // (the row goes at once, from the page's own copy; the server's delete lands a moment later)
  await expect.poll(() => db.get(`requests/${uid}`).then(d => !!d)).toBe(false);
  expect(await db.get(`members/${uid}`)).toBeFalsy();

  await signIn(member, 'member');
  await openSettings(member);
  await expect(member.locator('#settings-host .ui-settings-go').filter({ hasText: /^Access requests/ })).toHaveCount(0);
});
