// The old shared space (spaces/_, before 4 Nov 2026, when every member shared one list): an admin's first sign-in on a
// device, with their own space still empty, copies it into their own space once, keeping ids, through the write queue.
// Only admins may read the old space (the rules). Loaded only then (cloud.js), so startup does not carry it.

/** what is copied, parents first (sections need their projects, tasks their sections and parents) */
export const MOVE_ORDER = ['projects', 'sections', 'labels', 'filters', 'tasks', 'comments', 'templates'];
/** the engine's own fields, written afresh by the save */
const DROP = ['serverAt', '_deleted'];

/**
 * The records to write for one collection: the old ones not deleted and not already in the person's space.
 * @param {{ id: string, data: Record<string, unknown> }[]} old @param {Set<string>} have
 * @returns {Record<string, unknown>[]}
 */
export function toCopy(old, have) {
  return old.filter(d => !d.data._deleted && !have.has(d.id))
    .map(d => ({ ...Object.fromEntries(Object.entries(d.data).filter(([k]) => !DROP.includes(k))), id: d.id }));
}

/** whether the person's own space has nothing of theirs yet (the Inbox alone counts as empty) @param {import('./items.js').Data} data */
export const isEmpty = data => !data.tasks.length && !data.projects.some(p => !p.inbox) && !data.labels.length && !data.filters.length;

/**
 * @param {{ list: (coll: string) => Promise<{ id: string, data: Record<string, unknown> }[]>, data: () => import('./items.js').Data,
 *   write: (coll: string, rec: Record<string, unknown>) => Promise<string>, still: () => boolean }} o
 * @returns {Promise<number>} how many records were written (-1: stopped, the person changed)
 */
export async function moveShared({ list, data, write, still }) {
  if (!isEmpty(data())) return 0;
  let n = 0;
  for (const coll of MOVE_ORDER) {
    const have = new Set((/** @type {any} */ (data())[coll] || []).map((/** @type {{ id: string }} */ r) => r.id));
    for (const rec of toCopy(await list(coll), have)) {
      if (!still()) return -1;
      if (!(await write(coll, rec))) n++;
    }
  }
  return n;
}
