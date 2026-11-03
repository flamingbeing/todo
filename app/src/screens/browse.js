// Browse (#browse): the person's pill and the Settings gear in the top bar's row (#browse-top, shown while Browse is
// the screen on top: views.js), then cards of rows: the Inbox, Today, Upcoming
// Completed and Filters & Labels; the favourite projects, labels and filters; and "My Projects" with its sub-projects under each and a + for a new one.
// Counts show when the showCounts option is on. The fold of "My Projects" is kept on this device. "Manage projects"
// (under them) opens a list to put them in order: a project's grip dragged (or moved with the arrow keys) moves it
// among the projects beside it at its level, its sub-projects with it.
import { icon, gripDrag } from '@core/ui';
import { ICONS } from '../icons.js';
import { $ } from '../dom.js';
import { INBOX } from '../items.js';
import { isTask, labelsOf } from '../tasks.js';
import { projectTree, projectCounts, todayCount, upcomingCount } from '../arrange.js';
import { MORE } from '../icons-more.js';
import { countQuery } from '../query.js';
import { queryContext } from './named-sheet.js';
import { openFiltersLabels } from './filters.js';
import { colorHex } from '../colors.js';
import { dayKey } from '../dates.js';
import { byOrder, placeAt } from '../order.js';
import { screens, tabButton, openSettingsPage } from '../shell.js';
import { el, sheetHead } from './pick.js';

/** @typedef {import('./views.js').Ctx} Ctx */
const FOLD_KEY = 'browse:projects-folded';

/** a Browse row: an icon at 16, the name at 56, a count and a chevron
 * @param {{ label: string, ic: import('app-ui/icons/lucide.js').IconNodes, color?: string, count?: number | null, depth?: number, flat?: boolean, run: () => void }} o */
function row({ label, ic, color, count, depth, flat, run }) {
  const li = el('li', '');
  const b = /** @type {HTMLButtonElement} */ (el('button', 'td-browse-row'));
  b.type = 'button';
  if (depth) b.style.setProperty('--depth', String(depth));
  const i = icon(ic, { class: 'td-browse-icon' });
  if (color) i.style.color = color;
  b.append(i, el('span', 'td-browse-label', label));
  if (typeof count === 'number' && count > 0) b.append(el('span', 'td-browse-count', String(count)));
  if (!flat) b.append(icon(ICONS.chevronRight, { class: 'td-browse-chevron' }));
  b.addEventListener('click', run);
  li.append(b);
  return li;
}

/** @param {string} label @param {HTMLElement[]} rows */
const card = (label, rows) => {
  const ul = el('ul', 'td-card td-browse-card');
  ul.setAttribute('aria-label', label);
  ul.append(...rows);
  return ul;
};

/** the tab a row stands for, as a tap on the tab bar would @param {string} id */
const tab = id => /** @type {HTMLElement | null} */ (document.querySelector(`.ui-tabbar > [data-tab-id="${id}"]`))?.click();

let watching = false;

