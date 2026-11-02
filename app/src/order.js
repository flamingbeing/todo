// Manual order: every project, section and task has a number, and a list shows them by it. A move or an insert takes
// the midpoint of its neighbours, so only the moved record is saved; when two neighbours get too close to split, the
// whole list is renumbered 1..n (a rare, larger save).
import { isOpen } from './tree.js';

const GAP = 1e-6;

/**
 * The order for a record placed between two neighbours (null: no neighbour on that side).
 * @param {number | null | undefined} before @param {number | null | undefined} after @returns {number}
 */
export function orderBetween(before, after) {
  const a = typeof before === 'number' ? before : null, b = typeof after === 'number' ? after : null;
  if (a === null && b === null) return 1;
  if (a === null) return /** @type {number} */ (b) - 1;
  if (b === null) return a + 1;
  return (a + b) / 2;
}

/** whether two neighbours are too close for a record between them @param {number} a @param {number} b */
export const tooClose = (a, b) => Math.abs(b - a) < GAP;

/** after the last of a list @param {{ order?: unknown }[]} list @returns {number} */
export const orderAtEnd = list => orderBetween(list.reduce((m, x) => (typeof x.order === 'number' && x.order > m ? x.order : m), 0), null);

/** @template {{ order?: unknown }} T @param {T[]} list @returns {T[]} by order (a missing order sorts last) */
export const byOrder = list => [...list].sort((x, y) => (typeof x.order === 'number' ? x.order : Infinity) - (typeof y.order === 'number' ? y.order : Infinity));

/**
 * Where a record goes when it is put at index i of a list (in order, without it): its new order, and the records to
 * renumber first when the gap there is too small (each with its new order).
 * @template {{ id: string, order?: unknown }} T @param {T[]} list @param {number} i
 * @returns {{ order: number, renumber: { item: T, order: number }[] }}
 */
export function placeAt(list, i) {
  const sorted = byOrder(list), at = Math.max(0, Math.min(i, sorted.length));
  const num = (/** @type {T | undefined} */ x) => (x && typeof x.order === 'number' ? x.order : null);
  const a = num(sorted[at - 1]), b = num(sorted[at]);
  if (a !== null && b !== null && tooClose(a, b)) {
    const renumber = sorted.map((item, k) => ({ item, order: k < at ? k + 1 : k + 2 }));
    return { order: at + 1, renumber };
  }
  return { order: orderBetween(a, b), renumber: [] };
}

/** @typedef {{ task: { id: string, order?: unknown, collapsed?: boolean | null }, depth: number, kids?: number }} TreeLine  kids: how many subtasks the task has, shown or not */

/**
 * Where a dragged task lands in a list drawn as a tree (lines without the task and its subtasks; at: the gap it is
 * dropped in, 0..lines.length): the depth wanted (from how far it was pulled sideways) is kept within what the gap
 * allows (at most one deeper than the line above, none deeper under a parent that shows folded (it has subtasks and is not
 * open, the same rule as tree.js isOpen: a drop there would hide the task), at least as deep as the line below, no deeper than MAX_DEPTH with
 * its own subtasks); the parent is the nearest line above one level up; index is its place among that parent's lines.
 * @template {TreeLine} L @param {L[]} lines @param {number} at @param {number} want @param {number} [height] how deep
 * the moved task's own subtasks go @param {number} [maxDepth]
 * @returns {{ depth: number, parentId: string | null, siblings: L['task'][], index: number }}
 */
export function placeInTree(lines, at, want, height = 0, maxDepth = 4) {
  at = Math.max(0, Math.min(at, lines.length));
  const prev = lines[at - 1], next = lines[at];
  const max = Math.max(0, Math.min(prev ? prev.depth + (prev.kids && !isOpen(prev.task) ? 0 : 1) : 0, maxDepth - height));
  const min = Math.min(next ? next.depth : 0, max);
  const depth = Math.max(min, Math.min(max, Math.round(want)));
  let p = -1;
  if (depth > 0) for (let i = at - 1; i >= 0; i--) if (lines[i].depth === depth - 1) { p = i; break; }
  // the parent's lines at this depth: from just after it to where the tree climbs back above it
  /** @type {L['task'][]} */
  const siblings = [];
  let index = 0;
  for (let i = p + 1; i < lines.length; i++) {
    if (lines[i].depth < depth) break;
    if (lines[i].depth !== depth) continue;
    if (i < at) index++;
    siblings.push(lines[i].task);
  }
  return { depth, parentId: p < 0 ? null : lines[p].task.id, siblings, index };
}

/** a list's records numbered 1..n in the order given, only those whose number changes @template {{ order?: unknown }} T @param {T[]} list @param {keyof T & string} [key] */
export const renumbered = (list, key = /** @type {keyof T & string} */ ('order')) =>
  list.map((item, k) => ({ item, order: k + 1 })).filter(x => x.item[key] !== x.order);
