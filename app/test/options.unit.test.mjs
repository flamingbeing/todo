// The options Round 2 added: Home view and Swipe board cards clean to their defaults. node --test app/test/options.unit.test.mjs
// (options.js imports the kit by its import-map name, so this file maps @core/ui to the installed package first)
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const kit = pathToFileURL(resolve('node_modules/app-ui/ui/index.js')).href;
register(`data:text/javascript,${encodeURIComponent(`export const resolve = (s, c, n) => s === '@core/ui' ? { url: ${JSON.stringify(kit)}, shortCircuit: true } : n(s, c);`)}`);
const { OPTIONS, SETTING_SECTIONS } = await import('../src/options.js');

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
