// The wide dialogs' pure parts (app/src/wide/modal-parts.js): the tasks before and after one in its list, the Settings
// nav's search, the rail's order. node --test app/test/wide-modal.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { neighbours, navMatch, RAIL } from '../src/wide/modal-parts.js';

test('neighbours: the tasks either side; none at the ends; none for a task not in the list; a repeat counts once', () => {
  const ids = ['a', 'b', 'c'];
  assert.deepEqual(neighbours(ids, 'b'), { prev: 'a', next: 'c' });
  assert.deepEqual(neighbours(ids, 'a'), { prev: null, next: 'b' });
  assert.deepEqual(neighbours(ids, 'c'), { prev: 'b', next: null });
  assert.deepEqual(neighbours(ids, 'x'), { prev: null, next: null });
  assert.deepEqual(neighbours([], 'a'), { prev: null, next: null });
  assert.deepEqual(neighbours(['a', 'b', 'a', 'c'], 'b'), { prev: 'a', next: 'c' });
});

test('navMatch: by the title or the words on the page, any case, every word typed; empty keeps all', () => {
  assert.equal(navMatch('', 'Theme'), true);
  assert.equal(navMatch('  ', 'Theme'), true);
  assert.equal(navMatch('them', 'Theme'), true);
  assert.equal(navMatch('THEME', 'Theme'), true);
  assert.equal(navMatch('dark', 'Theme', 'Appearance Light Dark Automatic'), true);
  assert.equal(navMatch('dark mode', 'Theme', 'Appearance Light Dark'), false);
  assert.equal(navMatch('week start', 'General', 'Start of the week'), true);
  assert.equal(navMatch('zzz', 'General', 'Start of the week'), false);
});

test('RAIL: Project, Date, Deadline, Priority, Labels, Reminders (no place)', () => {
  assert.deepEqual(RAIL.map(([, label]) => label), ['Project', 'Date', 'Deadline', 'Priority', 'Labels', 'Reminders']);
});