/** @param {Ctx} ctx @param {HTMLElement} host */
export function drawBrowse(ctx, host) {
  if (!watching) { watching = true; for (const k of ['showCounts', 'browseHidden', 'tabs']) ctx.app.settings.watch(k, () => drawBrowse(ctx, host)); }
  const data = ctx.data(), today = dayKey(), counts = projectCounts(data.tasks);
  const showCounts = !!ctx.app.settings.get('showCounts');
  const n = (/** @type {number} */ v) => (showCounts ? v : null);

  // the top: the person, and the gear, in the bar's row (index.html #browse-top)
  const top = $('browse-top');
  const me = el('span', 'td-pill'), u = ctx.user();
  // (a name, or an email's part before the @: short enough for the pill, cut with "…" if still long)
  const who = String(u?.name ?? '').trim().split('@')[0];
  const face = el('span', 'td-avatar');
  if (u?.photo) { const img = Object.assign(document.createElement('img'), { src: u.photo, alt: '', referrerPolicy: 'no-referrer' }); face.append(img); }
  else if (who) face.textContent = who.charAt(0).toUpperCase();
  else face.append(icon(MORE.user));
  me.append(face, el('span', 'td-pill-name', who || 'Signed out'));
  const gear = /** @type {HTMLButtonElement} */ (el('button', 'td-round'));
  gear.type = 'button';
  gear.id = 'browse-settings';
  gear.setAttribute('aria-label', 'Settings');
  gear.append(icon(MORE.settings));
  gear.addEventListener('click', () => screens()?.push('#settings-page'));
  const bell = /** @type {HTMLButtonElement} */ (el('button', 'td-round'));
  bell.type = 'button';
  bell.id = 'browse-bell';
  bell.setAttribute('aria-label', 'Notification settings');
  bell.append(icon(MORE.bell));
  bell.addEventListener('click', () => { void openSettingsPage('Notifications'); });
  const end = el('span', 'td-bar-browse-end');
  end.append(bell, gear);
  top.replaceChildren(me, end);

  // Inbox, Today and Upcoming show here only while they are off the tab bar; Settings > Navigation menu hides any row
  // (option browseHidden, this device; Completed always stays)
  const hidden = /** @type {string[]} */ (ctx.app.settings.get('browseHidden') ?? []);
  const shown = (/** @type {string} */ id) => !hidden.includes(id);
  const offBar = (/** @type {string} */ id) => { const t = tabButton(id); return !t || t.hidden || t.hasAttribute('data-off-bar'); };
  const tab = (/** @type {string} */ id, /** @type {string} */ label, /** @type {import('app-ui/icons/lucide.js').IconNodes} */ ic, /** @type {number} */ c) => (shown(id) && offBar(id)
    ? [row({ label, ic, flat: true, count: n(c), run: () => tabButton(id)?.click() })] : []);
  const places = card('Places', [
    ...tab('inbox', 'Inbox', ICONS.inbox, counts.get(INBOX) ?? 0),
    ...tab('today', 'Today', ICONS.calendar, todayCount(data.tasks, today)),
    ...tab('upcoming', 'Upcoming', MORE.calendarDays, upcomingCount(data.tasks, today)),
    ...(shown('search') ? [row({ label: 'Search', ic: MORE.search, flat: true, run: () => { const f = /** @type {HTMLInputElement | null} */ (document.getElementById('search-text')); if (f) f.value = ''; screens()?.push('#search-page'); } })] : []),
    ...(shown('filters') ? [row({ label: 'Filters & Labels', ic: MORE.layoutGrid, flat: true, run: openFiltersLabels })] : []),
    ...(shown('reporting') ? [row({ label: 'Reporting', ic: MORE.trendingUp, flat: true, run: () => screens()?.push('#productivity-page') })] : []),
    row({ label: 'Completed', ic: ICONS.circleCheck, flat: true, run: () => screens()?.push('#completed-page') }),
    ...(shown('templates') && ctx.canWrite() ? [row({ label: 'Templates', ic: MORE.layoutTemplate, flat: true, run: () => { void import('./templates.js').then(m => m.newFromTemplate(ctx)); } })] : []),
  ]);
  places.classList.add('is-flat');

  const projectRow = (/** @type {import('../items.js').Project} */ p, /** @type {number} */ depth) => row({
    label: p.name, ic: ICONS.hash, color: colorHex(p.color), depth, flat: true, count: n(counts.get(p.id) ?? 0), run: () => ctx.openProject(p.id) });

  const parts = [places];
  const favs = byOrder(data.projects.filter(p => p.favorite && p.id !== INBOX && p.name));
  const favLabels = byOrder(data.labels.filter(l => l && l.favorite && l.name)), favFilters = byOrder(data.filters.filter(f => f && f.favorite && f.name));
  if (favs.length || favLabels.length || favFilters.length) {
    const h = el('h2', 'td-browse-head');
    h.append(el('span', '', 'Favorites'));
    const open = data.tasks.filter(t => isTask(t) && !t.done), qc = queryContext(ctx);
    parts.push(h, card('Favorites', [
      ...favs.map(p => projectRow(p, 0)),
      ...favLabels.map(l => row({ label: l.name, ic: ICONS.tag, flat: true, color: colorHex(l.color), count: n(open.filter(t => labelsOf(t, data.labels).includes(l)).length), run: () => ctx.openPlace('labels', l.id) })),
      ...favFilters.map(f => { const c = countQuery(f.query, data.tasks, qc); return row({ label: f.name, ic: MORE.droplet, flat: true, color: colorHex(f.color), count: n(c.error ? 0 : c.count), run: () => ctx.openPlace('filters', f.id) }); }),
    ]));
  }

  // My Projects: a fold, and a + for a new one
  const folded = localStorage.getItem(FOLD_KEY) === '1';
  const head = el('div', 'td-browse-head');
  const fold = /** @type {HTMLButtonElement} */ (el('button', 'td-browse-fold'));
  fold.type = 'button';
  fold.setAttribute('aria-expanded', String(!folded));
  fold.append(el('span', '', 'My Projects'), el('span', 'td-browse-chip', `${data.projects.filter(p => p.id !== INBOX && p.name).length}`));
  fold.addEventListener('click', () => { localStorage.setItem(FOLD_KEY, folded ? '0' : '1'); drawBrowse(ctx, host); });
  head.append(fold);
  const tail = el('span', 'td-browse-head-end');
  head.append(tail);
  if (ctx.canWrite()) {
    const add = /** @type {HTMLButtonElement} */ (el('button', 'td-icon-btn td-browse-add'));
    add.type = 'button';
    add.setAttribute('aria-label', 'Add project');
    add.append(icon(ICONS.plus));
    add.addEventListener('click', () => ctx.openProjectSheet({}));
    tail.append(add);
  }
  const chev = /** @type {HTMLButtonElement} */ (el('button', 'td-icon-btn td-browse-chev'));
  chev.type = 'button';
  chev.tabIndex = -1;
  chev.setAttribute('aria-hidden', 'true');
  chev.append(icon(folded ? ICONS.chevronDown : ICONS.chevronUp));
  chev.addEventListener('click', () => fold.click());
  tail.append(chev);
  parts.push(head);
  if (!folded) {
    const tree = projectTree(data.projects);
    if (tree.length) {
      const rows = tree.map(({ project, depth }) => projectRow(project, depth));
      if (ctx.canWrite()) { const m = row({ label: 'Manage projects', ic: MORE.pencil, flat: true, run: () => manageProjects(ctx) }); m.classList.add('is-manage'); rows.push(m); }
      parts.push(card('My Projects', rows));
    }
    else parts.push(el('p', 'td-browse-none', ctx.canWrite() ? 'No projects yet. Tap + to add one.' : 'No projects yet.'));
  }
  host.replaceChildren(...parts);
}

