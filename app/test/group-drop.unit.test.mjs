// group-drop.js: what a drag between groups changes, the group "+" prefill, the postpone date and the sorted note;
// edge-scroll.js: the auto-scroll speed curve. node --test app/test/group-drop.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { groupMove, groupName, slotIn, addFor, postponed, sortedNote } from '../src/group-drop.js';
import { edgeSpeed, ZONE, MAX_SPEED } from '../src/ui/edge-scroll.js';

const today = '2026-11-01';
const labels = [{ id: 'l-home', name: 'home', color: 'blue', order: 1 }, { id: 'l-work', name: 'work', color: 'red', order: 2 }];
const projects = [{ id: 'p-garden', name: 'Garden', color: 'green', order: 1 }];
const c = { labels, projects, today };
/** @param {Record<string, unknown>} f */
const task = f => /** @type {any} */ ({ id: 't1', title: 'Water the plants', projectId: 'p-x', order: 3, priority: 4, ...f });

test('date: a day keeps the time, the repeat and the words', () => {
  const t = task({ due: { date: '2026-10-30', time: '09:30', rrule: 'FREQ=WEEKLY', string: 'every fri' } });
  const m = groupMove(t, 'date', '0', '12026-11-03', c);
  assert.deepEqual(m?.fields, { due: { date: '2026-11-03', time: '09:30', rrule: 'FREQ=WEEKLY', string: 'every fri' } });
  assert.equal(m?.key, 'dayOrder');
  assert.deepEqual(m?.was, { due: t.due });
  assert.equal(m?.title, 'Tuesday');
});

test('date: No date clears the date and its repeat; Undo has them', () => {
  const t = task({ due: { date: '2026-11-02', rrule: 'FREQ=DAILY' } });
  const m = groupMove(t, 'date', '12026-11-02', '~', c);
  assert.deepEqual(m?.fields, { due: null });
  assert.deepEqual(m?.was, { due: { date: '2026-11-02', rrule: 'FREQ=DAILY' } });
  assert.equal(m?.title, 'No date');
});

test('date: from No date to a day; Overdue takes no drop', () => {
  const t = task({});
  assert.deepEqual(groupMove(t, 'date', '~', `1${today}`, c)?.fields, { due: { date: today } });
  assert.equal(groupMove(t, 'date', `1${today}`, '0', c), null);
  assert.equal(groupMove(t, 'date', '~', `1${today}`, c)?.title, 'Today');
});

test('the same group: only its place changes', () => {
  const m = groupMove(task({ priority: 2 }), 'priority', '2', '2', c);
  assert.deepEqual(m?.fields, {});
  assert.equal(m?.key, 'order');
});

test('priority: the group\'s', () => {
  const m = groupMove(task({}), 'priority', '4', '1', c);
  assert.deepEqual(m?.fields, { priority: 1 });
  assert.deepEqual(m?.was, { priority: 4 });
  assert.equal(m?.title, 'Priority 1');
  assert.equal(groupName('priority', '4', c), 'No priority');
});

test('label: the source label off, the target on, once', () => {
  assert.deepEqual(groupMove(task({ labels: ['l-home'] }), 'label', 'l-home', 'l-work', c)?.fields, { labels: ['l-work'] });
  // already has the target: no twin
  assert.deepEqual(groupMove(task({ labels: ['l-home', 'l-work'] }), 'label', 'l-home', 'l-work', c)?.fields, { labels: ['l-work'] });
  // a label kept by its name, from before ids
  assert.deepEqual(groupMove(task({ labels: ['Home', 'x'] }), 'label', 'l-home', 'l-work', c)?.fields, { labels: ['x', 'l-work'] });
  assert.deepEqual(groupMove(task({ labels: ['l-home'] }), 'label', 'l-home', 'l-work', c)?.was, { labels: ['l-home'] });
  assert.equal(groupMove(task({ labels: ['l-home'] }), 'label', 'l-home', 'l-work', c)?.title, 'work');
});

test('label: No label as the target takes the source off; from No label adds the target', () => {
  assert.deepEqual(groupMove(task({ labels: ['l-home', 'l-work'] }), 'label', 'l-home', '~', c)?.fields, { labels: ['l-work'] });
  assert.deepEqual(groupMove(task({}), 'label', '~', 'l-home', c)?.fields, { labels: ['l-home'] });
  assert.equal(groupName('label', '~', c), 'No label');
});

test('project: to its top level, no section; Undo has the old place', () => {
  const t = task({ projectId: 'p-x', sectionId: 's-1', parentId: 'parent' });
  const m = groupMove(t, 'project', 'p-x', 'p-garden', c);
  assert.deepEqual(m?.place, { projectId: 'p-garden', sectionId: null, parentId: null });
  assert.deepEqual(m?.fields, {});
  assert.deepEqual(m?.was, { projectId: 'p-x', sectionId: 's-1', parentId: 'parent' });
  assert.equal(m?.title, 'Garden');
  assert.equal(groupMove(t, 'project', 'p-x', 'inbox', c)?.title, 'Inbox');
});

