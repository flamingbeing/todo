import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templateOf, planFrom } from '../src/templates.js';

const data = {
  projects: [{ id: 'p1', name: 'Trip', color: 'blue', order: 1, view: 'board' }, { id: 'p2', name: 'Other', color: 'red', order: 2 }],
  sections: [{ id: 's2', name: 'Pack', projectId: 'p1', order: 2 }, { id: 's1', name: 'Book', projectId: 'p1', order: 1 }, { id: 'sx', name: 'Else', projectId: 'p2', order: 1 }],
  labels: [{ id: 'l1', name: 'Errand', color: 'red', order: 1 }],
  tasks: [
    { id: 'a', title: 'Passport', projectId: 'p1', order: 1, priority: 1, done: false, labels: ['l1'], due: { date: '2026-11-05' }, deadline: '2026-11-09', reminders: [0] },
    { id: 'b', title: 'Flights', projectId: 'p1', sectionId: 's1', order: 1, priority: 2, done: false, description: 'cheap' },
    { id: 'c', title: 'Seat', projectId: 'p1', sectionId: 's1', parentId: 'b', order: 1, priority: 4, done: false },
    { id: 'd', title: 'Socks', projectId: 'p1', sectionId: 's2', order: 1, priority: 4, done: false, duration: 15 },
    { id: 'e', title: 'Done thing', projectId: 'p1', order: 2, priority: 4, done: true, doneAt: 5 },
    { id: 'f', title: 'Elsewhere', projectId: 'p2', order: 1, priority: 4, done: false },
  ],
};

test('templateOf keeps sections in order and open tasks with their subtasks, with dates cleared', () => {
  const t = templateOf(data.projects[0], data);
  assert.equal(t.name, 'Trip'); assert.equal(t.view, 'board'); assert.deepEqual(t.sections, ['Book', 'Pack']);
  assert.deepEqual(t.tasks.map(x => x.title), ['Passport', 'Flights', 'Seat', 'Socks']);
  assert.deepEqual(t.tasks[0], { title: 'Passport', priority: 1, labels: ['Errand'], section: null, parent: null });
  assert.deepEqual(t.tasks[1], { title: 'Flights', description: 'cheap', priority: 2, section: 0, parent: null });
  assert.deepEqual([t.tasks[2].section, t.tasks[2].parent], [0, 1]);
  assert.deepEqual([t.tasks[3].section, t.tasks[3].duration], [1, 15]);
  assert.ok(!JSON.stringify(t).includes('2026-11'), 'no dates');
  assert.ok(!('done' in t.tasks[0]) && !('due' in t.tasks[0]) && !('reminders' in t.tasks[0]));
});

test('planFrom makes a new project, its sections and tasks with fresh ids, undated and open', () => {
  let n = 0;
  const id = () => `n${++n}`;
  const tpl = templateOf(data.projects[0], data);
  const p = planFrom(tpl, { labels: data.labels, projects: data.projects }, { id, now: () => 100 });
  assert.equal(p.project.name, 'Trip'); assert.equal(p.project.order, 3); assert.equal(p.project.parentId, null);
  assert.deepEqual(p.sections.map(s => [s.name, s.order, s.projectId]), [['Book', 1, p.project.id], ['Pack', 2, p.project.id]]);
  assert.equal(p.tasks.length, 4);
  const [pass, fl, seat, socks] = p.tasks;
  assert.deepEqual(pass.labels, ['l1']); assert.equal(pass.sectionId, null);
  assert.equal(fl.sectionId, p.sections[0].id); assert.equal(seat.parentId, fl.id); assert.equal(seat.sectionId, p.sections[0].id);
  assert.equal(socks.duration, 15);
  for (const t of p.tasks) { assert.equal(t.done, false); assert.equal(t.due, null); assert.equal(t.deadline, null); assert.equal(t.projectId, p.project.id); assert.ok(!['a', 'b', 'c', 'd'].includes(t.id)); }
  assert.equal(new Set([p.project.id, ...p.sections.map(s => s.id), ...p.tasks.map(t => t.id)]).size, 7, 'all ids differ');
  assert.deepEqual(p.tasks.map(t => t.order), [1, 1, 1, 1]);
});

test('planFrom: a name of your own, labels matched by name (missing ones dropped), bad links and sizes tamed', () => {
  const id = (() => { let n = 0; return () => `m${++n}`; })();
  const tpl = { name: 'x', color: 'nope', view: 'sideways', sections: ['A'], tasks: [
    { title: '  One ', priority: 9, labels: ['errand', 'gone'], section: 5, parent: null },
    { title: 'Two', priority: 2, section: 0, parent: 7 },
    { title: '', priority: 4, section: null, parent: null },
    { title: 'Three', priority: 4, section: 0, parent: 0 },
  ] };
  const p = planFrom(tpl, { labels: data.labels, projects: [] }, { id, name: ' Mine ' });
  assert.equal(p.project.name, 'Mine'); assert.equal(p.project.color, 'charcoal'); assert.equal(p.project.view, 'list'); assert.equal(p.project.order, 1);
  assert.deepEqual(p.tasks.map(t => t.title), ['One', 'Two', 'Three']);
  assert.deepEqual(p.tasks[0].labels, ['l1']); assert.equal(p.tasks[0].priority, 4); assert.equal(p.tasks[0].sectionId, null);
  assert.equal(p.tasks[1].parentId, null, 'a parent that is not earlier is dropped'); assert.equal(p.tasks[1].sectionId, p.sections[0].id);
  assert.equal(p.tasks[2].parentId, p.tasks[0].id);
});

test('an empty project is a template with nothing in it', () => {
  const t = templateOf(data.projects[1], { ...data, tasks: [] });
  assert.deepEqual(t.sections, ['Else']); assert.deepEqual(t.tasks, []);
});
