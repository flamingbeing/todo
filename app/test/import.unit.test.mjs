// import-map.js: one made-up sync answer (fixtures/import-sync.json) -> the records the app writes.
// node --test app/test/import.unit.test.mjs
process.env.TZ = 'Asia/Singapore';   // a fixed clock for the "Z" times (UTC+8, no daylight saving)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mapImport, dueFrom, durationFrom, labelName } from '../src/import-map.js';

const sync = JSON.parse(fs.readFileSync(new URL('./fixtures/import-sync.json', import.meta.url), 'utf8'));
const today = '2026-11-01';
const counter = () => { let n = 0; return () => `id${++n}`; };
const run = (data = sync, existing = undefined) => mapImport(data, { today, id: counter(), now: () => 1_000, existing });
const recs = (m, coll) => m.writes[coll].map(w => w.rec);
const named = (m, coll, key, value) => recs(m, coll).find(r => r[key] === value);
/** apply the writes to an empty account: what the app would hold after the import */
const applied = m => {
  const out = { tasks: [], projects: [], sections: [], labels: [], filters: [] };
  for (const c of Object.keys(out)) out[c] = m.writes[c].map(w => w.rec);
  return out;
};

test('counts: what imports, and what is left out', () => {
  const m = run();
  assert.deepEqual(m.counts, { projects: 3, sections: 3, labels: 3, tasks: 9, recurring: 4, filters: 2, skipped: 2, changed: m.counts.changed, history: 0 });
  assert.equal(m.counts.changed, 1 + 3 + 3 + 3 + 2 + 9);   // Inbox, projects, sections, labels, filters, tasks
});

test('the source Inbox is the app\'s Inbox, never a second one', () => {
  const m = run();
  const inbox = recs(m, 'projects').filter(p => p.id === 'inbox');
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].extId, 'p-inbox');
  assert.equal(inbox[0].inbox, true);
  assert.equal(recs(m, 'projects').filter(p => p.inbox).length, 1);
  assert.equal(named(m, 'tasks', 'title', 'Buy stamps').projectId, 'inbox');
  // an Inbox the app already has keeps its name and colour and only learns where it came from
  const have = { projects: [{ id: 'inbox', name: 'Inbox', color: 'blue', order: 0, inbox: true, createdAt: 5 }] };
  const again = run(sync, have);
  const merged = recs(again, 'projects').find(p => p.id === 'inbox');
  assert.deepEqual([merged.color, merged.extId, merged.createdAt], ['blue', 'p-inbox', 5]);
  assert.equal(recs(again, 'projects').filter(p => p.inbox).length, 1);
});

test('projects: colours by name (unknown: charcoal), board and calendar views, parents, favourites, order 1..n', () => {
  const m = run();
  const home = named(m, 'projects', 'name', 'Home'), garden = named(m, 'projects', 'name', 'Garden'), shed = named(m, 'projects', 'name', 'Shed');
  assert.deepEqual([home.color, garden.color, shed.color], ['berry_red', 'lime_green', 'charcoal']);
  assert.deepEqual([home.view, garden.view, shed.view], ['list', 'board', 'list']);
  assert.equal(shed.parentId, garden.id);
  assert.equal(home.parentId, null);
  assert.deepEqual([home.favorite, garden.favorite], [false, true]);
  assert.deepEqual([home.order, garden.order, shed.order], [1, 2, 1]);   // Home before Garden by child_order; Shed first in Garden
  assert.equal(shed.collapsed, true);
  assert.equal(named(m, 'projects', 'name', 'Old plans'), undefined);    // archived
  assert.equal(named(m, 'projects', 'name', 'Binned'), undefined);       // deleted
});

