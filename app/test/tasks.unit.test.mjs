// tasks.js, arrange.js and task-ops.js: what each list shows, the counts and cascades, and what a save stores.
// node --test app/test/tasks.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { projectView, todayView, placeText, projectCascade, sectionCascade, cleanFields, cleanDue, isTask, dayOrder, labelsOf, cleanDisplay,
  plainDisplay } from '../src/tasks.js';
import { upcomingView, completedView, projectTree, projectCounts, todayCount, upcomingCount, narrowTasks, sorter, groupTasks } from '../src/arrange.js';
import { rescheduled } from '../src/recur.js';
import { taskOps, refusal, tasksGone } from '../src/task-ops.js';

const T = '2026-11-01';
let n = 0;
const t = (id, o = {}) => ({ id, title: id, projectId: 'inbox', order: ++n, priority: 4, done: false, ...o });
const ids = lines => lines.map(l => l.task.id);

test('a project page: loose tasks first, then each section in order; subtasks under their parent; done ones hidden', () => {
  const sections = [{ id: 's2', name: 'Later', projectId: 'p', order: 2 }, { id: 's1', name: 'Now', projectId: 'p', order: 1 },
    { id: 'sx', name: 'Elsewhere', projectId: 'q', order: 1 }];
  const tasks = [t('a', { projectId: 'p', collapsed: false }), t('b', { projectId: 'p', sectionId: 's1' }), t('c', { projectId: 'p', sectionId: 's2' }),
    t('a1', { projectId: 'p', parentId: 'a' }), t('a2', { projectId: 'p', parentId: 'a', done: true }), t('d', { projectId: 'p', done: true }),
    t('e', { projectId: 'p', sectionId: 'gone' }), t('orphan', { projectId: 'p', parentId: 'missing' }), t('x', { projectId: 'q' }),
    { id: 'old', text: 'an older record' }];
  const v = projectView(tasks, sections, 'p');
  assert.deepEqual(ids(v.loose), ['a', 'a1', 'e', 'orphan'], 'a task in a deleted section is loose');
  assert.deepEqual(v.loose.map(l => l.depth), [0, 1, 0, 0]);
  assert.deepEqual([v.loose[0].kids, v.loose[0].doneKids], [2, 1], '"1/2"');
  assert.deepEqual(v.sections.map(s => s.section.id), ['s1', 's2']);
  assert.deepEqual(v.sections.map(s => ids(s.lines)), [['b'], ['c']]);
  assert.deepEqual(ids(projectView(tasks.map(x => (x.id === 'a' ? { ...x, collapsed: null } : x)), sections, 'p').loose), ['a', 'e', 'orphan'], 'a parent starts folded');
  const folded = projectView([t('f', { projectId: 'p', collapsed: true }), t('f1', { projectId: 'p', parentId: 'f' })], [], 'p');
  assert.deepEqual(ids(folded.loose), ['f'], 'a collapsed parent hides its subtasks');
  assert.equal(folded.loose[0].kids, 1);
});

test('Today: overdue first, then today; timed before untimed, then by priority; subtasks with their own date show alone', () => {
  const tasks = [t('late', { due: { date: '2026-10-30' } }), t('p1', { due: { date: T }, priority: 1 }), t('p4', { due: { date: T } }),
    t('nine', { due: { date: T, time: '09:00' } }), t('eight', { due: { date: T, time: '08:00' } }), t('later', { due: { date: '2026-11-02' } }),
    t('none'), t('done', { due: { date: T }, done: true }), t('sub', { due: { date: T }, parentId: 'p1' }), t('bad', { due: { date: 'x' } })];
  const v = todayView(tasks, T);
  assert.deepEqual(ids(v.overdue), ['late']);
  assert.deepEqual(ids(v.today), ['eight', 'nine', 'p1', 'p4', 'sub']);
  assert.ok(v.today.every(l => l.depth === 0));
  assert.equal(v.today.find(l => l.task.id === 'p1')?.kids, 1);
  assert.equal(todayCount(tasks, T), 6);
  assert.equal(upcomingCount(tasks, T), 1);
  assert.ok(dayOrder(t('a', { due: { date: '2026-11-01' } }), t('b', { due: { date: '2026-11-02' } })) < 0);
});

