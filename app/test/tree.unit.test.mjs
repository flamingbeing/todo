// tree.js: subtasks: depth, what is under a task, how deep it may go, the lines a list draws. node --test app/test/tree.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { childrenOf, depthOf, descendants, heightOf, canNest, flatten, countText, MAX_DEPTH } from '../src/tree.js';

const t = (id, parentId = null, o = {}) => ({ id, parentId, order: o.order ?? 0, ...o });
const chain = Array.from({ length: MAX_DEPTH + 1 }, (_, i) => t(`d${i}`, i ? `d${i - 1}` : null));
const byId = list => new Map(list.map(x => [x.id, x]));

test('children in order; depth counts the parents; a loop or a missing parent ends it', () => {
  const list = [t('a'), t('b', 'a', { order: 2 }), t('c', 'a', { order: 1 })];
  assert.deepEqual(childrenOf(list).get('a').map(x => x.id), ['c', 'b']);
  assert.equal(depthOf(chain.at(-1), byId(chain)), MAX_DEPTH);
  assert.equal(depthOf(t('x', 'missing'), byId([])), 0);
  const loop = [t('p', 'q'), t('q', 'p')];
  assert.ok(depthOf(loop[0], byId(loop)) <= 1, 'a loop does not hang');
});

test('descendants and height: every task under one, at any depth', () => {
  assert.deepEqual(descendants('d0', chain).map(x => x.id), chain.slice(1).map(x => x.id));
  assert.deepEqual(descendants('d3', chain).map(x => x.id), ['d4']);
  assert.equal(heightOf('d0', chain), MAX_DEPTH);
  assert.equal(heightOf('d4', chain), 0);
  assert.deepEqual(descendants('p', [t('p', 'q'), t('q', 'p')]).map(x => x.id), ['q'], 'a loop ends');
});

test('nesting: no loops, and never deeper than the limit', () => {
  const list = [...chain, t('solo'), t('pair'), t('pair1', 'pair')];
  assert.equal(canNest(list.find(x => x.id === 'solo'), chain[MAX_DEPTH - 1], list), true);
  assert.equal(canNest(list.find(x => x.id === 'solo'), chain[MAX_DEPTH], list), false, 'one level too deep');
  assert.equal(canNest(list.find(x => x.id === 'pair'), chain[MAX_DEPTH - 1], list), false, 'its own subtask would be too deep');
  assert.equal(canNest(chain[0], chain[2], list), false, 'not under its own subtask');
  assert.equal(canNest(chain[0], chain[0], list), false);
});

test('flatten: each top task then its open subtasks, deeper each level; collapsed hides; counts include done', () => {
  const all = [t('a'), t('a1', 'a', { order: 1 }), t('a2', 'a', { order: 2, done: true }), t('a11', 'a1'), t('b', null, { collapsed: true }), t('b1', 'b')];
  const lines = flatten([all[0], all[4]], all);
  assert.deepEqual(lines.map(l => [l.task.id, l.depth]), [['a', 0], ['a1', 1], ['a11', 2], ['b', 0]]);
  assert.equal(countText(lines[0]), '1/2');
  assert.equal(countText(lines[2]), '');
  assert.equal(countText(lines[3]), '0/1');
  assert.deepEqual(flatten([all[0]], all, { open: () => false }).map(l => l.task.id), ['a'], 'no subtasks drawn');
});