test('priority is inverted for 1 to 4', () => {
  const m = run();
  const p = title => named(m, 'tasks', 'title', title).priority;
  assert.deepEqual([p('Call the plumber'), p('Check the mailbox'), p('Water the ferns'), p('Buy stamps')], [1, 2, 3, 4]);
  assert.equal(p('Call the plumber'), 1);   // the source's 4 is our P1
  assert.equal(p('Buy stamps'), 4);         // the source's 1 is our P4
  assert.equal(mapImport({ items: [{ id: 'x', content: 'x', project_id: 'q', priority: 9 }], projects: [{ id: 'q', name: 'Q' }] }, { id: counter() }).writes.tasks[0].rec.priority, 1);
});

test('order: within a section and a parent, written 1..n; sections by section_order', () => {
  const m = run();
  const t = title => named(m, 'tasks', 'title', title);
  assert.deepEqual([t('Call the plumber').order, t('Buy stamps').order], [1, 2]);
  assert.deepEqual([t('Water the ferns').order, t('Check the mailbox').order], [1, 2]);
  assert.deepEqual([t('Empty the top one').order, t('Start with the left one').order], [1, 2]);
  assert.equal(t('Empty the top one').parentId, t('Sort the drawers').id);
  assert.equal(t('Sort the drawers').parentId, null);
  const s = name => named(m, 'sections', 'name', name);
  assert.deepEqual([s('Now').order, s('Later').order], [1, 2]);
  assert.equal(s('Now').projectId, named(m, 'projects', 'name', 'Home').id);
  assert.equal(s('Seeds').collapsed, true);
  assert.equal(s('Done with'), undefined);   // archived
  assert.equal(s('Deleted'), undefined);
  assert.equal(t('Water the ferns').sectionId, s('Now').id);
  // a parent comes before its children
  const titles = recs(m, 'tasks').map(r => r.title);
  assert.ok(titles.indexOf('Sort the drawers') < titles.indexOf('Empty the top one'));
});

test('labels: names become ids, in item_order, and a missing label is made', () => {
  const m = run();
  const calls = named(m, 'labels', 'name', 'calls'), errand = named(m, 'labels', 'name', 'errand');
  assert.deepEqual([calls.order, errand.order], [1, 2]);
  assert.deepEqual([calls.color, errand.color, errand.favorite], ['blue', 'orange', true]);
  assert.deepEqual(named(m, 'tasks', 'title', 'Buy stamps').labels, [errand.id]);
  const made = named(m, 'labels', 'name', 'urgent-now');   // "urgent#now" is not a name the rules accept
  assert.ok(made && made.color === 'charcoal');
  assert.deepEqual(named(m, 'tasks', 'title', 'Call the plumber').labels, [calls.id, made.id]);
  assert.equal(labelName('a/b @c'), 'a-b -c');
  // a label the app already has by name is reused, not doubled
  const again = run(sync, { labels: [{ id: 'mine', name: 'Calls', color: 'red', order: 7, createdAt: 3 }] });
  assert.equal(recs(again, 'labels').filter(l => l.name.toLowerCase() === 'calls').length, 1);
  assert.equal(named(again, 'tasks', 'title', 'Call the plumber').labels[0], 'mine');
});

test('due dates: a day, a floating time, a Z time on this device\'s clock', () => {
  assert.deepEqual(dueFrom('2026-11-05'), { date: '2026-11-05' });
  assert.deepEqual(dueFrom('2026-11-03T09:30:00'), { date: '2026-11-03', time: '09:30' });
  assert.deepEqual(dueFrom('2026-11-02T01:00:00Z'), { date: '2026-11-02', time: '09:00' });
  assert.deepEqual(dueFrom('2026-11-02T20:00:00Z'), { date: '2026-11-03', time: '04:00' });   // past midnight here
  assert.equal(dueFrom('nonsense'), null);
  assert.equal(dueFrom('2026-13-45'), null);
  const m = run();
  assert.deepEqual(named(m, 'tasks', 'title', 'Call the plumber').due, { date: '2026-11-03', time: '09:30' });
  assert.deepEqual(named(m, 'tasks', 'title', 'Buy stamps').due, { date: '2026-11-05' });
  assert.equal(named(m, 'tasks', 'title', 'Plant tulips').due, null);
});

