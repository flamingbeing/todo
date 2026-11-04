// The wide dialogs' pure parts (wide/task-modal.js and wide/settings-modal.js use them; kept apart so the unit tests
// load them without a page).

/**
 * The tasks before and after one in the list it was opened from (pure): the ids in the list's order (a task shown
 * twice counts where it first shows); null at either end, or when the task is not in the list.
 * @param {string[]} ids @param {string} id @returns {{ prev: string | null, next: string | null }}
 */
export const neighbours = (ids, id) => {
  const list = [...new Set(ids)], i = list.indexOf(id);
  return { prev: i > 0 ? list[i - 1] : null, next: i >= 0 && i < list.length - 1 ? list[i + 1] : null };
};

/**
 * Whether a Settings page's row stays in the nav for what is typed in its search (pure): every word typed is in the
 * page's title or in the words on the page, ignoring case; nothing typed keeps every row.
 * @param {string} query @param {string} title @param {string} [words]
 */
export const navMatch = (query, title, words = '') => {
  const hay = `${title} ${words}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
};

/** the rail's blocks, top to bottom (the task dialog's right side) */
export const RAIL = /** @type {const} */ ([
  ['project', 'Project'], ['date', 'Date'], ['deadline', 'Deadline'], ['priority', 'Priority'], ['labels', 'Labels'], ['reminders', 'Reminders'],
]);
