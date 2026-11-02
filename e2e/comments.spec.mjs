// Comments: the task sheet's Comments section adds a text comment (shown with its time), the author edits and deletes
// their own, the row shows a small count, a viewer reads but cannot add, and the sheet passes axe.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, today, db, clickOpens } from './fixtures.mjs';

const put = (id, fields) => db.put(`spaces/_/tasks/${id}`, { projectId: 'inbox', order: Date.now(), priority: 4, done: false, createdAt: Date.now(), updatedAt: Date.now(), due: { date: today() }, ...fields });
const sheet = '#task-sheet';

test('add, edit and delete a comment; the row counts them', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('call');
  await put(t, { title: t });
  await synced(page);
  const row = page.locator('#today .td-row').filter({ hasText: t });
  await expect(row.locator('.td-comments-count')).toHaveCount(0);
  await clickOpens(row.locator('.td-row-main'), page.locator(sheet));
  await expect(page.locator(`${sheet} .td-comments h3`)).toHaveText('Comments');
  const box = page.getByLabel('Add a comment');
  await box.fill('Asked about **Friday**');
  await page.getByRole('button', { name: 'Send comment' }).click();
  const one = page.locator(`${sheet} .td-comment`);
  await expect(one).toHaveCount(1);
  await expect(one.locator('.td-comment-text strong')).toHaveText('Friday');
  await expect(one.locator('.td-comment-time')).not.toBeEmpty();
  expect(await AxeBuilder(page)).toEqual([]);
  await one.getByRole('button', { name: 'Edit comment' }).click();
  await page.getByLabel('Edit comment').fill('Moved to Monday');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(one.locator('.td-comment-text')).toHaveText('Moved to Monday');
  await page.keyboard.press('Escape');
  await expect(page.locator(sheet)).toBeHidden();   // (closed for good before it opens again: its Back step is gone)
  await expect(row.locator('.td-comments-count')).toHaveText('1');
  await clickOpens(row.locator('.td-row-main'), page.locator(sheet));
  await page.getByRole('button', { name: 'Delete comment' }).click();
  await expect(page.locator(`${sheet} .td-comment`)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(row.locator('.td-comments-count')).toHaveCount(0);
});

test('a viewer reads comments but has no box to add one', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'viewer');
  const t = uniq('read');
  await put(t, { title: t });
  await db.put(`spaces/_/comments/${t}c`, { taskId: t, text: 'Seen already', uid: 'someone', createdAt: Date.now(), updatedAt: Date.now() });
  await synced(page);
  const row = page.locator('#today .td-row').filter({ hasText: t });
  await clickOpens(row.locator('.td-row-main'), page.locator(sheet));
  await expect(page.locator(`${sheet} .td-comment .td-comment-text`)).toHaveText('Seen already');
  await expect(page.getByLabel('Add a comment')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit comment' })).toHaveCount(0);
});
