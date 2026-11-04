// The wide side bar's pure parts (side.js uses them; kept apart so the unit tests load them without a page).
import { INBOX } from '../items.js';

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
