// The app's writes, the same for both data sides: cloud.js and a static app's local.js each pass in how one record is
// saved (the sync engine's save, queued and sent in the cloud app). Each resolves to '' when every save is stored or
// queued, or to the reason when one was refused at once (app-sync rejects then; the copy waits in the refused list).
// A tick, move or delete takes a task's subtasks along; a project's delete takes its sub-projects, sections and tasks.
import { COLL, PROJECTS, SECTIONS, LABELS, FILTERS, INBOX } from './items.js';
import { cleanFields, cleanColor, projectCascade, sectionCascade, projectOf } from './tasks.js';
import { descendants } from './tree.js';
import { orderAtEnd } from './order.js';

/** @typedef {import('./items.js').Task} Task */
/** @typedef {import('./items.js').Project} Project */
/** @typedef {import('./items.js').Section} Section */
/** @typedef {import('./items.js').Label} Label */
/** @typedef {import('./items.js').Filter} Filter */
/** @typedef {import('./items.js').Data} Data */

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
  /** a task and its open subtasks, done (doneAt now) -> '' or the reason, and the tasks it ticked (an undo unticks them)
   * @param {Task} task @returns {Promise<{ refused: string, ticked: Task[] }>} */
  const complete = async task => {
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
    /** done or not done, this task alone @param {Task} task @param {boolean} done */
    tick: (task, done) => put(COLL, { ...task, done, doneAt: done ? now() : null }, task),
    /** not done again (an undo): each as it is now @param {Task[]} tasks */
    untick: tasks => first(tasks.map(t => data().tasks.find(x => x.id === t.id) ?? t).map(t => put(COLL, { ...t, done: false, doneAt: null }, t))),
    /** a task and its subtasks @param {Task} task */
    removeTask: task => remove(COLL, [task, ...descendants(task.id, data().tasks)]),
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
    /** a copy of a task (and its subtasks) right after it @param {Task} task */
    duplicateTask: async task => {
      const all = data().tasks, map = new Map([[task.id, id()]]);
      const under = descendants(task.id, all);
      for (const t of under) map.set(t.id, id());
      const copy = (/** @type {Task} */ t, /** @type {Record<string, unknown>} */ extra) => {
        const { id: _i, createdAt: _c, updatedAt: _u, serverAt: _s, _edits: _e, doneAt: _d, extId: _x, ...rest } = t;
        return put(COLL, { ...rest, ...extra, id: map.get(t.id), done: false, doneAt: null, createdAt: now() }, null);
      };
      return first([copy(task, { order: task.order + 0.5 }), ...under.map(t => copy(t, { parentId: map.get(String(t.parentId)) ?? t.parentId }))]);
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
    /** the Inbox's own record, made once (a task with no project is in it even before) */
    ensureInbox: () => (data().projects.some(p => p.id === INBOX) ? Promise.resolve('')
      : put(PROJECTS, { id: INBOX, name: 'Inbox', color: 'charcoal', parentId: null, order: 0, view: 'list', inbox: true, createdAt: now() }, null)),

    /** @param {string} projectId @param {string} name @param {number} [order] at the end unless given @returns {Promise<{ refused: string, id: string }>} */
    addSection: async (projectId, name, order) => {
      const n = String(name ?? '').trim().slice(0, 120), sid = id();
      if (!n) return { refused: 'A section needs a name', id: '' };
      return { refused: await put(SECTIONS, { id: sid, name: n, projectId, order: order ?? orderAtEnd(data().sections.filter(s => s.projectId === projectId)), createdAt: now() }, null), id: sid };
    },
    /** @param {Section} s @param {string} name */
    renameSection: (s, name) => {
      const n = String(name ?? '').trim().slice(0, 120);
      return n ? put(SECTIONS, { ...s, name: n }, s) : Promise.resolve('A section needs a name');
    },
    /** @param {Section} s @param {boolean} collapsed */
    foldSection: (s, collapsed) => put(SECTIONS, { ...s, collapsed }, s),
    /** a section and its tasks @param {Section} s */
    removeSection: async s => first([remove(COLL, sectionCascade(s.id, data().tasks)), remove(SECTIONS, [s])]),

    /** @param {{ name: string, color?: string, favorite?: boolean }} l */
    addLabel: l => {
      const name = String(l.name ?? '').trim().slice(0, 60);
      if (!name || /[#@%/]/.test(name)) return Promise.resolve('A label needs a name without # @ % or /');
      return put(LABELS, { id: id(), name, color: cleanColor(l.color), order: orderAtEnd(data().labels), favorite: !!l.favorite, createdAt: now() }, null);
    },
    /** @param {Label} l @param {Partial<Label>} patch */
    editLabel: (l, patch) => put(LABELS, { ...l, ...patch, color: cleanColor(patch.color ?? l.color) }, l),
    /** @param {Label} l */
    removeLabel: l => remove(LABELS, [l]),
    /** @param {{ name: string, query: string, color?: string, favorite?: boolean }} f */
    addFilter: f => put(FILTERS, { id: id(), name: String(f.name).trim().slice(0, 120), query: String(f.query).trim().slice(0, 1000),
      color: cleanColor(f.color), order: orderAtEnd(data().filters), favorite: !!f.favorite, createdAt: now() }, null),
    /** @param {Filter} f @param {Partial<Filter>} patch */
    editFilter: (f, patch) => put(FILTERS, { ...f, ...patch, color: cleanColor(patch.color ?? f.color) }, f),
    /** @param {Filter} f */
    removeFilter: f => remove(FILTERS, [f]),
    /** a whole task under its own id, as a new save (a restore brings one back) @param {Task} task */
    put: task => put(COLL, { ...task }, null),
  };
}
