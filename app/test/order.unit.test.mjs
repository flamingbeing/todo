// order.js: manual order by midpoints, and the renumbering when two neighbours are too close. node --test app/test/order.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { orderBetween, orderAtEnd, placeAt, byOrder, tooClose, placeInTree, renumbered } from '../src/order.js';

test('between two neighbours: the midpoint; at either end: one past it; alone: 1', () => {
  assert.equal(orderBetween(1, 2), 1.5);
  assert.equal(orderBetween(null, 2), 1);
  assert.equal(orderBetween(3, null), 4);
  assert.equal(orderBetween(null, null), 1);
  assert.equal(orderAtEnd([{ order: 3 }, { order: 7 }, {}]), 8);
  assert.equal(orderAtEnd([]), 1);
});

test('byOrder sorts by order, missing last; placeAt splits the gap or renumbers 1..n when it is too small', () => {
  const list = [{ id: 'b', order: 2 }, { id: 'x' }, { id: 'a', order: 1 }];
  assert.deepEqual(byOrder(list).map(x => x.id), ['a', 'b', 'x']);
  assert.deepEqual(placeAt([{ id: 'a', order: 1 }, { id: 'b', order: 2 }], 1), { order: 1.5, renumber: [] });
  assert.deepEqual(placeAt([{ id: 'a', order: 1 }], 0), { order: 0, renumber: [] });
  const close = [{ id: 'a', order: 1 }, { id: 'b', order: 1 + 1e-7 }, { id: 'c', order: 5 }];
  assert.equal(tooClose(1, 1 + 1e-7), true);
  const p = placeAt(close, 1);
  assert.equal(p.order, 2);
  assert.deepEqual(p.renumber.map(r => [r.item.id, r.order]), [['a', 1], ['b', 3], ['c', 4]]);
});

// a list drawn as a tree: a, a1 (under a), a2 (under a), b, b1 (under b), c
const L = (/** @type {string} */ id, /** @type {number} */ depth, more = {}) => ({ task: { id, ...more }, depth });
const tree = [L('a', 0), L('a1', 1), L('a2', 1), L('b', 0), L('b1', 1), L('c', 0)];

test('placeInTree: a drop at the top level, between top tasks', () => {
  const r = placeInTree(tree, 5, 0);
  assert.deepEqual([r.depth, r.parentId, r.index, r.siblings.map(t => t.id)], [0, null, 2, ['a', 'b', 'c']]);
  assert.deepEqual(placeInTree(tree, 0, 3).depth, 0, 'nothing above: the top level');
  assert.deepEqual(placeInTree(tree, 6, 0).index, 3, 'at the end');
});

test('placeInTree: pulled right it indents under the line above, one level at most', () => {
  const r = placeInTree(tree, 6, 1);
  assert.deepEqual([r.depth, r.parentId, r.index, r.siblings.map(t => t.id)], [1, 'c', 0, []]);
  const deep = placeInTree(tree, 3, 5);
  assert.deepEqual([deep.depth, deep.parentId, deep.index], [2, 'a2', 0]);
  assert.equal(placeInTree(tree, 6, 1, 4).depth, 0, 'its own subtasks would go past the deepest level');
  assert.equal(placeInTree([L('a', 0, { collapsed: true })], 1, 1).depth, 0, 'not into a folded task');
});

test('placeInTree: pulled left it outdents, but not above the line below', () => {
  const out = placeInTree(tree, 3, 0);
  assert.deepEqual([out.depth, out.parentId, out.index], [0, null, 1], 'after a2, back to the top: between a and b');
  const kept = placeInTree(tree, 2, 0);
  assert.deepEqual([kept.depth, kept.parentId, kept.index, kept.siblings.map(t => t.id)], [1, 'a', 1, ['a1', 'a2']], 'between a1 and a2 it stays under a');
  assert.deepEqual(placeInTree(tree, 1, 0).depth, 1, 'right under a, above a1');
});

test('renumbered: 1..n, only the records whose number changes', () => {
  assert.deepEqual(renumbered([{ id: 'a', order: 1 }, { id: 'b', order: 5 }, { id: 'c' }]).map(x => [x.item.id, x.order]), [['b', 2], ['c', 3]]);
  assert.deepEqual(renumbered([{ id: 'a', dayOrder: 2 }, { id: 'b', dayOrder: 2 }], 'dayOrder').map(x => [x.item.id, x.order]), [['a', 1]]);
});
