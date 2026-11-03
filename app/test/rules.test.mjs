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
  comments: { taskId: 't1', text: 'Called the shop', uid: 'u-member', name: 'Sam', updatedAt: 1 },
  templates: { name: 'Trip', color: 'blue', view: 'list', sections: ['Book'], tasks: [{ title: 'Passport', priority: 4, section: null, parent: null }], updatedAt: 1 },
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
  ['a label of 64', { labels: ['a', 'x'.repeat(64)] }, true],
  ['a label of 65', { labels: ['a', 'x'.repeat(65)] }, false],
  ['the 20th label too long', { labels: [...Array.from({ length: 19 }, (_, i) => `l${i}`), 'x'.repeat(65)] }, false],
  ['a label that is not text', { labels: ['a', 7] }, false],
  ['an empty label', { labels: [''] }, false],
  ['no labels', { labels: [] }, true],
  ['20 labels of 64', { labels: Array.from({ length: 20 }, (_, i) => `${i}`.padEnd(64, 'x')) }, true],
  ['a deadline that is not a day', { deadline: '30/11/2026' }, false],
  ['reminders at the time and before', { reminders: [0, 30, 1440] }, true],
  ['five reminders', { reminders: [0, 5, 10, 15, 30] }, true],
  ['six reminders', { reminders: [0, 5, 10, 15, 30, 60] }, false],
  ['no reminders', { reminders: [] }, true],
  ['null clears reminders', { reminders: null }, true],
  ['a negative reminder', { reminders: [-5] }, false],
  ['a reminder over four weeks', { reminders: [40321] }, false],
  ['a reminder of four weeks', { reminders: [40320] }, true],
  ['a fractional reminder', { reminders: [2.5] }, false],
  ['a reminder as text', { reminders: ['30'] }, false],
  ['the 5th reminder bad', { reminders: [0, 1, 2, 3, -1] }, false],
  ['reminders that are not a list', { reminders: 30 }, false],
  ['collapsed as text', { collapsed: 'yes' }, false],
  ['done as text', { done: 'no' }, false],
  ['no done', drop('done'), false],
  ['done with doneAt', { done: true, doneAt: 5 }, true],
  ['doneAt as text', { doneAt: 'x' }, false],
  ['an extId over 64', { extId: 'x'.repeat(65) }, false],
]));

test('tasks: a duration is whole minutes from 1 to 1440, or null', () => cases('tasks', [
  ['30 minutes', { duration: 30 }, true],
  ['a whole day', { duration: 1440 }, true],
  ['null clears it', { duration: null }, true],
  ['0 minutes', { duration: 0 }, false],
  ['1441 minutes', { duration: 1441 }, false],
  ['2.5 minutes', { duration: 2.5 }, false],
  ['as text', { duration: '30' }, false],
]));
test('tasks: a duration changes on an update, and null clears it', async () => {
  await emu.clear();
  const path = 'spaces/_/tasks/d', base = { ...VALID.tasks, createdAt: 1 };
  assert.equal((await as('member').set(path, { ...base, duration: 30 }, at)).ok, true, 'create with 30');
  assert.equal((await as('member').set(path, { ...base, duration: 1440, updatedAt: 2 }, at)).ok, true, 'update to 1440');
  assert.equal((await as('member').set(path, { ...base, duration: null, updatedAt: 3 }, at)).ok, true, 'update to null');
  assert.equal((await as('member').set(path, { ...base, duration: 0, updatedAt: 4 }, at)).ok, false, 'update to 0');
});

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

test('comments: text of 1 to 2000, a task and an author; the author and the task never change; only the author or an admin edits or deletes', async () => {
  await cases('comments', [
    ['no name', drop('name'), true],
    ['a null name', { name: null }, true],
    ['a name over 120', { name: 'x'.repeat(121) }, false],
    ['text of 2000', { text: 'x'.repeat(2000) }, true],
    ['text of 2001', { text: 'x'.repeat(2001) }, false],
    ['empty text', { text: '' }, false],
    ['no text', drop('text'), false],
    ['text that is not text', { text: 5 }, false],
    ['no task', drop('taskId'), false],
    ['a task id over 64', { taskId: 'x'.repeat(65) }, false],
    ['no author', drop('uid'), false],
    ['an author that is not the writer', { uid: 'u-other' }, false],
    ['an attachment field', { file: 'a.png' }, false],
  ]);
  await emu.clear();
  const path = 'spaces/_/comments/k', base = { ...VALID.comments, createdAt: 1 };
  await emu.seed(path, base);
  assert.equal((await as('member').set(path, { ...base, text: 'edited', updatedAt: 2 }, at)).ok, true, 'the author edits');
  assert.equal((await emu.as('u-other', { g: { _: 'member' }, v: 1 }).set(path, { ...base, text: 'mine now', updatedAt: 2 }, at)).ok, false, 'another member cannot edit');
  assert.equal((await as('admin').set(path, { ...base, text: 'moderated', updatedAt: 2 }, at)).ok, true, 'an admin can');
  assert.equal((await as('member').set(path, { ...base, taskId: 't2', updatedAt: 3 }, at)).ok, false, 'it stays on its task');
  assert.equal((await as('member').set(path, { ...base, uid: 'u-other', updatedAt: 3 }, at)).ok, false, 'it keeps its author');
  assert.equal((await as('viewer').set(path, { ...base, text: 'x', updatedAt: 4 }, at)).ok, false, 'a viewer cannot edit');
  assert.equal((await emu.as('u-other', { g: { _: 'member' }, v: 1 }).delete(path)).ok, false, 'another member cannot delete');
  assert.equal((await as('viewer').delete(path)).ok, false, 'a viewer cannot delete');
  assert.equal((await as('member').delete(path)).ok, true, 'the author deletes');
  await emu.seed(path, base);
  assert.equal((await as('admin').delete(path)).ok, true, 'an admin deletes');
});

