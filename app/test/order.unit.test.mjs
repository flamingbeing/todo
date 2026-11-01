// order.js: manual order by midpoints, and the renumbering when two neighbours are too close. node --test app/test/order.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { orderBetween, orderAtEnd, placeAt, byOrder, tooClose } from '../src/order.js';

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
