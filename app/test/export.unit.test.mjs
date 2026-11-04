// export-map.js: the app's records -> Sync API commands (made-up data only).
// node --test app/test/export.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapExport, dueArg, batches, prepare, readAnswer, BATCH } from '../src/export-map.js';

const counter = () => { let n = 0; return () => `t${++n}`; };
const data = () => ({
  projects: [
    { id: 'inbox', name: 'Inbox', color: 'charcoal', order: 0, inbox: true },
    { id: 'p1', name: 'Home', color: 'blue', order: 1, view: 'list', favorite: true },
    { id: 'p2', name: 'Shed', color: 'nonsense', order: 2, parentId: 'p1', view: 'board' },
    { id: 'p0', name: 'Child first', color: 'red', order: 1, parentId: 'p1' },
  ],
  sections: [{ id: 's1', name: 'Now', projectId: 'p1', order: 1 }, { id: 's2', name: 'In inbox', projectId: 'inbox', order: 1 }],
  labels: [{ id: 'l1', name: 'errand', color: 'green', order: 1 }, { id: 'l2', name: 'Phone', color: 'red', order: 2, favorite: true }],
  tasks: [
    { id: 'k2', title: 'Sub task', projectId: 'p1', sectionId: 's1', parentId: 'k1', order: 1, priority: 2, done: false },
    { id: 'k1', title: 'Top task', description: 'notes', projectId: 'p1', sectionId: 's1', order: 1, priority: 1, labels: ['l1', 'l2', 'gone'], done: false, deadline: '2099-12-01' },
    { id: 'k3', title: 'Water ferns', projectId: 'p1', order: 2, priority: 4, done: false, due: { date: '2099-11-04', rrule: 'FREQ=DAILY;INTERVAL=3', string: 'every 3 days' } },
    { id: 'k4', title: 'Meet', projectId: 'inbox', sectionId: 's2', order: 1, priority: 3, done: false, due: { date: '2099-11-05', time: '09:30' }, duration: 45 },
    { id: 'k5', title: 'Finished', projectId: 'p1', order: 3, priority: 4, done: true },
    { id: 'k6', title: 'Orphan child', projectId: 'p1', parentId: 'k5', order: 4, priority: 4, done: false },
    { id: 'k7', title: 'Lost', projectId: 'nowhere', order: 1, priority: 4, done: false },
    { id: 'k8', title: 'Deleted', projectId: 'p1', order: 9, priority: 4, done: false, _deleted: true },
  ],
});
const run = (d = data(), o = {}) => mapExport(d, { inboxId: 'REAL-INBOX', id: counter(), ...o });
const of = (m, type) => m.commands.filter(c => c.type === type);
const task = (m, title) => of(m, 'item_add').find(c => c.args.content === title);

test('counts: open tasks only, the Inbox is not a project', () => {
  const m = run();
  assert.deepEqual(m.counts, { projects: 3, sections: 2, labels: 2, tasks: 5, skippedLabels: 0, skippedTasks: 1 });
  assert.deepEqual(m.commands.map(c => c.type).filter((t, i, a) => a.indexOf(t) === i), ['project_add', 'section_add', 'label_add', 'item_add']);
  assert.equal(task(m, 'Finished'), undefined);
  assert.equal(task(m, 'Lost'), undefined);
  assert.equal(task(m, 'Deleted'), undefined);
});

test('projects: parents link by temp id, colour, view, favourite, order', () => {
  const m = run();
  const home = of(m, 'project_add').find(c => c.args.name === 'Home'), shed = of(m, 'project_add').find(c => c.args.name === 'Shed');
  assert.equal(home.args.parent_id, undefined);
  assert.equal(home.args.color, 'blue');
  assert.equal(home.args.is_favorite, true);
  assert.equal(home.args.view_style, 'list');
  assert.equal(shed.args.parent_id, home.temp_id);
  assert.deepEqual(shed.deps, [home.temp_id]);
  assert.equal(shed.args.view_style, 'board');
  assert.equal(shed.args.color, undefined);   // an unknown colour is left to the default
  assert.ok(m.commands.indexOf(home) < m.commands.indexOf(shed));
  assert.deepEqual([of(m, 'project_add').find(c => c.args.name === 'Child first').args.child_order, shed.args.child_order], [0, 1]);
});

test('the Inbox maps to the account\'s own Inbox', () => {
  const m = run();
  assert.equal(of(m, 'project_add').some(c => c.args.name === 'Inbox'), false);
  assert.equal(task(m, 'Meet').args.project_id, 'REAL-INBOX');
  assert.equal(of(m, 'section_add').find(c => c.args.name === 'In inbox').args.project_id, 'REAL-INBOX');
  assert.deepEqual(task(m, 'Meet').deps.filter(d => d === 'REAL-INBOX'), []);
});