/** the Manage projects sheet (#pick-sheet): every project in Browse's order, a grip on each @param {Ctx} ctx */
export function manageProjects(ctx) {
  const d = /** @type {HTMLDialogElement} */ (document.getElementById('pick-sheet'));
  const body = /** @type {HTMLElement} */ (d.querySelector('[data-fill]'));
  const draw = (/** @type {string} */ focus = '') => {
    const tree = projectTree(ctx.data().projects.map(p => ({ ...p, collapsed: false })));
    const ids = new Set(tree.map(x => x.project.id));
    const up1 = (/** @type {import('../items.js').Project} */ p) => (p.parentId && ids.has(p.parentId) ? p.parentId : '');
    const list = el('ul', 'td-card td-manage');
    list.setAttribute('aria-label', 'Projects in order');
    list.dataset.noGesture = '';   // (a grip's pull is the list's, not the sheet's)
    /** puts the project at row `from` where row `to` is (the flat list), among those at its level; its grip keeps the
     * focus when the keys moved it @param {number} from @param {number} to @param {boolean} [keys] */
    const drop = (from, to, keys = false) => {
      const flat = tree.map(x => x.project), [moved] = flat.splice(from, 1);
      flat.splice(to, 0, moved);
      const level = flat.filter(p => up1(p) === up1(moved)), at = level.indexOf(moved);
      if (byOrder(level).every((p, k) => p === level[k])) return;   // (still in its place among them)
      // just the moved one gets a new number (all of them only when the gap there is too small)
      const { order, renumber } = placeAt(level.filter(p => p !== moved), at);
      void ctx.app.orderProjects([...renumber, { item: moved, order }]).then(() => draw(keys ? moved.id : ''));
    };
    list.append(...tree.map(({ project, depth }, i) => {
      const li = el('li', 'td-manage-row');
      if (depth) li.style.setProperty('--depth', String(depth));
      const grip = /** @type {HTMLButtonElement} */ (el('button', 'td-icon-btn td-manage-grip'));
      grip.type = 'button';
      grip.dataset.id = project.id;
      grip.setAttribute('aria-label', `Move ${project.name}`);
      grip.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown');
      grip.append(icon(MORE.gripVertical));
      grip.addEventListener('pointerdown', e => gripDrag(e, list, drop));
      // the keys: past the next project at its level, up or down
      grip.addEventListener('keydown', e => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        // (deeper rows on the way are the next one's sub-projects; a shallower one is the end of this level)
        let k = i;
        do k += e.key === 'ArrowUp' ? -1 : 1; while (k >= 0 && k < tree.length && tree[k].depth > depth);
        if (k < 0 || k >= tree.length || up1(tree[k].project) !== up1(project)) return;
        drop(i, k, true);
      });
      const dot = el('span', 'td-manage-dot');
      dot.style.background = colorHex(project.color);
      li.append(grip, dot, el('span', 'td-manage-name', project.name));
      return li;
    }));
    const tools = el('ul', 'td-card td-choices td-manage-tools');
    for (const [label, run] of /** @type {[string, (m: typeof import('./templates.js')) => void][]} */ ([
      ['Save a project as a template', m => m.saveAsTemplate(ctx)], ['New project from a template', m => m.newFromTemplate(ctx)]])) {
      const li = el('li', ''), b = /** @type {HTMLButtonElement} */ (el('button', 'td-choice'));
      b.type = 'button';
      b.append(icon(MORE.layoutTemplate, { class: 'td-choice-icon' }), el('span', 'td-choice-label', label));
      b.addEventListener('click', () => { d.close(); void import('./templates.js').then(run); });
      li.append(b); tools.append(li);
    }
    body.replaceChildren(sheetHead('Manage projects', d), list, ...(ctx.canWrite() ? [tools] : []));
    if (focus) /** @type {HTMLElement | null} */ (list.querySelector(`[data-id="${CSS.escape(focus)}"]`))?.focus();
  };
  draw();
  if (!d.open) d.showModal();
}
