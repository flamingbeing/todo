// The list pages' hand gestures, loaded after the first screen (lazyModules): a row swiped sideways (row-swipe.js),
// held to move or let go for its menu (row-drag.js), the + button dragged to a place, select mode (screens/select.js, also
// started by two fingers dragged down the rows: two-finger.js), and the tab bar held for Settings > Tab bar (tab-hold.js). Each list host is wired once; its rows come and go under it.
import { swipeRows } from './row-swipe.js';
import { dragRows, dragFab } from './row-drag.js';
import { twoFingerSelect } from './two-finger.js';
import { holdTabBar, openTabBarSettings } from './tab-hold.js';
import { INBOX } from '../items.js';
import { holdMenu, startSelect, tickRows, selecting, endSelect, scheduleTasks, deleteTasks } from '../screens/select.js';

/** @typedef {import('../screens/views.js').Ctx} Ctx */
/**
 * @typedef {object} Lists
 * @property {Record<string, 'tree' | 'days' | null>} hosts  each list host's id and its kind
 * @property {() => string} top  the host on screen (its id), or ''
 * @property {() => string} projectId  the project the project page shows
 * @property {(o: import('../screens/views.js').AddContext) => void} add  quick add for a place
 * @property {(projectId: string) => void} newSection
 * @property {() => string} view  the list on top, as Display keeps it
 */

/** @param {Ctx} ctx @param {Lists} l */
export function wire(ctx, l) {
  const settings = ctx.app.settings;
  const way = (/** @type {string} */ k, /** @type {unknown} */ d) => { try { return /** @type {any} */ (settings.get(k) ?? d); } catch { return d; } };
  const ways = () => ({ right: way('swipeRight', 'complete'), left: way('swipeLeft', 'schedule') });
  const can = () => ctx.canWrite() && !selecting();
  // Settings > General "Swipe board cards": a board's cards take the swipe actions (the html mark lets app.css keep the browser's pan off a card)
  const boardSwipe = () => way('boardSwipe', false) === true;
  const markBoard = () => document.documentElement.toggleAttribute('data-board-swipe', boardSwipe());
  settings.watch('boardSwipe', markBoard);
  markBoard();
  const taskOf = (/** @type {string | undefined} */ id) => ctx.data().tasks.find(t => t.id === id);
  for (const [id, kind] of Object.entries(l.hosts)) {
    const host = document.getElementById(id);
    if (!host) continue;
    swipeRows(host, { ways, can, board: boardSwipe, run: (w, tid, row) => {
      const t = taskOf(tid);
      if (!t) return false;
      if (w === 'complete') { ctx.complete(t, row); return true; }
      if (w === 'schedule') { scheduleTasks(ctx, [t]); return true; }
      if (w === 'delete') return deleteTasks(ctx, [t]);
      return false;
    } });
    twoFingerSelect(host, { can: () => ctx.canWrite(), tick: ids => tickRows(ctx, host, ids) });
    dragRows(host, ctx, { kind: () => kind, projectId: () => (id === INBOX ? INBOX : l.projectId()), can, view: l.view, menu: (t, row) => holdMenu(ctx, t, row, host) });
  }
  const bar = document.querySelector('nav.ui-tabbar');
  if (bar instanceof HTMLElement) holdTabBar(bar, () => { void openTabBarSettings(); });
  const fab = document.getElementById('fab');
  if (fab) dragFab(fab, ctx, { kind: () => l.hosts[l.top()] ?? null, projectId: () => (l.top() === INBOX ? INBOX : l.projectId()),
    host: () => (l.top() ? document.getElementById(l.top()) : null), add: l.add, newSection: l.newSection });
}

/** select mode on a list host @param {Ctx} ctx @param {string} hostId */
export function select(ctx, hostId) {
  const host = document.getElementById(hostId);
  if (host && ctx.canWrite()) startSelect(ctx, host);
}
export { endSelect, selecting };
