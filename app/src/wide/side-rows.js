// The wide side bar's pure parts (side.js uses them; kept apart so the unit tests load them without a page).
import { INBOX } from '../items.js';
import { dueOf } from '../dates.js';
import { isTask, projectOf } from '../tasks.js';

/** @typedef {import('../items.js').Task} Task */

/** the places, in the side bar's order */
export const SIDE_ROWS = ['search', 'inbox', 'today', 'upcoming', 'filters', 'reporting'];
export const TABS = ['search', 'inbox', 'today', 'upcoming'];

/**
 * The places the side bar lists (pure): all but one that is neither on the tab bar nor in Browse (a tab off the bar
 * shows in Browse unless Settings hides it there; Filters & Labels and Reporting only ever show in Browse).
 * @param {(id: string) => boolean} offBar @param {unknown} browseHidden
 */
export const sideRows = (offBar, browseHidden) => {
  const gone = Array.isArray(browseHidden) ? browseHidden : [];
  return SIDE_ROWS.filter(id => !(gone.includes(id) && (!TABS.includes(id) || offBar(id))));
};

/** the page on top to the row it lights (pure) @param {string} top @param {string} project @param {number} depth */
export const litRow = (top, project, depth) => {
  if (top === 'project-page') return project === INBOX ? 'inbox' : `project:${project}`;
  if (top === 'filters-page' || top === 'place-page') return 'filters';
  if (top === 'reporting-page' || top === 'productivity-page') return 'reporting';
  return /^(search|inbox|today|upcoming)-page$/.test(top) && (depth === 0 || top === 'search-page') ? top.slice(0, -5) : '';
};

/** The wide side bar's counts (pure): the open tasks (sub-tasks too) in the Inbox, due today or before (Today), due later
 * (Upcoming) and per project @param {Task[]} tasks @param {string} today
 * @returns {{ inbox: number, today: number, upcoming: number, projects: Record<string, number> }} */
export function sideCounts(tasks, today) {
  const c = { inbox: 0, today: 0, upcoming: 0, projects: /** @type {Record<string, number>} */ ({}) };
  for (const t of tasks) {
    if (!isTask(t) || t.done) continue;
    const p = projectOf(t), d = dueOf(t.due)?.date;
    c.projects[p] = (c.projects[p] ?? 0) + 1;
    if (p === INBOX) c.inbox++;
    if (d) { if (d <= today) c.today++; else c.upcoming++; }
  }
  return c;
}
