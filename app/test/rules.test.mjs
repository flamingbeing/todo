// The app's rules in the Firestore emulator: the rules kit's shared cases plus the app's own.
//   firebase emulators:exec --only firestore --project demo-todo "node --test app/test/rules.test.mjs"
// (from the repo root, after setup-tools or with .devkit/ copied from app-devkit)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { suite } from '../../.devkit/rules/suite.mjs';

// The optional modules' cases (app/test/rules/<module>.mjs, written by tools/add.mjs): each exports `collections`
// (more rows for the shared cases) and `tests({ test, assert, emu, as })`.
const dir = new URL('./rules/', import.meta.url);
const mods = existsSync(dir)
  ? await Promise.all(readdirSync(dir).filter(f => f.endsWith('.mjs')).sort().map(f => import(new URL(f, dir).href)))
  : [];

// one valid record of each of the app's collections (the shared cases write, read and list it)
const VALID = {
  tasks: { title: 'Buy milk', projectId: 'inbox', order: 1, priority: 4, done: false, updatedAt: 1 },
  projects: { name: 'Work', color: 'blue', order: 1, view: 'list', updatedAt: 1 },
  sections: { name: 'Admin', projectId: 'p1', order: 1, updatedAt: 1 },
  labels: { name: 'errand', color: 'green', order: 1, updatedAt: 1 },
  filters: { name: 'Urgent', query: 'p1 & today', color: 'red', order: 1, updatedAt: 1 },
};

const emu = suite({
  project: 'demo-todo',
  rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
  roles: ['admin', 'member', 'viewer'],
  collections: [
    ...Object.entries(VALID).map(([coll, data]) => ({ path: `spaces/_/${coll}/x1`, read: ['admin', 'member', 'viewer'], write: ['admin', 'member'],
      data, stamp: /** @type {'strict'} */ ('strict'), list: { roles: ['admin', 'member', 'viewer'] } })),
    ...mods.flatMap(m => m.collections ?? []),
  ],
});

const as = role => emu.as(`u-${role}`, { g: { _: role }, v: 1 });

test('people read their own role doc, not others’; nobody writes or deletes one from a page (the Worker does)', async () => {
  await emu.clear();
  await emu.seed('members/u-member', { role: 'member', v: 1 });
  await emu.seed('members/u-other', { role: 'member', v: 1 });
  assert.equal((await as('member').get('members/u-member')).ok, true);
  assert.equal((await emu.as('u-new', {}).get('members/u-new')).ok, true, 'no role yet: may still read (absent) own doc');
  assert.equal((await as('member').get('members/u-other')).ok, false);
  assert.equal((await as('member').set('members/u-member', { role: 'admin', v: 2 })).ok, false, 'no self-promotion');
  assert.equal((await as('admin').get('members/u-other')).ok, true, 'admins read every role doc');
  assert.equal((await as('admin').set('members/u-other', { role: 'viewer', v: 2 })).ok, false, 'role changes: /api/members/');
  assert.equal((await as('admin').set('members/u-new', { role: 'member', v: 1 })).ok, false);
  assert.equal((await as('admin').delete('members/u-other')).ok, false, 'removal: /api/members/ (it also revokes)');
  assert.equal((await as('member').delete('members/u-member')).ok, false);
});

const at = { serverAt: true };
/** each change of a valid record, saved by a member: whether the rules take it */
const cases = async (coll, rows, id = 'c') => {
  for (const [label, change, ok] of rows) {
    await emu.clear();
    const data = typeof change === 'function' ? change({ ...VALID[coll] }) : { ...VALID[coll], ...change };
    assert.equal((await as('member').set(`spaces/_/${coll}/${id}`, data, at)).ok, ok, `${coll}: ${label}`);
  }
};
const drop = k => d => { delete d[k]; return d; };

test('every collection: writers stamp a valid record; viewers and the unknown are refused; createdAt never changes', async () => {
  for (const [coll, data] of Object.entries(VALID)) {
    await emu.clear();
    const path = `spaces/_/${coll}/s`;
    assert.equal((await as('member').set(path, { ...data, createdAt: 1 }, at)).ok, true, `${coll}: valid create`);
    assert.equal((await as('member').set(path, { ...data, createdAt: 1, updatedAt: 2 }, at)).ok, true, `${coll}: member update`);
    assert.equal((await as('admin').set(path, { ...data, createdAt: 1, updatedAt: 3 }, at)).ok, true, `${coll}: admin update`);
    assert.equal((await as('member').set(path, { ...data, createdAt: 2 }, at)).ok, false, `${coll}: createdAt cannot change`);
    assert.equal((await as('member').set(path, { ...data, createdAt: 'x' }, at)).ok, false, `${coll}: createdAt is a number`);
    assert.equal((await as('member').set(path, { ...data, owner: 'me' }, at)).ok, false, `${coll}: an unknown field`);
    assert.equal((await as('member').set(path, data)).ok, false, `${coll}: unstamped`);
    assert.equal((await as('member').set(path, { ...data, _edits: 'x' }, at)).ok, false, `${coll}: _edits is a map`);
    assert.equal((await as('member').set(path, { ...data, _edits: { name: { by: 'Sam', at: 1 } } }, at)).ok, true, `${coll}: _edits`);
    assert.equal((await as('member').set(path, { ...data, updatedAt: 'x' }, at)).ok, false, `${coll}: updatedAt is a number`);
    assert.equal((await as('viewer').set(path, data, at)).ok, false, `${coll}: a viewer cannot write`);
    assert.equal((await as('viewer').get(path)).ok, true, `${coll}: a viewer reads`);
    assert.equal((await as('viewer').delete(path)).ok, false, `${coll}: a viewer cannot delete`);
    assert.equal((await emu.as('u-new', {}).get(path)).ok, false, `${coll}: no role, no read`);
    assert.equal((await as('member').delete(path)).ok, true, `${coll}: a member deletes`);
  }
});

