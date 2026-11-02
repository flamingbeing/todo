import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pushItems, MAX_ITEMS } from '../src/push-items.js';
import { firesOf } from '../src/reminders.js';

const at = (d, t) => new Date(`${d}T${t}:00`).getTime();
const task = (id, date, time, extra = {}) => ({ id, title: `Task ${id}`, projectId: 'inbox', order: 1, priority: 4, done: false, due: { date, time }, reminders: [0], ...extra });

test('the reminders due in the next week, soonest first, with the local notification’s key as the key', () => {
  const now = at('2026-11-05', '10:00');
  const items = pushItems([task('b', '2026-11-06', '09:00', { reminders: [0, 30] }), task('a', '2026-11-05', '14:00'), task('far', '2026-11-20', '09:00')], now);
  assert.deepEqual(items.map(i => i.key.split('|').slice(0, 2).join('|')), ['a|0', 'b|30', 'b|0']);
  assert.equal(items[0].at, at('2026-11-05', '14:00'));
  assert.equal(items[0].key, firesOf(task('a', '2026-11-05', '14:00'))[0].key);
  assert.equal(items[0].taskId, 'a');
  assert.equal(items[0].title, 'Task a');
  assert.match(items[0].body, /^Due now, /);
  assert.deepEqual([items[0].date, items[0].time, items[0].lead], ['2026-11-05', '14:00', 0]);
  assert.equal(items[1].lead, 30);
});

test('nothing within a minute of now (the Worker sends that itself); a date with no time gives time ""', () => {
  const now = at('2026-11-05', '10:00');
  assert.deepEqual(pushItems([task('s', '2026-11-05', '10:01')], now), []);
  assert.equal(pushItems([task('s', '2026-11-05', '10:02')], now).length, 1);
  assert.equal(pushItems([{ ...task('d', '2026-11-06', undefined) }], now)[0].time, '');
});

test('past, done, deleted and reminder-less tasks give nothing; no title gives "Task"; sizes are capped', () => {
  const now = at('2026-11-05', '10:00');
  assert.deepEqual(pushItems([task('p', '2026-11-05', '09:59'), task('d', '2026-11-06', '09:00', { done: true }), task('x', '2026-11-06', '09:00', { _deleted: true }), task('n', '2026-11-06', '09:00', { reminders: [] })], now), []);
  assert.equal(pushItems([task('e', '2026-11-06', '09:00', { title: '' })], now)[0].title, 'Task');
  assert.equal(pushItems([task('l', '2026-11-06', '09:00', { title: 'x'.repeat(500) })], now)[0].title.length, 200);
  const many = Array.from({ length: MAX_ITEMS + 20 }, (_, i) => task(`t${i}`, '2026-11-06', '09:00'));
  assert.equal(pushItems(many, now).length, MAX_ITEMS);
});
