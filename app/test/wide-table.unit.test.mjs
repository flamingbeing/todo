// The table layout's and the wide Display card's pure parts (app/src/wide/table-parts.js). node --test app/test/wide-table.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, changedCount } from '../src/wide/table-parts.js';
import { cleanDisplay } from '../src/tasks.js';

test('the table: the task, then Date, Priority, Project and Labels', () => {
  assert.deepEqual(COLUMNS.map(c => c.label), ['Task', 'Date', 'Priority', 'Project', 'Labels']);
});

test('changedCount: the choices that are not the list\'s own (the button\'s "Display: n")', () => {
  const plain = cleanDisplay({}, 'today');
  assert.equal(changedCount(plain, plain), 0);
  assert.equal(changedCount(cleanDisplay({ layout: 'table' }, 'today'), plain), 1);
  assert.equal(changedCount(cleanDisplay({ layout: 'board', sort: 'name', dir: 'desc', priority: 2 }, 'today'), plain), 4);
  // Today groups by date of its own: date is no change there, none is
  assert.equal(changedCount(cleanDisplay({ group: 'date' }, 'today'), plain), 0);
  assert.equal(changedCount(cleanDisplay({ group: 'none' }, 'today'), plain), 1);
  assert.equal(changedCount(cleanDisplay({ group: 'date' }, 'inbox'), cleanDisplay({}, 'inbox')), 1);
});