test('tasks: title, description, ids, order, priority, labels, deadline and done are checked', () => cases('tasks', [
  ['every optional field', { description: 'a\nb', sectionId: 's1', parentId: 't0', dayOrder: 2, labels: ['errand'], deadline: '2026-11-30',
    collapsed: true, extId: '123', doneAt: null }, true],
  ['null clears the optional fields', { description: null, sectionId: null, parentId: null, labels: null, due: null, deadline: null, doneAt: null }, true],
  ['an empty title', { title: '' }, false],
  ['a title over 500', { title: 'x'.repeat(501) }, false],
  ['a title of 500', { title: 'x'.repeat(500) }, true],
  ['a title that is not text', { title: 5 }, false],
  ['no title', drop('title'), false],
  ['a description over 16000', { description: 'x'.repeat(16001) }, false],
  ['a description that is not text', { description: 5 }, false],
  ['no project', drop('projectId'), false],
  ['an empty project id', { projectId: '' }, false],
  ['a project id over 64', { projectId: 'x'.repeat(65) }, false],
  ['an empty section id', { sectionId: '' }, false],
  ['a parent id over 64', { parentId: 'x'.repeat(65) }, false],
  ['no order', drop('order'), false],
  ['an order that is not a number', { order: 'first' }, false],
  ['a dayOrder that is not a number', { dayOrder: 'x' }, false],
  ['priority 0', { priority: 0 }, false],
  ['priority 5', { priority: 5 }, false],
  ['priority 1', { priority: 1 }, true],
  ['a priority as text', { priority: '1' }, false],
  ['no priority', drop('priority'), false],
  ['labels that are not a list', { labels: 'errand' }, false],
  ['21 labels', { labels: Array.from({ length: 21 }, (_, i) => `l${i}`) }, false],
  ['20 labels', { labels: Array.from({ length: 20 }, (_, i) => `l${i}`) }, true],
  ['a deadline that is not a day', { deadline: '30/11/2026' }, false],
  ['collapsed as text', { collapsed: 'yes' }, false],
  ['done as text', { done: 'no' }, false],
  ['no done', drop('done'), false],
  ['done with doneAt', { done: true, doneAt: 5 }, true],
  ['doneAt as text', { doneAt: 'x' }, false],
  ['an extId over 64', { extId: 'x'.repeat(65) }, false],
]));

test('tasks: a due date is a map of a day, and optionally a time, a repeat, its words and fromDone', () => cases('tasks', [
  ['a day', { due: { date: '2026-11-01' } }, true],
  ['every part', { due: { date: '2026-11-01', time: '09:30', rrule: 'FREQ=WEEKLY;BYDAY=MO,FR', string: 'every mon, fri', fromDone: false } }, true],
  ['null parts', { due: { date: '2026-11-01', time: null, rrule: null, string: null, fromDone: null } }, true],
  ['a due day as text, not a map', { due: '2026-11-01' }, false],
  ['no day', { due: { time: '09:30' } }, false],
  ['a day as DD/MM/YYYY', { due: { date: '01/11/2026' } }, false],
  ['a time of 24:00', { due: { date: '2026-11-01', time: '24:00' } }, false],
  ['a time of 9:30', { due: { date: '2026-11-01', time: '9:30' } }, false],
  ['an unknown part', { due: { date: '2026-11-01', zone: 'SGT' } }, false],
  ['a repeat over 300', { due: { date: '2026-11-01', rrule: 'x'.repeat(301) } }, false],
  ['words over 200', { due: { date: '2026-11-01', string: 'x'.repeat(201) } }, false],
  ['fromDone as text', { due: { date: '2026-11-01', fromDone: 'yes' } }, false],
]));

