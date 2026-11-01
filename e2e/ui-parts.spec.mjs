// @core/ui parts on the app's screens: delete with no question and an Undo toast, a toast dismissed, axe on a toast.
import AxeBuilder from './axe.mjs';
import { test, expect, clickOpens, signIn, add, uniq } from './fixtures.mjs';

test('delete has no question: an Undo toast puts the task back; the toast passes axe', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('del');
  await add(page, t);

  await clickOpens(page.locator('#today .td-row-main').filter({ hasText: t }), page.locator('#task-sheet'));
  await page.locator('#task-sheet [aria-label="More"]').click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(page.locator('dialog.modal')).toHaveCount(0);
  await expect(page.locator('#today')).not.toContainText(t);
  const toast = page.locator('.toast', { hasText: 'Task deleted' });
  await expect(toast).toBeVisible();
  expect(await AxeBuilder(page)).toEqual([]);

  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#today')).toContainText(t);
});

test('a toast can be dismissed', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('note');
  await add(page, t);
  await page.getByRole('checkbox', { name: `Complete: ${t}` }).click();
  const toast = page.locator('.toast', { hasText: 'Task completed' });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Dismiss' }).click();
  await expect(toast).toHaveCount(0);
});
