// The app's writes, the same for both data sides: cloud.js and a local-only app's local.js each pass in how one record is
// saved. Each resolves to '' when every save is stored or queued, or to the reason when one was refused at once.
// A tick, move or delete takes a task's subtasks along; a project's delete takes its sub-projects, sections and tasks.
import { COLL, PROJECTS, SECTIONS, LABELS, FILTERS, INBOX } from './items.js';
import { cleanFields, cleanColor, cleanDue, projectCascade, sectionCascade, projectOf } from './tasks.js';
import { descendants } from './tree.js';
import { orderAtEnd, orderBetween } from './order.js';

/** @typedef {import('./items.js').Task} Task */
/** @typedef {import('./items.js').Project} Project */
/** @typedef {import('./items.js').Section} Section */
/** @typedef {import('./items.js').Label} Label */
/** @typedef {import('./items.js').Filter} Filter */
/** @typedef {import('./items.js').Data} Data */

/**
 * The tasks a delete takes, subtasks included (none for the Inbox).
 * @param {'task' | 'section' | 'project'} kind @param {{ id: string }} x @param {Data} data @returns {Task[]}
 */
export function tasksGone(kind, x, data) {
  if (kind === 'task') return [/** @type {Task} */ (x), ...descendants(x.id, data.tasks)];
  if (kind === 'section') return sectionCascade(x.id, data.tasks);
  return x.id === INBOX ? [] : projectCascade(x.id, data.projects, data.sections, data.tasks).tasks;
}

/** @param {Promise<unknown>} saving @returns {Promise<string>} */
export const refusal = saving => saving.then(() => '', e => (e instanceof Error && e.message) || 'The server refused it');
/** the first refusal of several saves, or '' @param {Promise<string>[]} all */
const first = async all => (await Promise.all(all)).find(Boolean) || '';

/**
 * @param {{ save: (coll: string, record: Record<string, unknown>, base: unknown) => Promise<unknown>, id: () => string,
 *   data: () => Data, now?: () => number, drop?: (coll: string, ids: string[]) => void }} o
 *   save: one record (base: the copy the change started from, null for a new one); data: every record as last heard;
 *   drop: tells the page's copy a delete is coming (the cloud app's hub)
 */
