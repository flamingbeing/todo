// The wide list pages' pure parts (wide/list.js and wide/hover.js use them; kept apart so the unit tests load them
// without a page).
import { INBOX } from '../items.js';

/** the list pages that take the wide look (their page ids), and each one's list host */
export const LIST_PAGES = ['today-page', 'inbox-page', 'upcoming-page', 'project-page', 'place-page'];

/**
 * What quick add starts with from an inline "Add task" row (pure): a section's row adds to that section, Today's to
 * the Inbox on that day, a project's (the Inbox's too) to that project.
 * @param {'today' | 'inbox' | 'project'} host  the list the row is in
 * @param {{ today: string, projectId?: string, sectionId?: string }} at
 * @returns {import('../screens/view-types.js').AddContext}
 */
export const addPreset = (host, { today, projectId, sectionId }) => {
  if (host === 'today') return { projectId: INBOX, due: { date: today } };
  const pid = host === 'inbox' ? INBOX : projectId || INBOX;
  return sectionId ? { projectId: pid, sectionId } : { projectId: pid };
};

/**
 * The words over a project's title (pure): "My Projects", then its parents from the top; none for the Inbox.
 * @param {{ id: string, name: string, parentId?: string | null }[]} projects @param {string} id
 * @returns {string[]}
 */
export const crumbs = (projects, id) => {
  if (!id || id === INBOX) return [];
  const byId = new Map(projects.map(p => [p.id, p])), up = [];
  const seen = new Set([id]);
  for (let p = byId.get(byId.get(id)?.parentId ?? ''); p && !seen.has(p.id); p = byId.get(p.parentId ?? '')) { seen.add(p.id); up.unshift(p.name); }
  return ['My Projects', ...up];
};
