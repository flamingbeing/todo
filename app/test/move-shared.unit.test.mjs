// The old shared space's one-time copy into an admin's own space (app/src/move-shared.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCopy, isEmpty, moveShared, MOVE_ORDER } from '../src/move-shared.js';

const empty = () => ({ tasks: [], projects: [{ id: 'inbox', inbox: true }], sections: [], labels: [], filters: [], comments: [], templates: [] });

test('toCopy keeps ids, drops deleted ones, ones already there and the engine’s server stamp', () => {
  const old = [{ id: 'a', data: { title: 'A', serverAt: 5, createdAt: 1 } }, { id: 'b', data: { title: 'B', _deleted: true } }, { id: 'c', data: { title: 'C' } }];
  assert.deepEqual(toCopy(old, new Set(['c'])), [{ id: 'a', title: 'A', createdAt: 1 }]);
});

test('isEmpty: the Inbox alone is empty; any task, project, label or filter is not', () => {
  assert.equal(isEmpty(empty()), true);
  assert.equal(isEmpty({ ...empty(), tasks: [{ id: 't' }] }), false);
  assert.equal(isEmpty({ ...empty(), projects: [{ id: 'inbox', inbox: true }, { id: 'p' }] }), false);
  assert.equal(isEmpty({ ...empty(), labels: [{ id: 'l' }] }), false);
});

test('moveShared writes parents first, skips a space that has things, and stops when the person changes', async () => {
  const old = { projects: [{ id: 'p', data: { name: 'Work' } }], sections: [{ id: 's', data: { name: 'Now', projectId: 'p' } }], tasks: [{ id: 't', data: { title: 'Go', projectId: 'p' } }] };
  const list = async c => old[c] || [];
  const writes = [];
  const n = await moveShared({ list, data: empty, write: async (c, r) => { writes.push(`${c}/${r.id}`); return ''; }, still: () => true });
  assert.equal(n, 3);
  assert.deepEqual(writes, ['projects/p', 'sections/s', 'tasks/t']);
  assert.deepEqual(MOVE_ORDER.slice(0, 2), ['projects', 'sections']);
  assert.equal(await moveShared({ list, data: () => ({ ...empty(), tasks: [{ id: 'x' }] }), write: async () => '', still: () => true }), 0);
  assert.equal(await moveShared({ list, data: empty, write: async () => '', still: () => false }), -1);
  assert.equal(await moveShared({ list, data: empty, write: async () => 'refused', still: () => true }), 0, 'a refused write is not counted');
});
