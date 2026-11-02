import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanReminders, leadText, leadShort, dueMs, firesOf, dueNow, nextAt } from '../src/reminders.js';
import { cleanFields } from '../src/tasks.js';

const at = (d, t) => new Date(`${d}T${t}:00`).getTime();
const task = (extra = {}) => ({ id: 't1', title: 'Call', projectId: 'inbox', order: 1, priority: 4, done: false, due: { date: '2026-11-05', time: '14:00' }, reminders: [0, 30], ...extra });

test('cleanReminders keeps whole minutes 0..4 weeks, once each, sorted, at most 5', () => {
  assert.deepEqual(cleanReminders([30, 0, 30, -1, 2.5, 'x', 99999, 60]), [0, 30, 60]);
  assert.deepEqual(cleanReminders([1, 2, 3, 4, 5, 6, 7]), [1, 2, 3, 4, 5]);
  assert.deepEqual(cleanReminders(null), []);
  assert.deepEqual(cleanReminders('30'), []);
});

test('lead words', () => {
  assert.equal(leadText(0), 'At time of task');
  assert.equal(leadText(1), '1 minute before');
  assert.equal(leadText(30), '30 minutes before');
  assert.equal(leadText(60), '1 hour before');
  assert.equal(leadText(90), '90 minutes before');
  assert.equal(leadText(2880), '2 days before');
  assert.equal(leadText(10080), '1 week before');
  assert.deepEqual([0, 30, 120, 1440].map(leadShort), ['At time', '30m', '2h', '1d']);
});

test('the due moment: the time given, 09:00 for a date alone, null with no date', () => {
  assert.equal(dueMs(task()), at('2026-11-05', '14:00'));
  assert.equal(dueMs(task({ due: { date: '2026-11-05' } })), at('2026-11-05', '09:00'));
  assert.equal(dueMs(task({ due: null })), null);
});

test('firesOf: one fire per lead; none when done, deleted, undated or without reminders', () => {
  const f = firesOf(task());
  assert.deepEqual(f.map(x => x.at), [at('2026-11-05', '14:00'), at('2026-11-05', '13:30')]);
  assert.equal(new Set(f.map(x => x.key)).size, 2);
  assert.deepEqual(firesOf(task({ done: true })), []);
  assert.deepEqual(firesOf(task({ _deleted: true })), []);
  assert.deepEqual(firesOf(task({ due: null })), []);
  assert.deepEqual(firesOf(task({ reminders: undefined })), []);
});

test('dueNow: due once, not early, not long past, not twice; a repeat fires at its next due', () => {
  const t = task();
  assert.deepEqual(dueNow([t], at('2026-11-05', '13:29'), new Set()), []);
  const first = dueNow([t], at('2026-11-05', '13:31'), new Set());
  assert.equal(first.length, 1);
  assert.equal(first[0].lead, 30);
  assert.deepEqual(dueNow([t], at('2026-11-05', '13:31'), new Set([first[0].key])), []);
  assert.equal(dueNow([t], at('2026-11-05', '14:01'), new Set([first[0].key])).length, 1);
  assert.deepEqual(dueNow([t], at('2026-11-05', '15:00'), new Set()), [], 'an hour late is dropped');
  const next = task({ due: { date: '2026-11-06', time: '14:00' } });
  assert.equal(dueNow([next], at('2026-11-06', '14:00'), new Set(first.map(x => x.key))).length, 1);
});

test('nextAt: the soonest fire after now', () => {
  assert.equal(nextAt([task()], at('2026-11-05', '10:00')), at('2026-11-05', '13:30'));
  assert.equal(nextAt([task()], at('2026-11-05', '13:45')), at('2026-11-05', '14:00'));
  assert.equal(nextAt([task()], at('2026-11-05', '14:00')), null);
});

test('cleanFields cleans reminders', () => {
  assert.deepEqual(cleanFields({ reminders: [30, 30, 0] }).reminders, [0, 30]);
  assert.deepEqual(cleanFields({ reminders: null }).reminders, []);
  assert.equal('reminders' in cleanFields({ title: 'x' }), false);
});