test('Upcoming: overdue, then every day from today, empty days included', () => {
  const tasks = [t('late', { due: { date: '2026-10-01' } }), t('today', { due: { date: T } }), t('third', { due: { date: '2026-11-03' } }),
    t('far', { due: { date: '2026-12-31' } })];
  const v = upcomingView(tasks, T, 28);
  assert.deepEqual(ids(v.overdue), ['late']);
  assert.equal(v.days.length, 28);
  assert.equal(v.days[0].key, T);
  assert.equal(v.days[27].key, '2026-11-28');
  assert.deepEqual(ids(v.days[0].lines), ['today']);
  assert.deepEqual(ids(v.days[1].lines), [], 'an empty day still shows');
  assert.deepEqual(ids(v.days[2].lines), ['third']);
});

test('Upcoming with done tasks: under their day after the open ones, never under Overdue', () => {
  const tasks = [t('late', { due: { date: '2026-10-01' }, done: true }), t('d', { due: { date: T }, done: true }), t('o', { due: { date: T } })];
  const v = upcomingView(tasks, T, 3, undefined, true);
  assert.deepEqual(ids(v.overdue), []);
  assert.deepEqual(ids(v.days[0].lines), ['o', 'd']);
  assert.deepEqual(ids(upcomingView(tasks, T, 3).days[0].lines), ['o']);
});