test('projects: a name, a known colour, a view; only the inbox doc is the Inbox, and it is never deleted', async () => {
  await cases('projects', [
    ['every optional field', { parentId: 'p0', favorite: true, collapsed: false, extId: '9', inbox: false }, true],
    ['an empty name', { name: '' }, false],
    ['a name over 120', { name: 'x'.repeat(121) }, false],
    ['an unknown colour', { color: 'pink' }, false],
    ['no colour', drop('color'), false],
    ['a board', { view: 'board' }, true],
    ['an unknown view', { view: 'calendar' }, false],
    ['no order', drop('order'), false],
    ['favorite as text', { favorite: 'yes' }, false],
    ['inbox on another project', { inbox: true }, false],
    ['an empty parent id', { parentId: '' }, false],
  ]);
  await cases('projects', [['the Inbox', { name: 'Inbox', inbox: true, color: 'charcoal', order: 0 }, true]], 'inbox');
  await emu.clear();
  await emu.seed('spaces/_/projects/inbox', { name: 'Inbox', inbox: true, color: 'charcoal', order: 0, view: 'list', updatedAt: 1 });
  assert.equal((await as('member').delete('spaces/_/projects/inbox')).ok, false, 'the Inbox is never deleted');
  assert.equal((await as('admin').delete('spaces/_/projects/inbox')).ok, false);
});

test('sections: a name of 1 to 120 and a project', () => cases('sections', [
  ['collapsed', { collapsed: true }, true],
  ['an empty name', { name: '' }, false],
  ['a name over 120', { name: 'x'.repeat(121) }, false],
  ['no project', drop('projectId'), false],
  ['a project id over 64', { projectId: 'x'.repeat(65) }, false],
  ['an order as text', { order: '1' }, false],
  ['collapsed as text', { collapsed: 'no' }, false],
]));

test('labels: a name of 1 to 60 without # @ % or /, and a known colour', () => cases('labels', [
  ['a favourite', { favorite: true }, true],
  ['a name with spaces', { name: 'waiting on' }, true],
  ['an empty name', { name: '' }, false],
  ['a name over 60', { name: 'x'.repeat(61) }, false],
  ['a #', { name: 'a#b' }, false],
  ['an @', { name: '@home' }, false],
  ['a %', { name: '50%' }, false],
  ['a /', { name: 'a/b' }, false],
  ['an unknown colour', { color: '#ff0000' }, false],
  ['no order', drop('order'), false],
]));

test('filters: a name of 1 to 120, a query of 1 to 1000 and a known colour', () => cases('filters', [
  ['a favourite', { favorite: true }, true],
  ['an empty name', { name: '' }, false],
  ['a name over 120', { name: 'x'.repeat(121) }, false],
  ['an empty query', { query: '' }, false],
  ['a query over 1000', { query: 'x'.repeat(1001) }, false],
  ['no query', drop('query'), false],
  ['an unknown colour', { color: 'pink' }, false],
]));

test('bin entries: writers stamp them; viewers only read', async () => {
  await emu.clear();
  const entry = { id: 'a', kind: 'tasks', data: { title: 'ok' }, deletedAt: 2, updatedAt: 2 };
  assert.equal((await as('viewer').set('spaces/_/bin/tasks:a', entry, { serverAt: true })).ok, false);
  assert.equal((await as('member').set('spaces/_/bin/tasks:a', entry, { serverAt: true })).ok, true);
  assert.equal((await as('viewer').get('spaces/_/bin/tasks:a')).ok, true);
  assert.equal((await as('member').set('spaces/_/bin/tasks:b', entry)).ok, false, 'unstamped');
});

test('account options: one doc per person, only theirs, only the allowed fields', async () => {
  await emu.clear();
  const mine = { showCounts: true, updatedAt: 1 };
  for (const role of ['admin', 'member', 'viewer']) {
    assert.equal((await as(role).set(`spaces/_/settings/u-${role}`, mine, at)).ok, true, `${role} saves their own`);
    assert.equal((await as(role).get(`spaces/_/settings/u-${role}`)).ok, true);
  }
  assert.equal((await as('member').set('spaces/_/settings/u-admin', mine, at)).ok, false, 'not someone else’s doc');
  assert.equal((await as('member').get('spaces/_/settings/u-admin')).ok, true, 'the group can read it (a list listen cannot ask for one doc)');
  assert.equal((await emu.as('u-new', {}).get('spaces/_/settings/u-member')).ok, false, 'no role, no read');
  assert.equal((await emu.as('u-new', {}).set('spaces/_/settings/u-new', mine, at)).ok, false, 'no role, no access');
  assert.equal((await as('member').set('spaces/_/settings/u-member', mine)).ok, false, 'unstamped');
  assert.equal((await as('member').set('spaces/_/settings/u-member', { ...mine, other: 1 }, at)).ok, false, 'an option the app did not list');
  assert.equal((await as('member').set('spaces/_/settings/u-member', { showCounts: 'yes', updatedAt: 1 }, at)).ok, false, 'wrong type');
  assert.equal((await as('member').set('spaces/_/settings/u-member', { defaultList: 'l1', updatedAt: 1 }, at)).ok, false, 'the old list option is gone');
  assert.equal((await as('member').set('spaces/_/settings/u-member', { showCounts: null, profile: null, updatedAt: 2 }, at)).ok, true, 'null forgets a value');
});

for (const m of mods) m.tests?.({ test, assert, emu, as });