test('repeating tasks keep their next date, and their words are read; words it can\'t read are listed', () => {
  const m = run();
  assert.deepEqual(named(m, 'tasks', 'title', 'Water the ferns').due, { date: '2026-11-04', rrule: 'FREQ=DAILY;INTERVAL=3', string: 'every 3 days' });
  assert.deepEqual(named(m, 'tasks', 'title', 'Check the mailbox').due,
    { date: '2026-11-02', time: '09:00', rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', string: 'every weekday at 9am' });
  const fromDone = named(m, 'tasks', 'title', 'Mow the shed roof').due;
  assert.deepEqual([fromDone.rrule, fromDone.fromDone, fromDone.date], ['FREQ=WEEKLY;BYDAY=FR', true, '2026-11-06']);
  assert.deepEqual(m.unparsed, [{ title: 'Sort the drawers', string: 'every blue moon' }]);
  assert.deepEqual(named(m, 'tasks', 'title', 'Sort the drawers').due, { date: '2026-11-09' });   // a plain dated task
  assert.equal(m.counts.recurring, 4);
});

test('a deadline, a description and the source id on every record', () => {
  const m = run();
  assert.equal(named(m, 'tasks', 'title', 'Water the ferns').deadline, '2026-12-01');
  assert.equal(named(m, 'tasks', 'title', 'Buy stamps').deadline, null);
  assert.equal(named(m, 'tasks', 'title', 'Buy stamps').description, 'From the post office');
  assert.equal(named(m, 'tasks', 'title', 'Call the plumber').description, null);
  assert.equal(named(m, 'tasks', 'title', 'Buy stamps').createdAt, Date.parse('2026-10-01T08:00:00Z'));
  for (const c of ['projects', 'sections', 'filters', 'tasks']) for (const r of recs(m, c)) assert.ok(r.extId, `${c} ${r.id}`);
  assert.equal(named(m, 'tasks', 'title', 'Buy stamps').extId, 't-b');
  for (const r of recs(m, 'tasks')) assert.ok(r.done === false && Array.isArray(r.labels) && r.id && r.title);
});

test('filters keep their name, query, colour, favourite and order', () => {
  const m = run();
  const odd = named(m, 'filters', 'name', 'Odd one'), big = named(m, 'filters', 'name', 'Soon and big');
  assert.deepEqual([odd.order, big.order], [1, 2]);
  assert.equal(odd.query, 'assigned to: me & !subtask');   // kept; the filter's own page says what this app can't read
  assert.deepEqual([odd.color, big.color, big.favorite, odd.favorite], ['grape', 'red', true, false]);
});

test('left out: deleted, completed and archived things, and a task in a project that is not imported', () => {
  const m = run();
  const titles = recs(m, 'tasks').map(r => r.title);
  for (const gone of ['Already finished', 'Thrown away', 'In an archived project']) assert.ok(!titles.includes(gone), gone);
  assert.equal(titles.length, 9);
  assert.equal(m.counts.skipped, 2);   // the finished one and the one in the archived project; deleted ones are not counted
});

test('a second import of the same answer changes nothing; a changed title updates the same record', () => {
  const first = run();
  const have = applied(first);
  const second = run(sync, have);
  assert.equal(second.counts.changed, 0);
  assert.equal(second.writes.tasks.length, 0);
  const edited = structuredClone(sync);
  edited.items.find(t => t.id === 't-b').content = 'Buy more stamps';
  edited.items.push({ id: 't-new', content: 'Fresh one', project_id: 'p-inbox', child_order: 3, priority: 1, labels: [] });
  const third = run(edited, have);
  assert.equal(third.writes.tasks.length, 2);
  const stamps = third.writes.tasks.find(w => w.rec.extId === 't-b');
  assert.equal(stamps.rec.title, 'Buy more stamps');
  assert.equal(stamps.rec.id, named(first, 'tasks', 'extId', 't-b').id);   // the same record
  assert.equal(stamps.base.title, 'Buy stamps');
  assert.equal(third.writes.tasks.find(w => w.rec.extId === 't-new').base, null);
  assert.equal(third.writes.projects.length + third.writes.sections.length + third.writes.labels.length + third.writes.filters.length, 0);
});

test('a re-import leaves what the person did here: done, and the day order', () => {
  const have = applied(run());
  const stamps = have.tasks.find(t => t.extId === 't-b');
  stamps.done = true; stamps.doneAt = 77; stamps.dayOrder = 4.5;
  const again = run(sync, have);
  assert.equal(again.writes.tasks.length, 0);
  const edited = structuredClone(sync);
  edited.items.find(t => t.id === 't-b').priority = 3;
  const w = run(edited, have).writes.tasks[0].rec;
  assert.deepEqual([w.priority, w.done, w.doneAt, w.dayOrder], [2, true, 77, 4.5]);
});

test('an empty or odd answer imports nothing and does not throw', () => {
  for (const x of [{}, null, { items: 5, projects: 'no' }]) {
    const m = mapImport(x, { id: counter() });
    assert.equal(m.counts.tasks, 0);
    assert.equal(m.counts.changed, 0);
  }
});

test('a subtask whose parent is left out stands on its own', () => {
  const m = mapImport({
    projects: [{ id: 'p', name: 'P' }],
    items: [{ id: 'a', content: 'Parent', project_id: 'p', checked: true, child_order: 1 }, { id: 'b', content: 'Child', project_id: 'p', parent_id: 'a', child_order: 1 }],
  }, { id: counter() });
  assert.equal(m.writes.tasks.length, 1);
  assert.equal(m.writes.tasks[0].rec.parentId, null);
});

test('a duration in minutes comes over (up to a day); one in days, or none, does not', () => {
  const m = run();
  assert.equal(named(m, 'tasks', 'title', 'Call the plumber').duration, 45);
  assert.equal(named(m, 'tasks', 'title', 'Buy stamps').duration, null);
  assert.equal(named(m, 'tasks', 'title', 'Plant tulips').duration, null);
  assert.equal(durationFrom({ amount: 2000, unit: 'minute' }), 1440);
  assert.equal(durationFrom({ amount: 0, unit: 'minute' }), null);
  assert.equal(durationFrom({ amount: 'x', unit: 'minute' }), null);
  assert.equal(durationFrom(null), null);
});

// ---- finished history (sync.completed)
const done = (extra = {}) => ({ id: 'c1', content: 'Filed taxes', project_id: 'p-work', section_id: null, completed_at: '2026-10-20T04:30:00.000000Z', added_at: '2026-10-01T00:00:00Z', priority: 4, labels: [], ...extra });
const withDone = (...items) => ({ ...sync, completed: items });
const projectId = sync.projects.find(p => !p.inbox_project && !p.is_deleted && !p.is_archived).id;

test('history: a finished task comes over as a completed task with its completion time, priority and project', () => {
  const m = run(withDone(done({ project_id: projectId, priority: 4 })));
  assert.equal(m.counts.history, 1);
  assert.equal(m.counts.tasks, 9, 'the open count is unchanged');
  const t = named(m, 'tasks', 'title', 'Filed taxes');
  assert.equal(t.done, true);
  assert.equal(t.doneAt, Date.parse('2026-10-20T04:30:00.000000Z'));
  assert.equal(t.priority, 1);
  assert.equal(t.projectId, recs(m, 'projects').find(p => p.extId === projectId).id);
  assert.equal(t.createdAt, Date.parse('2026-10-01T00:00:00Z'));
  assert.equal(t.due, null);
  assert.match(t.extId, /^done:c1:\d+$/);
});

test('history: the same finished tasks twice add nothing, and a new one adds only itself', () => {
  const first = run(withDone(done({ project_id: projectId }), done({ project_id: projectId, id: 'c2', content: 'Paid rent', completed_at: '2026-10-21T01:00:00Z' })));
  const after = {};
  for (const c of ['tasks', 'projects', 'sections', 'labels', 'filters']) after[c] = first.writes[c].map(w => w.rec);
  const again = run(withDone(done({ project_id: projectId }), done({ project_id: projectId, id: 'c2', content: 'Paid rent', completed_at: '2026-10-21T01:00:00Z' })), after);
  assert.equal(again.counts.changed, 0);
  const more = run(withDone(done({ project_id: projectId }), done({ project_id: projectId, id: 'c2', content: 'Paid rent', completed_at: '2026-10-21T01:00:00Z' }),
    done({ project_id: projectId, id: 'c3', content: 'Called bank', completed_at: '2026-10-22T01:00:00Z' })), after);
  assert.equal(more.counts.changed, 1);
  assert.equal(more.writes.tasks[0].rec.title, 'Called bank');
});

test('history: a repeating task finished many times is one completed task per finish, beside its open one', () => {
  const open = sync.items.find(t => !t.checked && !t.is_deleted && t.due?.is_recurring);
  const m = run(withDone(
    done({ id: open.id, content: open.content, project_id: open.project_id, completed_at: '2026-10-01T01:00:00Z' }),
    done({ id: open.id, content: open.content, project_id: open.project_id, completed_at: '2026-10-08T01:00:00Z' })));
  assert.equal(m.counts.history, 2);
  const mine = recs(m, 'tasks').filter(t => t.title === open.content.trim().replace(/\s+/g, ' '));
  assert.equal(mine.filter(t => t.done).length, 2);
  assert.equal(mine.filter(t => !t.done).length, 1, 'the open repeat is still open');
  assert.equal(new Set(mine.map(t => t.id)).size, 3);
});

test('history: a task an earlier import brought over open, finished at the source since, is updated in place', () => {
  const open = sync.items.find(t => !t.checked && !t.is_deleted && !t.due?.is_recurring && projectIdsOf(t));
  const first = run();
  const have = {}; for (const c of ['tasks', 'projects', 'sections', 'labels', 'filters']) have[c] = first.writes[c].map(w => w.rec);
  const was = have.tasks.find(t => t.extId === open.id);
  const answer = { ...sync, items: sync.items.filter(t => t.id !== open.id), completed: [done({ id: open.id, content: open.content, project_id: open.project_id, completed_at: '2026-10-25T03:00:00Z' })] };
  const m = run(answer, have);
  const t = recs(m, 'tasks').find(x => x.id === was.id);
  assert.ok(t, 'the same record');
  assert.equal(t.done, true); assert.equal(t.doneAt, Date.parse('2026-10-25T03:00:00Z')); assert.equal(t.extId, open.id);
  assert.equal(recs(m, 'tasks').filter(x => x.title === was.title).length, 1);
  // one the person already finished here keeps its own time
  const mine = have.tasks.map(x => (x.id === was.id ? { ...x, done: true, doneAt: 42 } : x));
  const kept = recs(run(answer, { ...have, tasks: mine }), 'tasks').find(x => x.id === was.id);
  assert.deepEqual([kept?.done, kept?.doneAt ?? 42], [true, 42]);
});
function projectIdsOf(t) { return !sync.projects.find(p => p.id === t.project_id)?.is_deleted; }

test('history: left out when bad (no time, no title, a project that is not imported); a done subtask links to its open parent', () => {
  const bad = [done({ id: 'x1', completed_at: 'nope' }), done({ id: 'x2', content: '  ' }), done({ id: 'x3', project_id: 'not-here' }), done({ id: 'x4', is_deleted: true }), null, 'x'];
  assert.equal(run(withDone(...bad)).counts.history, 0);
  const parent = sync.items.find(t => !t.checked && !t.is_deleted && !t.parent_id && projectIdsOf(t));
  const m = run(withDone(done({ id: 'sub1', content: 'Child', project_id: parent.project_id, parent_id: parent.id })));
  const kid = named(m, 'tasks', 'title', 'Child'), par = recs(m, 'tasks').find(t => t.extId === parent.id);
  assert.equal(kid.parentId, par.id);
  assert.equal(run({ ...sync, completed: 'oops' }).counts.history, 0);
});
