// The options Round 2 added: Home view and Swipe board cards clean to their defaults. node --test app/test/options.unit.test.mjs
// (options.js imports the kit by its import-map name, so this file maps @core/ui to the installed package first)
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const kit = pathToFileURL(resolve('node_modules/app-ui/ui/index.js')).href;
register(`data:text/javascript,${encodeURIComponent(`export const resolve = (s, c, n) => s === '@core/ui' ? { url: ${JSON.stringify(kit)}, shortCircuit: true } : n(s, c);`)}`);
const { OPTIONS } = await import('../src/options.js');
const { SETTING_SECTIONS } = await import('../src/settings-rows.js');

test('home: a tab id of the bar, else Today', () => {
  const { clean, default: d, scope } = OPTIONS.home;
  assert.equal(scope, 'device');
  assert.equal(d, 'today');
  for (const id of ['inbox', 'today', 'upcoming', 'browse']) assert.equal(clean?.(id), id);
  for (const bad of ['', 'nope', 'Today', 3, null, undefined, {}, ['today']]) assert.equal(clean?.(bad), 'today');
});

test('board cards follow the row swipes: no separate option or row', () => {
  assert.equal(OPTIONS.boardSwipe, undefined);
  const rows = SETTING_SECTIONS.find(s => s.title === 'General')?.rows ?? [];
  assert.equal(rows.find(r => r.key === 'boardSwipe'), undefined);
});

test('Settings > General has the Home view row', () => {
  const rows = SETTING_SECTIONS.find(s => s.title === 'General')?.rows ?? [];
  const home = rows.find(r => r.key === 'home');
  assert.equal(home?.label, 'Home view');
  assert.deepEqual(home?.choices?.map(([id]) => id), ['inbox', 'today', 'upcoming', 'browse']);
});

test('round 3 options: this device, off or as before by default, cleaned', () => {
  const want = { resetSubs: true, tone: false, nextWeekDay: 1, weekendDay: 6, autoReminder: -1, fabPos: 'right', appIcon: 'default',
    browseHidden: [], goalParty: false, daysOff: [], vacation: false };
  for (const [k, d] of Object.entries(want)) {
    assert.equal(OPTIONS[k]?.scope, 'device', k);
    assert.deepEqual(OPTIONS[k].default, d, k);
  }
  const c = (/** @type {string} */ k, /** @type {unknown} */ v) => (OPTIONS[k].clean ? OPTIONS[k].clean(v) : v);
  assert.equal(c('weekendDay', 0), 0); assert.equal(c('weekendDay', 3), 6);
  assert.equal(c('nextWeekDay', 5), 5); assert.equal(c('nextWeekDay', 9), 1);
  assert.equal(c('autoReminder', 30), 30); assert.equal(c('autoReminder', 7), -1);
  assert.equal(c('fabPos', 'left'), 'left'); assert.equal(c('fabPos', 'top'), 'right');
  assert.equal(c('appIcon', 'mint'), 'mint'); assert.equal(c('appIcon', 'x'), 'default');
  assert.deepEqual(c('browseHidden', ['reporting', 'nope', 'inbox']), ['inbox', 'reporting']);
  assert.deepEqual(c('daysOff', [6, 0, 0, 9, 'x']), [0, 6]);
});

test('Settings pages: General has the Date & time and Swipe rows, Select among the swipes; Notifications holds Notify me', () => {
  const page = (/** @type {string} */ t) => SETTING_SECTIONS.find(s => s.title === t)?.rows ?? [];
  const keys = (/** @type {string} */ t) => page(t).flatMap(r => ('key' in r ? [r.key] : []));
  assert.deepEqual(keys('General'), ['home', 'smartDates', 'resetSubs', 'tone', 'weekStart', 'nextWeekDay', 'weekendDay', 'swipeRight', 'swipeLeft', 'bigRows']);
  assert.ok(page('General').find(r => 'key' in r && r.key === 'swipeRight')?.choices?.some(([v]) => v === 'select'));
  assert.deepEqual(keys('Productivity'), ['dailyGoal', 'weeklyGoal', 'goalParty', 'vacation']);
  assert.deepEqual(keys('Reminders'), ['autoReminder']);
  assert.deepEqual(keys('Notifications'), ['reminders']);
  assert.equal(page('Productivity').find(r => 'key' in r && r.key === 'dailyGoal')?.choices?.find(([v]) => v === 3)?.[1], '3 tasks');
  for (const r of SETTING_SECTIONS.flatMap(s => s.rows ?? [])) if ('key' in r) assert.ok(OPTIONS[r.key], `${r.key} is an option`);
});
