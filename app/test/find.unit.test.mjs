// search.js: the Search tab's matching and its recent searches.
// node --test app/test/find.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { searchAll, wordsOf, hasAll, remember } from '../src/search.js';

const data = {
  tasks: [
    { id: 'a', title: 'Buy oat milk', projectId: 'inbox', createdAt: 1 },
    { id: 'b', title: 'Call bank', description: 'about the milk money', projectId: 'inbox', createdAt: 2 },
    { id: 'c', title: 'Milk the goats', done: true, createdAt: 3 },
    { id: 'd', title: 'Café crème', createdAt: 4 },
    { id: 'old', text: 'no title' },
  ],
  projects: [{ id: 'inbox', name: 'Inbox', inbox: true }, { id: 'p2', name: 'Home milk run', order: 2 }, { id: 'p1', name: 'Milk shop', order: 1 }],
  sections: [],
  labels: [{ id: 'l1', name: 'milk', order: 1 }, { id: 'l2', name: 'errand', order: 2 }],
  filters: [{ id: 'f1', name: 'Milk today', query: 'today', order: 1 }],
};

test('every word, any order, any case', () => {
  assert.deepEqual(wordsOf('  Oat  MILK '), ['oat', 'milk']);
  assert.ok(hasAll(['milk', 'oat'], 'Buy oat milk'));
  assert.ok(!hasAll(['milk', 'rice'], 'Buy oat milk'));
  assert.deepEqual(searchAll('milk OAT', data).tasks.map(t => t.id), ['a']);
});

test('a task: open only; a match in the title first, then in the description', () => {
  assert.deepEqual(searchAll('milk', data).tasks.map(t => t.id), ['a', 'b']);
});

test('accents don\'t matter either way', () => {
  assert.deepEqual(searchAll('cafe creme', data).tasks.map(t => t.id), ['d']);
  assert.deepEqual(searchAll('CAFÉ', data).tasks.map(t => t.id), ['d']);
});

test('projects (not the Inbox), labels and filters by name, in their order', () => {
  const r = searchAll('milk', data);
  assert.deepEqual([r.projects.map(p => p.id), r.labels.map(l => l.id), r.filters.map(f => f.id)], [['p1', 'p2'], ['l1'], ['f1']]);
  assert.deepEqual(searchAll('inbox', data).projects, []);
  assert.deepEqual(searchAll('   ', data), { tasks: [], projects: [], labels: [], filters: [] });
});

test('recent searches: newest first, no repeats, ten at most', () => {
  assert.deepEqual(remember(['milk', 'bank'], 'Bank'), ['Bank', 'milk']);
  assert.deepEqual(remember(['a'], '  '), ['a']);
  assert.equal(remember(Array.from({ length: 12 }, (_, i) => `s${i}`), 'new').length, 10);
});