test('templates: a name, a colour, a view, up to 50 sections and 300 tasks; no stray fields; viewers only read', () => cases('templates', [
  ['a board', { view: 'board' }, true],
  ['no sections or tasks', { sections: [], tasks: [] }, true],
  ['300 tasks', { tasks: Array.from({ length: 300 }, (_, i) => ({ title: `t${i}`, priority: 4 })) }, true],
  ['301 tasks', { tasks: Array.from({ length: 301 }, (_, i) => ({ title: `t${i}`, priority: 4 })) }, false],
  ['50 sections', { sections: Array.from({ length: 50 }, (_, i) => `s${i}`) }, true],
  ['51 sections', { sections: Array.from({ length: 51 }, (_, i) => `s${i}`) }, false],
  ['sections that are not a list', { sections: 'Book' }, false],
  ['tasks that are not a list', { tasks: {} }, false],
  ['an empty name', { name: '' }, false],
  ['a name over 120', { name: 'x'.repeat(121) }, false],
  ['an unknown colour', { color: 'neon' }, false],
  ['an unknown view', { view: 'grid' }, false],
  ['a due date field', { due: '2026-11-05' }, false],
  ['an attachment field', { file: 'a.png' }, false],
]));

test('sections: a name of 1 to 120, a project and an optional description of up to 2000', () => cases('sections', [
  ['collapsed', { collapsed: true }, true],
  ['a description of 2000', { description: 'x'.repeat(2000) }, true],
  ['a description of 2001', { description: 'x'.repeat(2001) }, false],
  ['a description that is a number', { description: 7 }, false],
  ['a null description', { description: null }, true],
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

test('Web Push’s devices and queue are the Worker’s alone: no page reads or writes them', async () => {
  await emu.clear();
  await emu.seed('pushSubs/u-member/devices/d1', { endpoint: 'https://web.push.apple.com/x', p256dh: 'p', auth: 'a', createdAt: 1 });
  await emu.seed('pushDevices/d1', { uid: 'u-member' });
  await emu.seed('pushQueue/u-member_1', { uid: 'u-member', key: 'k', at: 1, title: 't', body: 'b', taskId: 'x' });
  for (const role of ['admin', 'member', 'viewer']) {
    assert.equal((await as(role).get('pushSubs/u-member/devices/d1')).ok, false, `${role} reads a device`);
    assert.equal((await as(role).set(`pushSubs/u-${role}/devices/d2`, { endpoint: 'https://x', p256dh: 'p', auth: 'a', createdAt: 1 })).ok, false, `${role} writes a device`);
    assert.equal((await as(role).get('pushDevices/d1')).ok, false, `${role} reads a device owner`);
    assert.equal((await as(role).set('pushDevices/d2', { uid: `u-${role}` })).ok, false, `${role} writes a device owner`);
    assert.equal((await as(role).get('pushQueue/u-member_1')).ok, false, `${role} reads the queue`);
    assert.equal((await as(role).set(`pushQueue/u-${role}_2`, { uid: `u-${role}`, key: 'k', at: 1, title: 't', body: 'b', taskId: 'x' })).ok, false, `${role} writes the queue`);
    assert.equal((await as(role).delete('pushQueue/u-member_1')).ok, false, `${role} deletes from the queue`);
  }
});

test('account options: one doc per person, only theirs, only the allowed fields', async () => {
  await emu.clear();
  const mine = { profile: 'p1', updatedAt: 1 };
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
  assert.equal((await as('member').set('spaces/_/settings/u-member', { profile: 7, updatedAt: 1 }, at)).ok, false, 'wrong type');
  // (an older version's doc still holds defaultList and showCounts, now per device: saving other options to it must go on working)
  await emu.seed('spaces/_/settings/u-member', { defaultList: 'l1', showCounts: false, updatedAt: 1 });
  assert.equal((await as('member').update('spaces/_/settings/u-member', { profile: 'p2', updatedAt: 2 }, at)).ok, true, 'a doc with the old options still saves');
  assert.equal((await as('member').set('spaces/_/settings/u-member', { showCounts: 'yes', updatedAt: 3 }, at)).ok, false, 'the old option, checked as before');
  assert.equal((await as('member').set('spaces/_/settings/u-member', { defaultList: 'x'.repeat(65), updatedAt: 3 }, at)).ok, false, 'the old option, checked as before');
  assert.equal((await as('member').set('spaces/_/settings/u-member', { showCounts: null, profile: null, updatedAt: 4 }, at)).ok, true, 'null forgets a value');
});

for (const m of mods) m.tests?.({ test, assert, emu, as });