test('tasks: priority inverted back, parents first, sections, labels by name, deadline, order', () => {
  const m = run();
  const top = task(m, 'Top task'), sub = task(m, 'Sub task');
  assert.equal(top.args.priority, 4);   // the app's 1 is the API's 4
  assert.equal(sub.args.priority, 3);
  assert.equal(task(m, 'Water ferns').args.priority, 1);
  assert.equal(sub.args.parent_id, top.temp_id);
  assert.ok(m.commands.indexOf(top) < m.commands.indexOf(sub));
  assert.equal(top.args.section_id, of(m, 'section_add')[0].temp_id);
  assert.equal(sub.args.section_id, top.args.section_id);
  assert.deepEqual(top.args.labels, ['errand', 'Phone']);
  assert.equal(top.args.description, 'notes');
  assert.deepEqual(top.args.deadline, { date: '2099-12-01' });
  assert.equal(top.args.child_order, 0);
  assert.equal(task(m, 'Water ferns').args.child_order, 0);   // first in its own section-less group
  assert.equal(task(m, 'Orphan child').args.parent_id, undefined);   // its parent is finished
  assert.equal(task(m, 'Sub task').args.child_order, 0);
});

test('due: a repeat sends its words, a time is floating, a day is a day, duration needs a time', () => {
  const m = run();
  assert.deepEqual(task(m, 'Water ferns').args.due, { string: 'every 3 days' });
  assert.deepEqual(task(m, 'Meet').args.due, { date: '2099-11-05T09:30:00' });
  assert.deepEqual(task(m, 'Meet').args.duration, { amount: 45, unit: 'minute' });
  assert.equal(task(m, 'Top task').args.due, undefined);
  assert.deepEqual(dueArg({ date: '2099-11-04' }), { date: '2099-11-04' });
  assert.deepEqual(dueArg({ date: '2099-11-04', string: 'tomorrow' }), { date: '2099-11-04' });   // words only for a repeat
  assert.equal(dueArg({ date: '2099-13-45' }), null);
  assert.equal(dueArg(null), null);
});

test('labels the account has already are skipped (any case)', () => {
  const m = run(data(), { labelNames: ['ERRAND'] });
  assert.deepEqual(of(m, 'label_add').map(c => c.args.name), ['Phone']);
  assert.equal(m.counts.skippedLabels, 1);
  assert.deepEqual(task(m, 'Top task').args.labels, ['errand', 'Phone']);   // tasks still name it
});

test('every command has its own uuid; nothing private-looking leaks tokens', () => {
  const m = run(data(), { id: undefined });
  assert.equal(new Set(m.commands.map(c => c.uuid)).size, m.commands.length);
  assert.ok(m.commands.every(c => /^[0-9a-f-]{36}$/.test(c.uuid)));
});

test('batches of at most 100, in order', () => {
  const list = Array.from({ length: 250 }, (_, i) => ({ type: 'item_add', uuid: `u${i}`, args: {}, deps: [], what: '' }));
  const b = batches(list);
  assert.deepEqual(b.map(x => x.length), [100, 100, 50]);
  assert.equal(BATCH, 100);
  assert.equal(b[1][0].uuid, 'u100');
});

test('prepare / readAnswer: real ids replace temp ids, failures skip their children', () => {
  const m = run();
  const [b1] = batches(m.commands, 2);   // the first two commands: Home and Child first
  const mapping = new Map(), failed = new Map();
  const first = prepare(b1, mapping, failed);
  assert.equal(first.send.length, 2);
  const home = b1.find(c => c.args.name === 'Home');
  const answer = { sync_status: Object.fromEntries(b1.map(c => [c.uuid, c === home ? { error_code: 15, error: 'Invalid argument value' } : 'ok'])), temp_id_mapping: { [b1.find(c => c.args.name === 'Child first').temp_id]: 'R1' } };
  const read = readAnswer(first.send, answer, mapping, failed);
  assert.equal(read.ok, 1);
  assert.deepEqual(read.failures.map(f => [f.command.what, f.reason]), [['project Home', 'Invalid argument value']]);
  assert.equal(mapping.get(b1.find(c => c.args.name === 'Child first').temp_id), 'R1');
  // the rest: Shed needs Home, which failed
  const next = prepare(m.commands.slice(2), mapping, failed);
  assert.ok(next.skipped.some(s => s.command.what === 'project Shed'));
  assert.ok(next.skipped.some(s => s.command.what === 'task Top task'));   // its project failed
  assert.ok(next.send.some(c => c.what === 'task Meet'));   // the Inbox's tasks go on
  // a missing answer counts as failed
  const lost = readAnswer([b1[0]], {}, new Map(), new Map());
  assert.equal(lost.failures[0].reason, 'the server did not answer for it');
});

test('a mapped id is swapped into later requests', () => {
  const m = run();
  const home = of(m, 'project_add').find(c => c.args.name === 'Home');
  const mapping = new Map([[home.temp_id, 'REAL-HOME']]);
  const { send } = prepare([task(m, 'Water ferns')], mapping, new Map());
  assert.equal(send[0].args.project_id, 'REAL-HOME');
  assert.equal(task(m, 'Water ferns').args.project_id, home.temp_id);   // the plan itself is not changed
});
