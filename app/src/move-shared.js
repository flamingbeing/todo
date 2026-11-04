// The old shared space (spaces/_, before 4 Nov 2026, when every member shared one list): an admin's first sign-in on a
// device, with their own space still empty, copies it into their own space once, keeping ids, through the write queue.
// Only admins may read the old space (the rules). Loaded only then (cloud.js), so startup does not carry it.

let bringing = false;

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

/**
 * Once per account on this device (a mark in localStorage), after the server's copy has arrived: the copy, if the
 * person's own space is still empty. Errors are dropped: it is tried again at the next start.
 * @param {{ app: any, uid: string, sdk: () => Promise<any>, data: () => import('./items.js').Data,
 *   write: (coll: string, rec: Record<string, unknown>) => Promise<string>, listening: () => string }} o
 */
export async function bringShared({ app, uid, sdk, data, write, listening }) {
  const key = `${app.name || 'app'}:moved-shared:${uid}`;
  try { if (localStorage.getItem(key)) return; } catch { /* no storage: try anyway */ }
  if (bringing) return;
  bringing = true;
  try {
    for (let i = 0; i < 60 && !app.sync.facts().confirmed; i++) await new Promise(r => setTimeout(r, 500));
    if (!app.sync.facts().confirmed || listening() !== uid) return;
    const { F, db } = await sdk();
    const n = await moveShared({
      list: async coll => (await F.getDocs(F.collection(db, 'spaces', '_', coll))).docs.map((/** @type {any} */ d) => ({ id: d.id, data: d.data() })),
      data, write, still: () => listening() === uid,
    });
    if (n >= 0) try { localStorage.setItem(key, '1'); } catch { /* tried again next time */ }
  } catch { /* tried again at the next start */ } finally { bringing = false; }
}