test('Completed: newest first, by the day they were done', () => {
  const at = (d, h) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00`).getTime();
  const g = completedView([t('a', { done: true, doneAt: at('2026-10-31', 9) }), t('b', { done: true, doneAt: at('2026-11-01', 8) }),
    t('c', { done: true, doneAt: at('2026-11-01', 10) }), t('open'), t('unknown', { done: true })]);
  assert.deepEqual(g.map(x => x.key), ['2026-11-01', '2026-10-31', '']);
  assert.deepEqual(g[0].tasks.map(x => x.id), ['c', 'b']);
});

test('the projects tree: not the Inbox, sub-projects under their parent, a folded parent hides them; counts', () => {
  const projects = [{ id: 'inbox', name: 'Inbox', inbox: true, order: 0 }, { id: 'b', name: 'B', order: 2 }, { id: 'a', name: 'A', order: 1 },
    { id: 'a1', name: 'A1', parentId: 'a', order: 1 }, { id: 'b1', name: 'B1', parentId: 'b', order: 1 }, { id: 'lost', name: 'Lost', parentId: 'gone', order: 3 }];
  const tree = projectTree(projects.map(p => (p.id === 'b' ? { ...p, collapsed: true } : p)));
  assert.deepEqual(tree.map(x => [x.project.id, x.depth, x.kids]), [['a', 0, 1], ['a1', 1, 0], ['b', 0, 1], ['lost', 0, 0]]);
  const counts = projectCounts([t('x'), t('y', { projectId: 'a' }), t('z', { projectId: 'a', done: true }), t('w', { projectId: '' })]);
  assert.equal(counts.get('inbox'), 2, 'a task with no project is in the Inbox');
  assert.equal(counts.get('a'), 1);
});

test('where a task is, in words; the cascades a delete takes', () => {
  const projects = [{ id: 'w', name: 'Work', order: 1 }, { id: 'w2', name: 'Sub', parentId: 'w', order: 1 }, { id: 'h', name: 'Home', order: 2 }];
  const sections = [{ id: 's', name: 'Admin', projectId: 'w', order: 1 }, { id: 's2', name: 'Deep', projectId: 'w2', order: 1 }];
  assert.equal(placeText(t('a'), projects, sections), 'Inbox');
  assert.equal(placeText(t('a', { projectId: 'w' }), projects, sections), 'Work');
  assert.equal(placeText(t('a', { projectId: 'w', sectionId: 's' }), projects, sections), 'Work / Admin');
  const tasks = [t('a', { projectId: 'w' }), t('b', { projectId: 'w2' }), t('c', { projectId: 'h' })];
  const c = projectCascade('w', projects, sections, tasks);
  assert.deepEqual([c.projects.map(p => p.id), c.sections.map(s => s.id), c.tasks.map(x => x.id)], [['w', 'w2'], ['s', 's2'], ['a', 'b']]);
  const inSection = [t('p', { sectionId: 's' }), t('p1', { parentId: 'p', sectionId: 's' }), t('p11', { parentId: 'p1' }), t('q')];
  assert.deepEqual(sectionCascade('s', inSection).map(x => x.id).sort(), ['p', 'p1', 'p11']);
});

test('what a save stores: trimmed text, a priority of 1 to 4, a due map of known parts, empty ids as null', () => {
  assert.deepEqual(cleanFields({ title: '  milk  and  eggs ', priority: 0 }), { title: 'milk and eggs', priority: 4 });
  assert.equal(cleanFields({ title: 'x'.repeat(600) }).title?.length, 500);
  assert.deepEqual([30, 2000, 0, null, 12.6].map(n => cleanFields({ duration: n }).duration), [30, 1440, null, null, 13]);
  assert.deepEqual(cleanFields({ priority: 2, sectionId: '', parentId: undefined, projectId: '' }), { priority: 2, sectionId: null, projectId: 'inbox' });
  assert.deepEqual(cleanDue({ date: T, time: '25:00', rrule: '', zone: 'x' }), { date: T });
  assert.deepEqual(cleanDue({ date: T, time: '09:30', rrule: 'FREQ=DAILY', fromDone: true }), { date: T, time: '09:30', rrule: 'FREQ=DAILY', fromDone: true });
  assert.equal(cleanDue({ date: '1/11/2026' }), null);
  assert.deepEqual(cleanFields({ labels: ['a', 'a', '', 'b'] }).labels, ['a', 'b']);
  assert.equal(cleanFields({ description: '' }).description, null);
  assert.equal(isTask({ id: 'x', text: 'old' }), false);
});

/** taskOps over an in-memory store */
const store = (init = {}) => {
  const data = { tasks: [], projects: [], sections: [], labels: [], filters: [], ...init };
  const saves = [], dropped = [];
  let k = 0;
  const ops = taskOps({
    id: () => `n${++k}`, now: () => 1000, data: () => data,
    drop: (coll, list) => dropped.push([coll, ...list]),
    save: async (coll, rec) => {
      saves.push([coll, rec]);
      const key = coll, list = data[key];
      const i = list.findIndex(x => x.id === rec.id);
      if (rec._deleted) { if (i >= 0) list.splice(i, 1); } else if (i >= 0) list[i] = rec; else list.push(rec);
    },
  });
  return { ops, data, saves, dropped };
};

test('add: Inbox and priority 4 by default, at the end of its siblings; no title is refused', async () => {
  const s = store({ tasks: [t('a', { order: 5 }), t('b', { order: 9, projectId: 'p' })] });
  assert.equal(await s.ops.addTask({ title: ' new ' }), '');
  const added = s.data.tasks.at(-1);
  assert.deepEqual([added.title, added.projectId, added.priority, added.order, added.done, added.createdAt], ['new', 'inbox', 4, 6, false, 1000]);
  assert.equal(await s.ops.addTask({ title: '  ' }), 'A task needs a title');
  await s.ops.addTask({ title: 'sub', parentId: 'a' });
  assert.equal(s.data.tasks.at(-1).order, 1, 'first of its parent’s subtasks');
});

test('complete takes the open subtasks along; untick brings them all back', async () => {
  const s = store({ tasks: [t('p'), t('c', { parentId: 'p' }), t('cc', { parentId: 'c' }), t('was', { parentId: 'p', done: true, doneAt: 1 }), t('other')] });
  const { refused, ticked } = await s.ops.complete(s.data.tasks[0]);
  assert.equal(refused, '');
  assert.deepEqual(ticked.map(x => x.id), ['p', 'c', 'cc']);
  assert.deepEqual(s.data.tasks.map(x => [x.id, x.done]), [['p', true], ['c', true], ['cc', true], ['was', true], ['other', false]]);
  assert.equal(s.data.tasks.find(x => x.id === 'was').doneAt, 1, 'one done before keeps its time');
  await s.ops.untick(ticked);
  assert.deepEqual(s.data.tasks.filter(x => x.done).map(x => x.id), ['was']);
});

test('a repeating task ticked moves to its next date and reopens its done subtasks; unmove puts both back', async () => {
  const due = { date: '2026-11-01', rrule: 'FREQ=WEEKLY', string: 'every week' };
  const s = store({ tasks: [t('r', { due }), t('a', { parentId: 'r', done: true, doneAt: 5 }), t('aa', { parentId: 'a', done: true, doneAt: 6 }),
    t('b', { parentId: 'r' }), t('x', { done: true, doneAt: 7 })] });
  const r = await s.ops.complete(s.data.tasks[0], { next: '2026-11-08' });
  assert.equal(r.refused, '');
  assert.deepEqual(r.ticked, []);
  assert.deepEqual(r.moved, due);
  assert.deepEqual(r.reopened.map(x => x.id), ['a', 'aa']);
  assert.deepEqual(s.data.tasks.map(x => [x.id, x.done, x.doneAt ?? null]), [['r', false, null], ['a', false, null], ['aa', false, null], ['b', false, null], ['x', true, 7]]);
  assert.equal(s.data.tasks[0].due.date, '2026-11-08');
  assert.equal(await s.ops.unmove(s.data.tasks[0], r.moved, r.reopened), '');
  assert.deepEqual(s.data.tasks.map(x => [x.id, x.done, x.doneAt ?? null]), [['r', false, null], ['a', true, 5], ['aa', true, 6], ['b', false, null], ['x', true, 7]]);
  assert.equal(s.data.tasks[0].due.date, '2026-11-01');
});

test('delete takes the subtasks; move takes them to the new project and section', async () => {
  const s = store({ tasks: [t('p'), t('c', { parentId: 'p' }), t('x')] });
  await s.ops.moveTask(s.data.tasks[0], { projectId: 'w', sectionId: 's' });
  assert.deepEqual(s.data.tasks.map(x => [x.id, x.projectId, x.sectionId ?? null]), [['p', 'w', 's'], ['c', 'w', 's'], ['x', 'inbox', null]]);
  assert.equal(s.data.tasks[1].parentId, 'p', 'a subtask stays under its parent');
  await s.ops.removeTask(s.data.tasks[0]);
  assert.deepEqual(s.data.tasks.map(x => x.id), ['x']);
  assert.deepEqual(s.dropped, [['tasks', 'p', 'c']]);
});

test('duplicate copies a task and its subtasks under new ids, open', async () => {
  const s = store({ tasks: [t('p', { order: 1 }), t('c', { parentId: 'p', done: true }), t('q', { order: 2 })] });
  await s.ops.duplicateTask(s.data.tasks[0]);
  const [copy, sub] = s.data.tasks.slice(3);
  assert.deepEqual([copy.title, copy.order, copy.done], ['p', 1.5, false]);
  assert.deepEqual([sub.title, sub.parentId, sub.done], ['c', copy.id, false]);
});

test('a duplicate goes between the task and the next one, never onto another task\'s place; after the last one', async () => {
  const s = store({ tasks: [t('a', { order: 1 }), t('b', { order: 1.25 }), t('elsewhere', { order: 1.1, projectId: 'p' })] });
  await s.ops.duplicateTask(s.data.tasks[0]);
  assert.equal(s.data.tasks.at(-1).order, 1.125, 'before: 1.5, past b');
  await s.ops.duplicateTask(s.data.tasks[1]);
  assert.equal(s.data.tasks.at(-1).order, 2.25);
});

test('projects: add at the end with a known colour; delete takes sub-projects, sections and tasks; the Inbox stays', async () => {
  const s = store();
  const { id: w } = await s.ops.addProject({ name: ' Work ', color: 'pink' });
  assert.deepEqual([s.data.projects[0].name, s.data.projects[0].color, s.data.projects[0].view], ['Work', 'charcoal', 'list']);
  const { id: w2 } = await s.ops.addProject({ name: 'Sub', parentId: w, color: 'blue' });
  const { id: sec } = await s.ops.addSection(w2, 'Admin');
  await s.ops.addTask({ title: 'in sub', projectId: w2, sectionId: sec });
  await s.ops.addTask({ title: 'in inbox' });
  assert.equal((await s.ops.addProject({ name: '' })).refused, 'A project needs a name');
  assert.equal(await s.ops.removeProject({ id: 'inbox', name: 'Inbox' }), 'The Inbox stays');
  await s.ops.removeProject(s.data.projects[0]);
  assert.deepEqual([s.data.projects.map(p => p.id), s.data.sections.length, s.data.tasks.map(x => x.title)], [[], 0, ['in inbox']]);
});

test('sections: add, rename, fold, delete with their tasks', async () => {
  const s = store();
  const { id } = await s.ops.addSection('p', 'One');
  await s.ops.addSection('p', 'Two');
  assert.deepEqual(s.data.sections.map(x => x.order), [1, 2]);
  await s.ops.renameSection(s.data.sections[0], ' Uno ');
  await s.ops.foldSection(s.data.sections[0], true);
  assert.deepEqual([s.data.sections[0].name, s.data.sections[0].collapsed], ['Uno', true]);
  assert.equal(await s.ops.renameSection(s.data.sections[0], ' '), 'A section needs a name');
  await s.ops.addTask({ title: 'a', projectId: 'p', sectionId: id });
  await s.ops.addTask({ title: 'b', projectId: 'p' });
  await s.ops.removeSection(s.data.sections[0]);
  assert.deepEqual([s.data.sections.map(x => x.name), s.data.tasks.map(x => x.title)], [['Two'], ['b']]);
});

test('labels refuse # @ % and /; filters keep their query', async () => {
  const s = store();
  assert.match((await s.ops.addLabel({ name: '@home' })).refused, /without/);
  const made = await s.ops.addLabel({ name: 'errand', color: 'green' });
  assert.equal(made.refused, '');
  assert.equal(s.data.labels[0].id, made.id);
  const f = await s.ops.addFilter({ name: 'Urgent', query: ' p1 ' });
  assert.deepEqual([s.data.labels[0].color, s.data.filters[0].query, s.data.filters[0].id], ['green', 'p1', f.id]);
  await s.ops.orderNamed('labels', [{ item: s.data.labels[0], order: 5 }]);
  assert.equal(s.data.labels[0].order, 5);
  await s.ops.removeLabel(s.data.labels[0]);
  assert.equal(s.data.labels.length, 0);
});

test('a refused save resolves to its reason', async () => {
  assert.equal(await refusal(Promise.reject(new Error('no'))), 'no');
  assert.equal(await refusal(Promise.resolve()), '');
});

test('a task\'s labels: by id, or by name for older tasks; a deleted one is skipped', () => {
  const labels = [{ id: 'l1', name: 'errand' }, { id: 'l2', name: 'Phone' }];
  assert.deepEqual(labelsOf(t('x', { labels: ['l2', 'errand', 'gone', 'l1'] }), labels).map(l => l.id), ['l2', 'l1']);
  assert.deepEqual(labelsOf(t('y', { labels: ['phone'] }), labels).map(l => l.id), ['l2']);
  assert.deepEqual(labelsOf(t('z'), labels), []);
});

test('Display: known choices only; Today groups by date, the rest by none', () => {
  assert.deepEqual(cleanDisplay({}, 'today'), { group: 'date', sort: 'manual', dir: 'asc', completed: false, priority: 0, label: '', date: '', layout: '', cal: 'week', color: 'priority', allDay: false, future: false });
  assert.equal(cleanDisplay(null, 'inbox').group, 'none');
  assert.deepEqual(cleanDisplay({ group: 'x', sort: 'name', dir: 'desc', completed: true, priority: '2', date: 'week' }, 'p'),
    { group: 'none', sort: 'name', dir: 'desc', completed: true, priority: 2, label: '', date: 'week', layout: '', cal: 'week', color: 'priority', allDay: false, future: false });
  assert.ok(plainDisplay(cleanDisplay({}, 'today'), 'today'));
  assert.ok(!plainDisplay(cleanDisplay({ sort: 'name' }, 'today'), 'today'));
});

test('Display: the layout, the calendar\'s kind and colouring, the all-day row and future dates', () => {
  for (const v of ['today', 'upcoming', 'inbox', 'project:p1', 'labels:l1', 'filters:f1']) assert.ok(plainDisplay(cleanDisplay({}, v), v), `${v} plain`);
  const p = cleanDisplay({ layout: 'calendar', cal: 'month', color: 'label', allDay: false, future: true }, 'project:p1');
  assert.deepEqual([p.layout, p.cal, p.color, p.allDay, p.future], ['calendar', 'month', 'label', false, true]);
  assert.ok(!plainDisplay(p, 'project:p1'));
  assert.equal(cleanDisplay({ layout: 'board' }, 'project:p1').layout, 'board');
  assert.equal(cleanDisplay({ layout: 'board' }, 'inbox').layout, 'board', 'any list may be a board');
  assert.equal(cleanDisplay({ layout: 'board' }, 'today').layout, 'board');
  assert.equal(cleanDisplay({ layout: 'board' }, 'labels:l1').layout, 'board');
  assert.equal(cleanDisplay({ layout: 'x' }, 'inbox').layout, '');
  assert.equal(cleanDisplay({ cal: 'agenda' }, 'labels:l1').cal, 'agenda');
  assert.equal(cleanDisplay({ cal: 'agenda' }, 'upcoming').cal, 'week', 'Upcoming has no agenda');
  assert.equal(cleanDisplay({ cal: 'x' }, 'inbox').cal, 'week');
  assert.equal(cleanDisplay({ color: 'project' }, 'filters:f1').color, 'project');
  assert.equal(cleanDisplay({ color: 'project' }, 'inbox').color, 'priority', 'Inbox: not by project');
  assert.equal(cleanDisplay({ color: 'project' }, 'project:p1').color, 'priority');
  assert.equal(cleanDisplay({ allDay: 'no' }, 'today').allDay, false);
  assert.equal(cleanDisplay({ future: 1 }, 'today').future, false);
});

const D = (o = {}) => ({ ...cleanDisplay({}, 'p'), ...o });
const labels = [{ id: 'l1', name: 'b-label', order: 2 }, { id: 'l2', name: 'a-label', order: 1 }];
const projects = [{ id: 'p1', name: 'Work', order: 2 }, { id: 'p2', name: 'Home', order: 1 }];
const pool = () => [
  t('Banana', { createdAt: 3, priority: 2, due: { date: '2026-10-30' }, projectId: 'p1', labels: ['l1'] }),
  t('apple', { createdAt: 1, priority: 4, due: { date: T, time: '09:00' }, projectId: 'p2', labels: ['l1', 'l2'] }),
  t('cherry', { createdAt: 2, priority: 1 }),
  t('date', { createdAt: 4, priority: 2, due: { date: T }, done: true }),
];
const titles = list => list.map(x => x.title);

test('sorting by each key, both ways (no date last either way)', () => {
  const sorted = (sort, dir) => titles(pool().sort(sorter(sort, dir)));
  assert.deepEqual(sorted('manual', 'asc'), ['Banana', 'apple', 'cherry', 'date']);
  assert.deepEqual(sorted('manual', 'desc'), ['Banana', 'apple', 'cherry', 'date'], 'manual has no direction');
  assert.deepEqual(sorted('name', 'asc'), ['apple', 'Banana', 'cherry', 'date']);
  assert.deepEqual(sorted('name', 'desc'), ['date', 'cherry', 'Banana', 'apple']);
  assert.deepEqual(sorted('date', 'asc'), ['Banana', 'apple', 'date', 'cherry'], 'on a day, a time before no time');
  assert.deepEqual(sorted('date', 'desc'), ['date', 'apple', 'Banana', 'cherry']);
  assert.deepEqual(sorted('priority', 'asc'), ['cherry', 'Banana', 'date', 'apple'], 'P1 first, ties by their own order');
  assert.deepEqual(sorted('priority', 'desc'), ['apple', 'Banana', 'date', 'cherry']);
  assert.deepEqual(sorted('added', 'asc'), ['apple', 'cherry', 'Banana', 'date']);
  assert.deepEqual(sorted('added', 'desc'), ['date', 'Banana', 'cherry', 'apple']);
});

test('grouping by date, priority, label, project and none; done ones at each group\'s end', () => {
  const g = (o, list = pool()) => groupTasks(list, D(o), { projects, labels, today: T }).map(x => [x.title, titles(x.tasks)]);
  assert.deepEqual(g({ group: 'none' }), [['', ['Banana', 'apple', 'cherry', 'date']]]);
  assert.deepEqual(g({ group: 'date' }), [['Overdue', ['Banana']], ['1 Nov · Today · Sunday', ['apple', 'date']], ['No date', ['cherry']]]);
  assert.deepEqual(g({ group: 'priority' }), [['Priority 1', ['cherry']], ['Priority 2', ['Banana', 'date']], ['No priority', ['apple']]]);
  assert.deepEqual(g({ group: 'label' }), [['a-label', ['apple']], ['b-label', ['Banana', 'apple']], ['No label', ['cherry', 'date']]]);
  assert.deepEqual(g({ group: 'project' }), [['Inbox', ['cherry', 'date']], ['Home', ['apple']], ['Work', ['Banana']]]);
  assert.deepEqual(g({ group: 'priority', sort: 'name', dir: 'desc' }), [['Priority 1', ['cherry']], ['Priority 2', ['Banana', 'date']], ['No priority', ['apple']]],
    'a done task stays last whatever the sort');
});

test('by deadline: sorted (none last either way) and grouped (Overdue, each day, No deadline)', () => {
  const list = () => [
    t('w', { deadline: '2026-11-05' }), t('x', {}), t('y', { deadline: '2026-10-28' }), t('z', { deadline: T }), t('v', { deadline: '2026-10-20', done: true }),
  ];
  assert.deepEqual(titles(list().sort(sorter('deadline', 'asc'))), ['v', 'y', 'z', 'w', 'x']);
  assert.deepEqual(titles(list().sort(sorter('deadline', 'desc'))), ['w', 'z', 'y', 'v', 'x']);
  const g = groupTasks(list(), D({ group: 'deadline' }), { projects, labels, today: T }).map(x => [x.title, titles(x.tasks)]);
  assert.deepEqual(g, [['Overdue', ['y']], ['20 Oct · Tuesday', ['v']], ['1 Nov · Today · Sunday', ['z']], ['5 Nov · Thursday', ['w']], ['No deadline', ['x']]]);
  assert.equal(cleanDisplay({ group: 'deadline', sort: 'deadline' }, 'p').group, 'deadline');
  assert.equal(cleanDisplay({ group: 'deadline', sort: 'deadline' }, 'p').sort, 'deadline');
});

test('the Display filter, and the completed switch\'s done tasks', () => {
  const n = (o, list = pool()) => titles(narrowTasks(list, D(o), labels, T));
  assert.deepEqual(n({ priority: 2 }), ['Banana', 'date']);
  assert.deepEqual(n({ label: 'l2' }), ['apple']);
  assert.deepEqual(n({ date: 'today' }), ['Banana', 'apple', 'date']);
  assert.deepEqual(n({ date: 'overdue' }), ['Banana']);
  assert.deepEqual(n({ date: 'nodate' }), ['cherry']);
  assert.deepEqual(n({ date: 'week' }), ['Banana', 'apple', 'date']);
  const open = pool().filter(x => !x.done);
  assert.deepEqual(groupTasks(open, D(), { projects, labels, today: T })[0].tasks.length, 3, 'completed off: the list gives open tasks only');
});

test('a day\'s order is a total order: dragged tasks first in their order, then the others by time; any sort gives one answer', () => {
  const day = { date: T };
  // (before: x < y by dayOrder, y < z and z < x by time, a loop)
  const x = t('x', { dayOrder: 1, due: { ...day, time: '12:00' } }), y = t('y', { dayOrder: 2, due: { ...day, time: '08:00' } }),
    z = t('z', { due: { ...day, time: '10:00' } }), w = t('w', { due: day }), u = t('u'), v = t('v', { dayOrder: 3, due: { date: '2026-11-02' } });
  const all = [x, y, z, w, u, v];
  const want = ['x', 'y', 'z', 'w', 'v', 'u'];
  for (let i = 0; i < 24; i++) {
    const shuffled = [...all].sort(() => Math.random() - 0.5);
    assert.deepEqual(shuffled.sort(dayOrder).map(k => k.id), want);
  }
  for (const a of all) for (const b of all) for (const c of all) {
    if (dayOrder(a, b) < 0 && dayOrder(b, c) < 0) assert.ok(dayOrder(a, c) < 0, `${a.id} < ${b.id} < ${c.id}`);
  }
  assert.equal(dayOrder(x, x), 0);
});

test('a project page with Display\'s choice: its subtasks follow it too (done ones with Show completed, the filter\'s choice)', () => {
  const tasks = [t('top', { projectId: 'p', collapsed: false }), t('done-sub', { projectId: 'p', parentId: 'top', done: true }), t('p1-sub', { projectId: 'p', parentId: 'top', priority: 1 }),
    t('p4-sub', { projectId: 'p', parentId: 'top' })];
  const completed = projectView(tasks, [], 'p', { keep: () => true });
  assert.deepEqual(ids(completed.loose), ['top', 'done-sub', 'p1-sub', 'p4-sub']);
  const p1 = projectView([...tasks, t('p1', { projectId: 'p', priority: 1 })], [], 'p', { keep: k => !k.done && k.priority === 1 });
  assert.deepEqual(ids(p1.loose), ['p1-sub', 'p1'], 'a subtask the filter drops does not show; one it keeps shows on its own when its parent is not kept');
  const plain = projectView(tasks, [], 'p');
  assert.deepEqual(ids(plain.loose), ['top', 'p1-sub', 'p4-sub']);
  assert.equal(plain.loose[0].kids, 3, 'the count is of every subtask');
});

test('Reschedule: the day picked; a repeat picked replaces the old one; the old time and rule stay when none is picked', () => {
  const rep = { date: '2026-10-30', time: '09:00', rrule: 'FREQ=WEEKLY', string: 'every week' };
  assert.deepEqual(rescheduled(rep, { date: T, rrule: 'FREQ=DAILY', string: 'every day' }), { date: T, time: '09:00', rrule: 'FREQ=DAILY', string: 'every day' });
  assert.deepEqual(rescheduled(rep, { date: T, time: '18:30' }), { date: T, time: '18:30', rrule: 'FREQ=WEEKLY', string: 'every week' });
  assert.deepEqual(rescheduled({ date: '2026-10-30', rrule: 'FREQ=DAILY', fromDone: true }, { date: T, rrule: 'FREQ=MONTHLY' }), { date: T, rrule: 'FREQ=MONTHLY' });
  assert.deepEqual(rescheduled({ date: '2026-10-30' }, { date: T, rrule: 'FREQ=DAILY' }), { date: T, rrule: 'FREQ=DAILY' });
  assert.equal(rescheduled(rep, null), undefined, 'No date leaves a repeating one be');
  assert.equal(rescheduled({ date: '2026-10-30' }, null), null);
});

test('a delete\'s tasks (their files go with them): a task with every subtask, a section\'s, a project\'s with its sub-projects\'', async () => {
  const data = { projects: [{ id: 'p', name: 'P', order: 1 }, { id: 'p2', name: 'Sub', parentId: 'p', order: 1 }], sections: [{ id: 's', name: 'S', projectId: 'p', order: 1 }],
    tasks: [t('top', { projectId: 'p' }), t('sub', { projectId: 'p', parentId: 'top' }), t('subsub', { projectId: 'p', parentId: 'sub' }),
      t('in-s', { projectId: 'p', sectionId: 's' }), t('in-s-sub', { projectId: 'p', sectionId: 's', parentId: 'in-s' }), t('deep', { projectId: 'p2' }), t('other')],
    labels: [], filters: [] };
  const sorted = list => list.map(x => x.id).sort();
  assert.deepEqual(sorted(tasksGone('task', data.tasks[0], data)), ['sub', 'subsub', 'top']);
  assert.deepEqual(sorted(tasksGone('section', data.sections[0], data)), ['in-s', 'in-s-sub']);
  assert.deepEqual(sorted(tasksGone('project', data.projects[0], data)), ['deep', 'in-s', 'in-s-sub', 'sub', 'subsub', 'top']);
  assert.deepEqual(tasksGone('project', { id: 'inbox' }, data), []);
  // (the same tasks the deletes take)
  for (const [kind, x, run] of [['task', data.tasks[0], (o, y) => o.removeTask(y)], ['section', data.sections[0], (o, y) => o.removeSection(y)], ['project', data.projects[0], (o, y) => o.removeProject(y)]]) {
    const s = store(structuredClone(data));
    const want = sorted(tasksGone(kind, x, s.data));
    await run(s.ops, x);
    assert.deepEqual(sorted(s.saves.filter(([c, r]) => c === 'tasks' && r._deleted).map(([, r]) => r)), want, kind);
  }
});
