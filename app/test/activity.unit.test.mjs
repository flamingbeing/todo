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
