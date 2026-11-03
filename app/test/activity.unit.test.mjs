import test from 'node:test';
import assert from 'node:assert/strict';
import { events } from '../src/activity-log.js';

test('events: added, completed and comments, newest first', () => {
  const tasks = [{ id: 'a', title: 'Buy milk', createdAt: 100, done: true, doneAt: 300 }, { id: 'b', title: 'Call', parentId: 'a', createdAt: 150 }];
  const comments = [{ id: 'c', taskId: 'a', text: 'ok', name: 'Sam', createdAt: 200 }];
  const out = events(tasks, comments);
  assert.deepEqual(out.map(e => e.at), [300, 200, 150, 100]);
  assert.match(out[0].text, /completed: Buy milk/);
  assert.match(out[2].text, /^Sub-task added/);
});

test('events carry their kind, title and project; comments take their task\'s project', async () => {
  const tasks = [{ id: 'a', title: 'Buy milk', projectId: 'p1', createdAt: 100, done: true, doneAt: 300 }, { id: 'b', title: 'Call', parentId: 'a', createdAt: 150 }];
  const out = events(tasks, [{ id: 'c', taskId: 'a', text: 'ok', name: 'Sam', createdAt: 200 }]);
  assert.deepEqual(out.map(e => e.kind), ['completed', 'commented', 'added', 'added']);
  assert.equal(out[0].title, 'Buy milk'); assert.equal(out[0].projectId, 'p1');
  assert.equal(out[1].projectId, 'p1'); assert.equal(out[2].projectId, 'inbox'); assert.equal(out[2].sub, true);
  const { lead } = await import('../src/activity-log.js');
  assert.equal(lead(out[0]), 'You completed a task:'); assert.equal(lead(out[2]), 'You added a sub-task:');
});

test('ofKind keeps one kind (all: every one); byDay groups by local day, newest first', async () => {
  const { ofKind, byDay, KINDS } = await import('../src/activity-log.js');
  const at = (d, t) => new Date(`${d}T${t}:00`).getTime();
  const tasks = [{ id: 'a', title: 'A', createdAt: at('2026-11-01', '09:00'), done: true, doneAt: at('2026-11-02', '08:53') },
    { id: 'b', title: 'B', createdAt: at('2026-11-02', '07:00') }];
  const all = events(tasks, []);
  assert.equal(ofKind(all, 'all').length, 3);
  assert.deepEqual(ofKind(all, 'completed').map(e => e.title), ['A']);
  assert.deepEqual(ofKind(all, 'added').map(e => e.title), ['B', 'A']);
  const days = byDay(all);
  assert.deepEqual(days.map(d => d.day), ['2026-11-02', '2026-11-01']);
  assert.deepEqual(days[0].events.map(e => e.kind), ['completed', 'added']);
  assert.deepEqual(KINDS.map(k => k[0]), ['all', 'completed', 'added', 'commented']);
});
