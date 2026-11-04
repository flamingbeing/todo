// The wide list pages' pure parts (app/src/wide/list-parts.js): what an inline "Add task" starts quick add with, and the
// crumbs over a project's title. node --test app/test/wide-list.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { addPreset, crumbs, LIST_PAGES } from '../src/wide/list-parts.js';

test('addPreset: Today adds to the Inbox on that day; the Inbox to the Inbox; a project (and its section) to it', () => {
  assert.deepEqual(addPreset('today', { today: '2026-11-04', projectId: 'p1' }), { projectId: 'inbox', due: { date: '2026-11-04' } });
  assert.deepEqual(addPreset('inbox', { today: '2026-11-04', projectId: 'p1' }), { projectId: 'inbox' });
  assert.deepEqual(addPreset('project', { today: '2026-11-04', projectId: 'p1' }), { projectId: 'p1' });
  assert.deepEqual(addPreset('project', { today: '2026-11-04', projectId: 'p1', sectionId: 's1' }), { projectId: 'p1', sectionId: 's1' });
  assert.deepEqual(addPreset('project', { today: '2026-11-04' }), { projectId: 'inbox' });
});

test('crumbs: My Projects, then the parents from the top; none for the Inbox; a loop stops', () => {
  const projects = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', parentId: 'a' }, { id: 'c', name: 'C', parentId: 'b' }];
  assert.deepEqual(crumbs(projects, 'a'), ['My Projects']);
  assert.deepEqual(crumbs(projects, 'c'), ['My Projects', 'A', 'B']);
  assert.deepEqual(crumbs(projects, 'inbox'), []);
  assert.deepEqual(crumbs(projects, ''), []);
  assert.deepEqual(crumbs(projects, 'gone'), ['My Projects']);
  const loop = [{ id: 'x', name: 'X', parentId: 'y' }, { id: 'y', name: 'Y', parentId: 'x' }];
  assert.deepEqual(crumbs(loop, 'x'), ['My Projects', 'Y']);
});

test('the list pages that take the wide look', () => {
  assert.deepEqual(LIST_PAGES, ['today-page', 'inbox-page', 'project-page', 'place-page']);
});
