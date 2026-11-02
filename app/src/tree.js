// Subtasks: a task's parentId names the task it sits under, up to MAX_DEPTH levels down. The tree a list draws, how
// deep a task is, its counts, and every task under one (a tick, a move or a delete takes them along).

export const MAX_DEPTH = 4;

/** @typedef {{ id: string, parentId?: string | null, order?: unknown, done?: boolean, collapsed?: boolean | null }} Node */
/** @template {Node} T @typedef {{ task: T, depth: number, kids: number, doneKids: number }} Line */

/** the children of each task, in order @template {Node} T @param {T[]} tasks @returns {Map<string, T[]>} */
export function childrenOf(tasks) {
  /** @type {Map<string, T[]>} */
  const by = new Map();
  for (const t of tasks) if (t.parentId) (by.get(t.parentId) ?? by.set(t.parentId, []).get(t.parentId))?.push(t);
  for (const list of by.values()) list.sort(orderOf);
  return by;
}
const num = (/** @type {unknown} */ v) => (typeof v === 'number' ? v : Infinity);
/** @param {Node} a @param {Node} b */
const orderOf = (a, b) => num(a.order) - num(b.order);

/** how many levels down a task is (0: a top task); a loop or a missing parent ends the count @template {Node} T @param {T} task @param {Map<string, T>} byId */
export function depthOf(task, byId) {
  let d = 0, at = task;
  const seen = new Set([task.id]);
  while (at.parentId && byId.has(at.parentId) && !seen.has(at.parentId)) {
    at = /** @type {T} */ (byId.get(at.parentId)); seen.add(at.id); d++;
  }
  return d;
}

/** every task under one, at any depth (not the task itself) @template {Node} T @param {string} id @param {T[]} tasks @returns {T[]} */
export function descendants(id, tasks) {
  const kids = childrenOf(tasks), out = /** @type {T[]} */ ([]), seen = new Set([id]);
  const walk = (/** @type {string} */ at) => {
    for (const k of kids.get(at) ?? []) if (!seen.has(k.id)) { seen.add(k.id); out.push(k); walk(k.id); }
  };
  walk(id);
  return out;
}

/** how deep the tree under a task goes (0: no subtasks) @template {Node} T @param {string} id @param {T[]} tasks */
export function heightOf(id, tasks) {
  const kids = childrenOf(tasks), seen = new Set([id]);
  const h = (/** @type {string} */ at) => {
    let m = 0;
    for (const k of kids.get(at) ?? []) if (!seen.has(k.id)) { seen.add(k.id); m = Math.max(m, 1 + h(k.id)); }
    return m;
  };
  return h(id);
}

/** whether a task (with its own subtasks) may go under parent: no loop, and no deeper than MAX_DEPTH @template {Node} T @param {T} task @param {T} parent @param {T[]} tasks */
export function canNest(task, parent, tasks) {
  if (task.id === parent.id || descendants(task.id, tasks).some(t => t.id === parent.id)) return false;
  return depthOf(parent, new Map(tasks.map(t => [t.id, t]))) + 1 + heightOf(task.id, tasks) <= MAX_DEPTH;
}

/**
 * The lines a list draws: each top task, then, only for a parent that was opened (collapsed === false), its open
 * subtasks under it (deeper each level). A parent starts folded: its row shows the "1/4" count and a chevron to open it.
 * kids and doneKids count a task's own children, done or not (its "1/4").
 * @template {Node} T @param {T[]} tops  the top tasks, in order @param {T[]} all  every task (their subtasks among them)
 * @param {{ open?: (t: T) => boolean }} [o]  which subtasks show (default: not done)
 * @returns {Line<T>[]}
 */
export function flatten(tops, all, { open = t => !t.done } = {}) {
  const kids = childrenOf(all), out = /** @type {Line<T>[]} */ ([]), seen = new Set();
  const add = (/** @type {T} */ t, /** @type {number} */ depth) => {
    if (seen.has(t.id)) return;
    seen.add(t.id);
    const mine = kids.get(t.id) ?? [];
    out.push({ task: t, depth, kids: mine.length, doneKids: mine.filter(k => k.done).length });
    if (t.collapsed === false && depth < MAX_DEPTH) for (const k of mine) if (open(k)) add(k, depth + 1);
  };
  for (const t of tops) add(t, 0);
  return out;
}

/** whether a parent's subtasks show in a list: only after its chevron opened them (collapsed is false), never by default @param {{ collapsed?: boolean | null }} t */
export const isOpen = t => t.collapsed === false;

/** the subtask count a row shows, "1/4", or '' with none @param {{ kids: number, doneKids: number }} line */
export const countText = line => (line.kids ? `${line.doneKids}/${line.kids}` : '');
