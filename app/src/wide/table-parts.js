// The table layout's pure parts (wide/table.js draws it; app/test/wide-table.unit.test.mjs tests these).

/** the table's columns, in order: the task (its ring, title and menu), then a chip each */
export const COLUMNS = /** @type {const} */ ([
  { key: 'task', label: 'Task' },
  { key: 'date', label: 'Date' },
  { key: 'priority', label: 'Priority' },
  { key: 'project', label: 'Project' },
  { key: 'labels', label: 'Labels' },
]);

/** the layout a list is drawn in: a table only at 840 px and up (under it, the list's own: a list, or a project's board);
 * a board, a calendar or a list as chosen @param {string} layout  Display's layout ('' = the list's own) @param {boolean} wide  840 px and up */
export const drawnLayout = (layout, wide) => layout === 'table' && !wide ? '' : layout;

/** how many of a view's Display choices differ from its defaults (the wide button's "Display: n"; the layout counts as one)
 * @param {Record<string, unknown>} d  the view's choices @param {Record<string, unknown>} plain  its defaults */
export function changedCount(d, plain) {
  let n = 0;
  for (const k of Object.keys(plain)) if (JSON.stringify(d[k]) !== JSON.stringify(plain[k])) n++;
  return n;
}