export function taskOps({ save, id, data, now = Date.now, drop = () => {} }) {
  /** @param {string} coll @param {Record<string, unknown>} rec @param {unknown} base */
  const put = (coll, rec, base) => refusal(save(coll, rec, base));
  /** @param {string} coll @param {{ id: string }[]} list */
  const remove = (coll, list) => { if (!list.length) return Promise.resolve(''); drop(coll, list.map(x => x.id)); return first(list.map(x => put(coll, { id: x.id, _deleted: true }, x))); };
  const siblings = (/** @type {string} */ projectId, /** @type {string | null | undefined} */ sectionId, /** @type {string | null | undefined} */ parentId) =>
    data().tasks.filter(t => projectOf(t) === projectId && (t.sectionId || null) === (sectionId || null) && (t.parentId || null) === (parentId || null));

  /** @param {import('./items.js').Fields} fields @returns {Promise<string>} */
  const addTask = fields => {
    const f = cleanFields({ priority: 4, projectId: INBOX, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) });
    if (!f.title) return Promise.resolve('A task needs a title');
    const order = typeof f.order === 'number' ? f.order : orderAtEnd(siblings(/** @type {string} */ (f.projectId), f.sectionId, f.parentId));
    return put(COLL, { id: id(), done: false, ...f, order, createdAt: now() }, null);
  };
  /** a task and its open subtasks, done (doneAt now) -> '' or the reason, and the tasks it ticked (an undo unticks them).
   * A repeating task with a next date (next) stays open and moves to it instead: moved is the date it had, reopened its
   * done subtasks, open again for the next time (an undo, unmove, puts both back).
   * @param {Task} task @param {{ next?: string | null, keepSubs?: boolean }} [o] @returns {Promise<{ refused: string, ticked: Task[], moved?: import('./dates.js').Due, reopened?: Task[] }>} */
  const complete = async (task, { next, keepSubs } = {}) => {
    if (next && task.due?.rrule) {
      const reopened = keepSubs ? [] : descendants(task.id, data().tasks).filter(t => t.done);
      return { refused: await first([put(COLL, { ...task, due: cleanDue({ ...task.due, date: next }) }, task), ...reopened.map(t => put(COLL, { ...t, done: false, doneAt: null }, t))]),
        ticked: [], moved: task.due, reopened };
    }
    const ticked = [task, ...descendants(task.id, data().tasks).filter(t => !t.done)], at = now();
    return { refused: await first(ticked.map(t => put(COLL, { ...t, done: true, doneAt: at }, t))), ticked };
  };
  return {
    addTask,
    /** @param {Task} task @param {import('./items.js').Fields} patch @returns {Promise<string>} */
    editTask: (task, patch) => {
      const f = cleanFields(patch);
      if (patch.title !== undefined && !f.title) return Promise.resolve('A task needs a title');
      return put(COLL, { ...task, ...f }, task);
    },
    complete,
    /** a repeating task done for good (the "…" menu's Complete forever): done now, its day kept but its repeat (and
     * the words it was typed with) taken off, so it does not roll on; this task alone, one save @param {Task} task */
    completeForever: task => {
      const due = task.due ? cleanDue({ date: task.due.date, ...(task.due.time ? { time: task.due.time } : {}) }) : null;
      return put(COLL, { ...task, due, done: true, doneAt: now() }, task);
    },
    /** done or not done, this task alone @param {Task} task @param {boolean} done */
    tick: (task, done) => put(COLL, { ...task, done, doneAt: done ? now() : null }, task),
    /** not done again (an undo): each as it is now @param {Task[]} tasks */
    untick: tasks => first(tasks.map(t => data().tasks.find(x => x.id === t.id) ?? t).map(t => put(COLL, { ...t, done: false, doneAt: null }, t))),
    /** a repeating task's move undone: its date back, its reopened subtasks done again as they were
     * @param {Task} task @param {import('./dates.js').Due} due @param {Task[]} [reopened] */
    unmove: (task, due, reopened = []) => first([task, ...reopened].map((t, i) => {
      const n = data().tasks.find(x => x.id === t.id) ?? t;
      return put(COLL, i ? { ...n, done: true, doneAt: t.doneAt ?? null } : { ...n, due }, n);
    })),
    /** a task and its subtasks @param {Task} task */
    removeTask: task => remove(COLL, tasksGone('task', task, data())),
    /**
     * to another project, section or parent (at the end there); its subtasks follow it to the project and section
     * @param {Task} task @param {{ projectId?: string, sectionId?: string | null, parentId?: string | null }} to
     */
    moveTask: (task, to) => {
      const projectId = to.projectId ?? projectOf(task), sectionId = to.sectionId === undefined ? task.sectionId ?? null : to.sectionId;
      const parentId = to.parentId === undefined ? null : to.parentId;
      const order = orderAtEnd(siblings(projectId, sectionId, parentId).filter(t => t.id !== task.id));
      const under = descendants(task.id, data().tasks);
      return first([put(COLL, { ...task, projectId, sectionId, parentId, order }, task),
        ...under.map(t => put(COLL, { ...t, projectId, sectionId }, t))]);
    },
    /**
     * a dragged task in its new place: its parent, section and order there (its subtasks follow to the project and
     * section), a new day when dropped on one, and the records to renumber first (from order.js placeAt)
     * @param {Task} task @param {{ projectId?: string, sectionId?: string | null, parentId?: string | null, order?: number,
     *   dayOrder?: number, date?: string, fields?: import('./items.js').Fields }} to (fields: what a drop between groups sets) @param {{ item: { id: string }, order: number }[]} [renumber] @param {'order' | 'dayOrder'} [key]
     */
    placeTask: (task, to, renumber = [], key = 'order') => {
      const all = data().tasks;
      const projectId = to.projectId ?? projectOf(task), sectionId = to.sectionId === undefined ? task.sectionId ?? null : to.sectionId;
      const next = { ...task, projectId, sectionId, ...(to.parentId !== undefined ? { parentId: to.parentId } : {}),
        ...(typeof to.order === 'number' ? { order: to.order } : {}), ...(typeof to.dayOrder === 'number' ? { dayOrder: to.dayOrder } : {}),
        ...(to.date && task.due ? { due: cleanDue({ ...task.due, date: to.date }) } : to.date ? { due: { date: to.date } } : {}), ...cleanFields(to.fields ?? {}) };
      const moved = projectId !== projectOf(task) || sectionId !== (task.sectionId ?? null);
      const under = moved ? descendants(task.id, all) : [];
      const others = renumber.filter(r => r.item.id !== task.id).map(r => {
        const t = all.find(x => x.id === r.item.id);
        return t ? put(COLL, { ...t, [key]: r.order }, t) : Promise.resolve('');
      });
      return first([...others, put(COLL, next, task), ...under.map(t => put(COLL, { ...t, projectId, sectionId }, t))]);
    },
    /** projects in a new order (Manage projects): each whose order or parent changes @param {{ item: Project, order: number, parentId?: string | null }[]} list */
    orderProjects: list => first(list.map(({ item, order, parentId }) => put(PROJECTS, { ...item, order, ...(parentId !== undefined ? { parentId } : {}) }, item))),
    /** a copy of a task (and its subtasks) right after it @param {Task} task */
    duplicateTask: async task => {
      const all = data().tasks, map = new Map([[task.id, id()]]);
      const under = descendants(task.id, all);
      for (const t of under) map.set(t.id, id());
      const copy = (/** @type {Task} */ t, /** @type {Record<string, unknown>} */ extra) => {
        const { id: _i, createdAt: _c, updatedAt: _u, serverAt: _s, _edits: _e, doneAt: _d, extId: _x, ...rest } = t;
        return put(COLL, { ...rest, ...extra, id: map.get(t.id), done: false, doneAt: null, createdAt: now() }, null);
      };
      // between it and the next sibling
      const after = siblings(projectOf(task), task.sectionId, task.parentId).map(t => t.order).filter(o => typeof o === 'number' && o > task.order);
      const order = orderBetween(task.order, after.length ? Math.min(...after) : null);
      return first([copy(task, { order }), ...under.map(t => copy(t, { parentId: map.get(String(t.parentId)) ?? t.parentId }))]);
    },

    /** @param {{ name: string, color?: string, parentId?: string | null, favorite?: boolean, view?: 'list' | 'board' }} p
     * @returns {Promise<{ refused: string, id: string }>} */
    addProject: async p => {
      const name = String(p.name ?? '').trim().slice(0, 120), pid = id();
      if (!name) return { refused: 'A project needs a name', id: '' };
      const order = orderAtEnd(data().projects.filter(x => (x.parentId || null) === (p.parentId || null)));
      return { refused: await put(PROJECTS, { id: pid, name, color: cleanColor(p.color), parentId: p.parentId || null, order,
        favorite: !!p.favorite, view: p.view === 'board' ? 'board' : 'list', createdAt: now() }, null), id: pid };
    },
    /** @param {Project} p @param {Partial<Pick<Project, 'name' | 'color' | 'parentId' | 'favorite' | 'view' | 'collapsed' | 'order'>>} patch */
    editProject: (p, patch) => {
      const next = { ...p, ...patch };
      next.name = String(next.name ?? '').trim().slice(0, 120);
      if (!next.name) return Promise.resolve('A project needs a name');
      next.color = cleanColor(next.color);
      if (next.parentId === p.id) next.parentId = p.parentId ?? null;
      return put(PROJECTS, next, p);
    },
    /** a project with its sub-projects, sections and tasks (never the Inbox) @param {Project} p */
    removeProject: async p => {
      if (p.id === INBOX) return 'The Inbox stays';
      const { projects, sections, tasks } = projectCascade(p.id, data().projects, data().sections, data().tasks);
      return first([remove(COLL, tasks), remove(SECTIONS, sections), remove(PROJECTS, projects)]);
    },

    /** @param {string} projectId @param {string} name @param {number} [order] at the end unless given @param {string} [description]
     * @returns {Promise<{ refused: string, id: string }>} */
    addSection: async (projectId, name, order, description) => {
      const n = String(name ?? '').trim().slice(0, 120), sid = id(), d = String(description ?? '').trim().slice(0, 2000);
      if (!n) return { refused: 'A section needs a name', id: '' };
      return { refused: await put(SECTIONS, { id: sid, name: n, projectId, order: order ?? orderAtEnd(data().sections.filter(s => s.projectId === projectId)), ...(d ? { description: d } : {}), createdAt: now() }, null), id: sid };
    },
    /** a section's name and description (an empty description clears it) @param {Section} s @param {string} name @param {string} description */
    editSection: (s, name, description) => {
      const n = String(name ?? '').trim().slice(0, 120), d = String(description ?? '').trim().slice(0, 2000);
      return n ? put(SECTIONS, { ...s, name: n, description: d || null }, s) : Promise.resolve('A section needs a name');
    },
    /** @param {Section} s @param {string} name */
    renameSection: (s, name) => {
      const n = String(name ?? '').trim().slice(0, 120);
      return n ? put(SECTIONS, { ...s, name: n }, s) : Promise.resolve('A section needs a name');
    },
    /** @param {Section} s @param {boolean} collapsed */
    foldSection: (s, collapsed) => put(SECTIONS, { ...s, collapsed }, s),
    /** a section and its tasks @param {Section} s */
    removeSection: async s => first([remove(COLL, tasksGone('section', s, data())), remove(SECTIONS, [s])]),

    /** @param {{ name: string, color?: string, favorite?: boolean }} l */
    addLabel: l => {
      const name = String(l.name ?? '').trim().slice(0, 60);
      if (!name || /[#@%/]/.test(name)) return Promise.resolve({ refused: 'A label needs a name without # @ % or /', id: '' });
      const lid = id();
      return put(LABELS, { id: lid, name, color: cleanColor(l.color), order: orderAtEnd(data().labels), favorite: !!l.favorite, createdAt: now() }, null)
        .then(refused => ({ refused, id: lid }));
    },
    /** @param {Label} l @param {Partial<Label>} patch */
    editLabel: (l, patch) => put(LABELS, { ...l, ...patch, color: cleanColor(patch.color ?? l.color) }, l),
    /** @param {Label} l */
    removeLabel: l => remove(LABELS, [l]),
    /** @param {{ name: string, query: string, color?: string, favorite?: boolean }} f */
    addFilter: f => {
      const fid = id();
      return put(FILTERS, { id: fid, name: String(f.name).trim().slice(0, 120), query: String(f.query).trim().slice(0, 1000),
        color: cleanColor(f.color), order: orderAtEnd(data().filters), favorite: !!f.favorite, createdAt: now() }, null).then(refused => ({ refused, id: fid }));
    },
    /** @param {Filter} f @param {Partial<Filter>} patch */
    editFilter: (f, patch) => put(FILTERS, { ...f, ...patch, color: cleanColor(patch.color ?? f.color) }, f),
    /** @param {Filter} f */
    removeFilter: f => remove(FILTERS, [f]),
    /** new order numbers for labels or filters (a drag in Filters & Labels) @param {'labels' | 'filters'} kind
     * @param {{ item: Label | Filter, order: number }[]} list */
    orderNamed: (kind, list) => first(list.map(({ item, order }) => put(kind === 'labels' ? LABELS : FILTERS, { ...item, order }, item))),
    /** a comment or template, gone for good (not in the bin) @param {string} coll @param {{ id: string }} x */
    removeRec: (coll, x) => remove(coll, [x]),
    /** a whole task under its own id, as a new save (a restore brings one back) @param {Task} task */
    put: task => put(COLL, { ...task }, null),
    /** one record of any collection as the import made it (base: its saved copy, or null) @param {string} coll @param {Record<string, unknown>} rec @param {unknown} base */
    writeRecord: (coll, rec, base) => put(coll, rec, base),
  };
}
