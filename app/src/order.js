// Manual order: every project, section and task has a number, and a list shows them by it. A move or an insert takes
// the midpoint of its neighbours, so only the moved record is saved; when two neighbours get too close to split, the
// whole list is renumbered 1..n (a rare, larger save).
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