test('slotIn: between its neighbours by order; a day numbered again', () => {
  const a = task({ id: 'a', order: 1 }), b = task({ id: 'b', order: 2 }), me = task({ id: 'me', order: 9 });
  assert.equal(slotIn([a, b], 1, me, 'order').value, 1.5);
  assert.equal(slotIn([a, b], 0, me, 'order').value, 0);
  assert.equal(slotIn([a, b], 2, me, 'order').value, 3);
  const d = slotIn([task({ id: 'x', dayOrder: 1 }), task({ id: 'y' })], 1, me, 'dayOrder');
  assert.equal(d.value, 2);
  assert.deepEqual(d.renumber.map(r => [r.item.id, r.order]), [['y', 3]]);
});

test('addFor: the group\'s value in quick add', () => {
  const base = { projectId: 'inbox', due: { date: today } };
  assert.deepEqual(addFor('date', '12026-11-05', c, base), { projectId: 'inbox', due: { date: '2026-11-05' } });
  assert.deepEqual(addFor('date', '~', c, base), { projectId: 'inbox', due: null });
  assert.equal(addFor('date', '0', c, base), null);
  assert.deepEqual(addFor('priority', '2', c, base), { ...base, priority: 2 });
  assert.deepEqual(addFor('label', 'l-work', c, base), { ...base, labels: ['work'] });
  assert.deepEqual(addFor('label', '~', c, base), { ...base, labels: [] });
  assert.deepEqual(addFor('project', 'p-garden', c, base), { ...base, projectId: 'p-garden', sectionId: null, parentId: null });
});

test('postponed: tomorrow, keeping time and repeat, across a month and a year end', () => {
  assert.deepEqual(postponed(task({ due: { date: '2026-10-28', time: '08:00', rrule: 'FREQ=DAILY' } }), '2026-10-31'),
    { date: '2026-11-01', time: '08:00', rrule: 'FREQ=DAILY' });
  assert.deepEqual(postponed(task({ due: { date: '2026-12-31' } }), '2026-12-31'), { date: '2027-01-01' });
  assert.deepEqual(postponed(task({}), '2028-02-28'), { date: '2028-02-29' });
});

test('sortedNote names the order', () => {
  assert.match(sortedNote('priority'), /priority/);
  assert.match(sortedNote('added'), /date added/);
});

test('edge speed: 0 at the zone\'s inner edge, the most at the edge, rising (iOS convention)', () => {
  const lo = 100, hi = 800;
  assert.equal(edgeSpeed(400, lo, hi), 0);
  assert.equal(edgeSpeed(hi - ZONE, lo, hi), 0);
  assert.equal(edgeSpeed(lo + ZONE, lo, hi), 0);
  assert.equal(edgeSpeed(hi, lo, hi), MAX_SPEED);
  assert.equal(edgeSpeed(lo, lo, hi), -MAX_SPEED);
  assert.equal(MAX_SPEED, 900);
  assert.equal(ZONE, 60);
  // past the edge: no faster
  assert.equal(edgeSpeed(hi + 50, lo, hi), MAX_SPEED);
  // ease-in: a quarter of the way at half depth
  assert.equal(edgeSpeed(hi - ZONE / 2, lo, hi), MAX_SPEED / 4);
  let prev = 0;
  for (let p = hi - ZONE; p <= hi; p += 3) { const v = edgeSpeed(p, lo, hi); assert.ok(v >= prev); prev = v; }
  prev = 0;
  for (let p = lo + ZONE; p >= lo; p -= 3) { const v = edgeSpeed(p, lo, hi); assert.ok(v <= prev); prev = v; }
  // a board's sides: 40 px zones
  assert.equal(edgeSpeed(20, 0, 390, 40), -MAX_SPEED / 4);
});

test('by deadline: a day sets it, No deadline clears it, Overdue takes no drop; its "+" starts with that deadline', () => {
  const c = { labels: [], projects: [], today: '2026-11-01' }, t = { id: 'a', title: 'a', deadline: '2026-11-03' };
  assert.deepEqual(groupMove(t, 'deadline', '12026-11-03', '12026-11-09', c), { fields: { deadline: '2026-11-09' }, key: 'order', title: groupName('deadline', '12026-11-09', c), was: { deadline: '2026-11-03' } });
  assert.deepEqual(groupMove(t, 'deadline', '12026-11-03', '~', c)?.fields, { deadline: null });
  assert.equal(groupMove(t, 'deadline', '~', '0', c), null);
  assert.equal(groupName('deadline', '~', c), 'No deadline');
  assert.deepEqual(addFor('deadline', '12026-11-09', { labels: [] }, { projectId: 'inbox' }), { projectId: 'inbox', deadline: '2026-11-09' });
  assert.equal(addFor('deadline', '0', { labels: [] }, {}), null);
  assert.equal(sortedNote('deadline'), 'This list is in deadline order');
});

test("a day's list (Today) keeps its own order whatever the grouping", () => {
  const t = task({ priority: 2 });
  assert.equal(groupMove(t, 'priority', '2', '1', c)?.key, 'order');
  assert.equal(groupMove(t, 'priority', '2', '1', { ...c, byDay: true })?.key, 'dayOrder');
  assert.equal(groupMove(t, 'none', '', '', { ...c, byDay: true })?.key, 'dayOrder');
});
