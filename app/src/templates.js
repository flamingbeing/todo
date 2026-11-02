// Project templates, pure: a project's sections and open tasks (subtasks too), with dates, deadlines, reminders and done-ness
// left out, kept as one record; and the plan for a new project made from one. Loaded with the templates sheet (lazyModules),
// never at startup. Labels are kept by name, so a template works on a list where the label has another id (a missing label
// is left off the task).
import { cleanColor, projectOf } from './tasks.js';
import { byOrder } from './order.js';

/** @typedef {import('./items.js').Task} Task */
/** @typedef {{ title: string, description?: string, priority: number, labels?: string[], duration?: number, section: number | null, parent: number | null }} TemplateTask  section / parent: positions in the template's lists */
/** @typedef {{ id?: string, name: string, color: string, view: 'list' | 'board', sections: string[], tasks: TemplateTask[] }} Template */

export const MAX_SECTIONS = 50;
export const MAX_TASKS = 300;

/**
 * A project saved as a template: the open tasks in order, parents before their subtasks, sections in order.
 * @param {import('./items.js').Project} project @param {import('./items.js').Data} data @returns {Template}
 */
export function templateOf(project, data) {
  const sections = byOrder(data.sections.filter(s => s.projectId === project.id)).slice(0, MAX_SECTIONS);
  const secAt = new Map(sections.map((s, i) => [s.id, i]));
  const names = new Map(data.labels.map(l => [l.id, l.name]));
  const mine = data.tasks.filter(t => !t.done && !t._deleted && projectOf(t) === project.id);
  const ids = new Set(mine.map(t => t.id));
  /** @type {Task[]} */
  const out = [];
  /** @param {string | null} parent @param {string | null} sec */
  const walk = (parent, sec) => {
    const here = mine.filter(t => (t.parentId && ids.has(t.parentId) ? t.parentId : null) === parent && (parent ? true : (secAt.has(t.sectionId ?? '') ? t.sectionId : null) === sec));
    for (const t of byOrder(here)) { if (out.length >= MAX_TASKS) return; out.push(t); walk(t.id, sec); }
  };
  walk(null, null);
  for (const s of sections) walk(null, s.id);
  const at = new Map(out.map((t, i) => [t.id, i]));
  /** a subtask takes its parent's section @param {Task} t @returns {number | null} */
  const sectionOf = t => { for (let x = t, n = 0; n < 10; n++) { if (!x.parentId || !at.has(x.parentId)) return secAt.get(x.sectionId ?? '') ?? null; x = out[/** @type {number} */ (at.get(x.parentId))]; } return null; };
  return {
    name: project.name, color: cleanColor(project.color), view: project.view === 'board' ? 'board' : 'list',
    sections: sections.map(s => s.name),
    tasks: out.map(t => {
      const labels = (Array.isArray(t.labels) ? t.labels : []).map(v => names.get(v) ?? '').filter(Boolean);
      return {
        title: t.title, ...(t.description ? { description: t.description } : {}), priority: [1, 2, 3, 4].includes(t.priority) ? t.priority : 4,
        ...(labels.length ? { labels } : {}), ...(typeof t.duration === 'number' && t.duration >= 1 ? { duration: t.duration } : {}),
        section: sectionOf(t), parent: t.parentId && at.has(t.parentId) ? /** @type {number} */ (at.get(t.parentId)) : null,
      };
    }),
  };
}

/**
 * The records a new project from a template writes, in the order to write them (project, sections, then tasks, a parent
 * before its subtasks). Nothing is dated or done. Orders run 1..n among siblings.
 * @param {Template} tpl @param {{ labels: import('./items.js').Label[], projects: import('./items.js').Project[] }} have the labels (matched by name) and projects now
 * @param {{ id: () => string, now?: () => number, name?: string }} o
 * @returns {{ project: Record<string, any>, sections: Record<string, any>[], tasks: Record<string, any>[] }}
 */
export function planFrom(tpl, { labels, projects }, { id, now = Date.now, name }) {
  const at = now(), pid = id();
  const roots = projects.filter(p => !p.parentId);
  const lastOrder = roots.reduce((m, p) => Math.max(m, typeof p.order === 'number' ? p.order : 0), 0);
  const project = { id: pid, name: String(name ?? tpl.name).trim().slice(0, 120) || 'Untitled', color: cleanColor(tpl.color), parentId: null,
    order: lastOrder + 1, favorite: false, view: tpl.view === 'board' ? 'board' : 'list', createdAt: at };
  const sections = (tpl.sections ?? []).slice(0, MAX_SECTIONS).map((n, i) => ({ id: id(), name: String(n).trim().slice(0, 120) || 'Untitled', projectId: pid, order: i + 1, createdAt: at }));
  const byName = new Map(labels.map(l => [l.name.toLowerCase(), l.id]));
  const list = (tpl.tasks ?? []).slice(0, MAX_TASKS);
  const ids = list.map(() => id());
  /** @type {Map<string, number>} */
  const next = new Map();
  const tasks = list.flatMap((t, i) => {
    const title = String(t.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!title) return [];
    const parent = Number.isInteger(t.parent) && /** @type {number} */ (t.parent) >= 0 && /** @type {number} */ (t.parent) < i ? /** @type {number} */ (t.parent) : null;
    const sec = parent !== null ? list[parent].section : t.section;
    const sectionId = Number.isInteger(sec) && sections[/** @type {number} */ (sec)] ? sections[/** @type {number} */ (sec)].id : null;
    const key = `${sectionId ?? ''}|${parent === null ? '' : ids[parent]}`, order = (next.get(key) ?? 0) + 1;
    next.set(key, order);
    const lab = [...new Set((t.labels ?? []).map(n => byName.get(String(n).toLowerCase())).filter(Boolean))].slice(0, 20);
    return [{ id: ids[i], title, description: t.description ? String(t.description).slice(0, 16000) : null, projectId: pid, sectionId,
      parentId: parent === null ? null : ids[parent], order, priority: [1, 2, 3, 4].includes(t.priority) ? t.priority : 4, labels: lab,
      due: null, deadline: null, duration: typeof t.duration === 'number' && t.duration >= 1 ? Math.min(1440, Math.round(t.duration)) : null,
      done: false, createdAt: at }];
  });
  return { project, sections, tasks };
}
