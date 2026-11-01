// tasks.js and task-ops.js: what each list shows, the counts and cascades, and what a save stores.
// node --test app/test/tasks.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { projectView, todayView, upcomingView, completedView, projectTree, projectCounts, todayCount, upcomingCount, placeText,
  projectCascade, sectionCascade, cleanFields, cleanDue, isTask, dayOrder } from '../src/tasks.js';
import { taskOps, refusal } from '../src/task-ops.js';

const T = '2026-11-01';
let n = 0;
const t = (id, o = {}) => ({ id, title: id, projectId: 'inbox', order: ++n, priority: 4, done: false, ...o });
const ids = lines => lines.map(l => l.task.id);

test('a project page: loose tasks first, then each section in order; subtasks under their parent; done ones hidden', () => {
  const sections = [{ id: 's2', name: 'Later', projectId: 'p', order: 2 }, { id: 's1', name: 'Now', projectId: 'p', order: 1 },
    { id: 'sx', name: 'Elsewhere', projectId: 'q', order: 1 }];
  const tasks = [t('a', { projectId: 'p' }), t('b', { projectId: 'p', sectionId: 's1' }), t('c', { projectId: 'p', sectionId: 's2' }),
    t('a1', { projectId: 'p', parentId: 'a' }), t('a2', { projectId: 'p', parentId: 'a', done: true }), t('d', { projectId: 'p', done: true }),
    t('e', { projectId: 'p', sectionId: 'gone' }), t('orphan', { projectId: 'p', parentId: 'missing' }), t('x', { projectId: 'q' }),
    { id: 'old', text: 'an older record' }];
  const v = projectView(tasks, sections, 'p');
  assert.deepEqual(ids(v.loose), ['a', 'a1', 'e', 'orphan'], 'a task in a deleted section is loose');
  assert.deepEqual(v.loose.map(l => l.depth), [0, 1, 0, 0]);
  assert.deepEqual([v.loose[0].kids, v.loose[0].doneKids], [2, 1], '"1/2"');
  assert.deepEqual(v.sections.map(s => s.section.id), ['s1', 's2']);
  assert.deepEqual(v.sections.map(s => ids(s.lines)), [['b'], ['c']]);
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

test('projects: add at the end with a known colour; delete takes sub-projects, sections and tasks; the Inbox stays', async () => {
  const s = store();
  assert.equal(await s.ops.ensureInbox(), '');
  assert.equal(await s.ops.ensureInbox(), '');
  assert.equal(s.data.projects.length, 1, 'the Inbox is made once');
  assert.deepEqual([s.data.projects[0].id, s.data.projects[0].inbox], ['inbox', true]);
  const { id: w } = await s.ops.addProject({ name: ' Work ', color: 'pink' });
  assert.deepEqual([s.data.projects[1].name, s.data.projects[1].color, s.data.projects[1].view], ['Work', 'charcoal', 'list']);
  const { id: w2 } = await s.ops.addProject({ name: 'Sub', parentId: w, color: 'blue' });
  const { id: sec } = await s.ops.addSection(w2, 'Admin');
  await s.ops.addTask({ title: 'in sub', projectId: w2, sectionId: sec });
  await s.ops.addTask({ title: 'in inbox' });
  assert.equal((await s.ops.addProject({ name: '' })).refused, 'A project needs a name');
  assert.equal(await s.ops.removeProject(s.data.projects[0]), 'The Inbox stays');
  await s.ops.removeProject(s.data.projects[1]);
  assert.deepEqual([s.data.projects.map(p => p.id), s.data.sections.length, s.data.tasks.map(x => x.title)], [['inbox'], 0, ['in inbox']]);
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
  assert.match(await s.ops.addLabel({ name: '@home' }), /without/);
  assert.equal(await s.ops.addLabel({ name: 'errand', color: 'green' }), '');
  await s.ops.addFilter({ name: 'Urgent', query: ' p1 ' });
  assert.deepEqual([s.data.labels[0].color, s.data.filters[0].query], ['green', 'p1']);
  await s.ops.removeLabel(s.data.labels[0]);
  assert.equal(s.data.labels.length, 0);
});

test('a refused save resolves to its reason', async () => {
  assert.equal(await refusal(Promise.reject(new Error('no'))), 'no');
  assert.equal(await refusal(Promise.resolve()), '');
});
