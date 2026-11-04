// The Add section page: its tick is off until a name is typed; a description is saved with the section and shows under
// its head (one line, a tap shows it all); the section's "…" > Edit section opens the same page with its values.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, openTab, db, space } from './fixtures.mjs';

test('Add section: the tick waits for a name, the description shows under the head, Edit section changes both', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  await openTab(page, 'inbox');
  const name = uniq('sec'), note = `Notes for ${name}`;

  await page.locator('#more-btn').click();
  await page.getByRole('menuitem', { name: 'Add section' }).click();
  await expect(page.locator('#section-page')).toBeVisible();
  await expect(page.locator('#section-title')).toHaveText('Add section');
  const done = page.locator('#section-done');
  await expect(done).toBeDisabled();
  await expect(page.locator('#section-desc')).toBeVisible();
  expect(await AxeBuilder(page)).toEqual([]);
  await page.fill('#section-name', '   ');
  await expect(done).toBeDisabled();
  await page.fill('#section-name', name);
  await expect(done).toBeEnabled();
  await page.fill('#section-desc', note);
  await done.click();

  await expect(page.locator('#inbox-page')).toBeVisible();
  const section = page.locator('#inbox .td-section', { hasText: name });
  const desc = section.locator('.td-sec-desc');
  await expect(desc).toHaveText(note);
  await expect(desc).toHaveAttribute('aria-expanded', 'false');
  await desc.click();
  await expect(desc).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(async () => (await db.list(`${space()}/sections`)).find(s => s.name === name)?.description, { timeout: 15_000 }).toBe(note);
  expect(await AxeBuilder(page)).toEqual([]);

  // Edit section: the same page, filled in; a new name and an emptied description
  await section.getByRole('button', { name: `More for ${name}` }).click();
  await page.getByRole('menuitem', { name: 'Edit section' }).click();
  await expect(page.locator('#section-title')).toHaveText('Edit section');
  await expect(page.locator('#section-name')).toHaveValue(name);
  await expect(page.locator('#section-desc')).toHaveValue(note);
  await expect(done).toBeEnabled();
  expect(await AxeBuilder(page)).toEqual([]);
  const renamed = `${name}-b`;
  await page.fill('#section-name', renamed);
  await page.fill('#section-desc', '');
  await done.click();
  const again = page.locator('#inbox .td-section', { hasText: renamed });
  await expect(again).toBeVisible();
  await expect(again.locator('.td-sec-desc')).toHaveCount(0);
  await expect.poll(async () => (await db.list(`${space()}/sections`)).find(s => s.name === renamed)?.description ?? null, { timeout: 15_000 }).toBe(null);
});
