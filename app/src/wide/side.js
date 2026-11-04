// The wide side bar's rows (840 px and up only; views.js imports this file once the window is that wide, so a phone or
// a tablet never loads it). It fills nav#side, whose look is wide.css's:
//   head      the person (initial, name, a chevron) opening the account menu: Settings, Sync (the last sync's time),
//             Sign out and the version; app-ui (rc.93+) puts its hide button at the row's end
//   add       "Add task": quick add, as the + button does (also the Q key)
//   places    Search, Inbox, Today (the day's number in its icon), Upcoming, Filters & Labels, Reporting, each with its
//             count of open tasks; a place left out of both the tab bar and Browse (Settings) is left out here too
//   projects  "My Projects" (a click folds it, kept on this device: sideProjectsFolded) and the projects as Browse
//             lists them, sub-projects indented, each with its open count; a click opens the project's page
// The row of the page on top is lit (aria-current). Hidden or shown is the option sideHidden (app-ui's `ui-side`). The index.html links stay for the narrower side bar and are hidden
// here only while these rows show (#side[data-td-side]).
import { icon } from '@core/ui';
import { ICONS } from '../icons.js';
import { MORE } from '../icons-more.js';
import { projectTree, sideCounts } from '../arrange.js';
import { colorHex } from '../colors.js';
import { dayKey } from '../dates.js';
import { screens, tabButton, openSettingsPage } from '../shell.js';
import { openMenu } from '../ui/menu.js';
import { el } from '../screens/pick.js';
import { TABS, sideRows, litRow } from './side-rows.js';

/** @typedef {import('../screens/views.js').Ctx} Ctx */

const LABELS = /** @type {Record<string, string>} */ ({ search: 'Search', inbox: 'Inbox', today: 'Today', upcoming: 'Upcoming', filters: 'Filters & Labels', reporting: 'Reporting' });
const ICON_OF = /** @type {Record<string, import('app-ui/icons/lucide.js').IconNodes>} */ ({ search: MORE.search, inbox: ICONS.inbox, today: ICONS.calendar, upcoming: MORE.calendarDays, filters: MORE.layoutGrid, reporting: MORE.trendingUp });

/** @type {{ nav: HTMLElement, me: HTMLButtonElement, parts: HTMLElement[] } | null} */
let made = null;
let lastSynced = 0;

/** @param {Ctx} ctx */
export function startSide(ctx) {
  if (made) return;
  const side = /** @type {HTMLElement | null} */ (document.getElementById('side'));
  if (!side) return;
  const big = matchMedia('(min-width: 840px)');

  // the head: the person's button (app-ui's hide button joins the row; before rc.93 the row is the button alone)
  let head = /** @type {HTMLElement | null} */ (side.querySelector('.ui-side-head'));
  if (!head) { head = el('div', 'ui-side-head'); side.prepend(head); }
  head.classList.add('td-side-head');
  const me = /** @type {HTMLButtonElement} */ (el('button', 'td-side-me'));
  me.type = 'button';
  me.setAttribute('aria-haspopup', 'menu');
  me.addEventListener('click', () => accountMenu(ctx, me));
  head.prepend(me);

  const add = /** @type {HTMLButtonElement} */ (el('button', 'td-side-add'));
  add.type = 'button';
  const plus = el('span', 'td-side-plus');
  plus.append(icon(ICONS.plus));
  add.append(plus, el('span', '', 'Add task'));
  add.addEventListener('click', () => ctx.openQuickAdd());

  const nav = el('div', 'td-side-nav');
  head.after(add, nav);
  made = { nav, me, parts: [me, add, nav] };
  const shown = () => {
    for (const p of made?.parts ?? []) p.hidden = !big.matches;
    side.toggleAttribute('data-td-side', big.matches);
  };
  big.addEventListener('change', shown);
  shown();

  // Q: quick add (a keyboard, not typing in a field, no sheet or menu open); "/" is views.js's
  document.addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'q' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.defaultPrevented || !big.matches) return;
    const a = document.activeElement;
    if (a instanceof HTMLElement && (a.isContentEditable || a.closest('input, textarea, select'))) return;
    if (document.querySelector('dialog[open], [role="menu"]:not([hidden])')) return;
    e.preventDefault();
    ctx.openQuickAdd();
  });

  // hidden or shown (app-ui rc.93's hide button, which keeps it on this device too): the option sideHidden follows it,
  // and a change to the option (a settings file, Reset) moves it
  const settings = ctx.app.settings, html = document.documentElement;
  const follow = () => /** @type {any} */ (window).shell?.side?.()?.toggle(!!settings.get('sideHidden'));
  document.addEventListener('ui-side', e => { const h = !!(/** @type {CustomEvent} */ (e).detail?.hidden); if (h !== !!settings.get('sideHidden')) settings.set('sideHidden', h); });
  settings.watch('sideHidden', follow);
  if (html.hasAttribute('data-wide-ready')) follow();
  else {
    const ready = new MutationObserver(() => { if (html.hasAttribute('data-wide-ready')) { ready.disconnect(); follow(); } });
    ready.observe(html, { attributes: true, attributeFilter: ['data-wide-ready'] });
  }

  const status$ = /** @type {any} */ (ctx.app).status$;
  if (typeof status$ === 'function') status$.call(ctx.app, (/** @type {any} */ st) => { if (st.state === 'synced' && !st.unsent) lastSynced = Date.now(); });
  for (const k of ['tabs', 'browseHidden', 'sideProjectsFolded']) ctx.app.settings.watch(k, () => draw(ctx));
  const host = document.querySelector('.ui-screens');
  const relight = () => requestAnimationFrame(() => light(ctx));
  host?.addEventListener('ui-tab', relight);
  host?.addEventListener('ui-screen', relight);
  draw(ctx);
}

/** a place or project row: a link like index.html's side links (a tab's row keeps data-tab-page, so the kit's tabs
 * follow it) @param {string} key @param {string} label @param {Element} ic @param {number} count */
function row(key, label, ic, count) {
  const a = /** @type {HTMLAnchorElement} */ (el('a', 'ui-side-link td-side-row'));
  a.href = './';
  a.dataset.side = key;
  ic.classList.add('td-side-ic');
  a.append(ic, el('span', 'td-side-label', label));
  if (count > 0) a.append(el('span', 'ui-side-count', String(count)));
  return a;
}

/** the rows again, from the data as last heard (views.js calls this on each redraw) @param {Ctx} ctx */
export function draw(ctx) {
  if (!made) return;
  const data = ctx.data(), today = dayKey(), n = sideCounts(data.tasks, today);
  const offBar = (/** @type {string} */ id) => { const t = tabButton(id); return !t || t.hidden || t.hasAttribute('data-off-bar'); };
  const counts = /** @type {Record<string, number>} */ ({ inbox: n.inbox, today: n.today });
  const rows = sideRows(offBar, ctx.app.settings.get('browseHidden')).map(id => {
    let ic = /** @type {Element} */ (icon(ICON_OF[id]));
    if (id === 'today') {
      const box = el('span', 'td-side-day');
      box.append(ic, el('span', 'today-num', String(new Date().getDate())));
      ic = box;
    }
    const a = row(id, LABELS[id], ic, counts[id] ?? 0);
    if (TABS.includes(id)) a.setAttribute('data-tab-page', `#${id}-page`);
    else a.addEventListener('click', e => { e.preventDefault(); go(ctx, id); });
    return a;
  });

  // My Projects: the header folds them
  const folded = !!ctx.app.settings.get('sideProjectsFolded');
  const fold = /** @type {HTMLButtonElement} */ (el('button', 'td-side-group'));
  fold.type = 'button';
  fold.setAttribute('aria-expanded', String(!folded));
  const chev = icon(folded ? ICONS.chevronRight : ICONS.chevronDown);
  chev.classList.add('td-side-fold');
  fold.append(el('span', '', 'My Projects'), chev);
  fold.addEventListener('click', () => ctx.app.settings.set('sideProjectsFolded', !folded));
  const projects = folded ? [] : projectTree(data.projects).map(({ project: p, depth }) => {
    const ic = icon(ICONS.hash);
    ic.style.color = colorHex(p.color);
    const a = row(`project:${p.id}`, p.name, ic, n.projects[p.id] ?? 0);
    if (depth) a.style.setProperty('--td-depth', String(depth));
    a.addEventListener('click', e => { e.preventDefault(); if (ctx.top() !== 'project-page' || ctx.project() !== p.id) ctx.openProject(p.id); });
    return a;
  });
  const list = el('div', 'td-side-projects');
  list.append(...projects);
  made.nav.replaceChildren(...rows, fold, list);
  me(ctx);
  light(ctx);
}

/** the head's button: the person's initial (or photo) and name @param {Ctx} ctx */
function me(ctx) {
  if (!made) return;
  const u = ctx.user(), who = String(u?.name ?? '').trim().split('@')[0];
  const face = el('span', 'td-side-face');
  if (u?.photo) face.append(Object.assign(document.createElement('img'), { src: u.photo, alt: '', referrerPolicy: 'no-referrer' }));
  else if (who) face.textContent = who.charAt(0).toUpperCase();
  else face.append(icon(MORE.user));
  const chev = icon(ICONS.chevronDown);
  chev.classList.add('td-side-chev');
  made.me.replaceChildren(face, el('span', 'td-side-name', who || 'Signed out'), chev);
  made.me.setAttribute('aria-label', `${who || 'Signed out'}: account menu`);
}

/** lights the row of the page on top @param {Ctx} ctx */
function light(ctx) {
  if (!made) return;
  const lit = litRow(ctx.top(), ctx.project(), screens()?.depth() ?? 0);
  for (const a of /** @type {NodeListOf<HTMLElement>} */ (made.nav.querySelectorAll('.td-side-row'))) {
    if (a.dataset.side === lit) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
}

/** a place that is not a tab: pushed over the tabs, as Browse's rows do (not again while on top) @param {Ctx} ctx @param {string} id */
function go(ctx, id) {
  if (ctx.top() === `${id}-page`) return;
  if (id === 'filters') void import('../screens/filters.js').then(m => m.openFiltersLabels());
  else if (id === 'reporting') screens()?.push('#reporting-page');
}

/** the account menu, under the head's button @param {Ctx} ctx @param {HTMLElement} at */
function accountMenu(ctx, at) {
  const u = ctx.user(), who = String(u?.name ?? '').trim().split('@')[0];
  const click = (/** @type {string} */ id) => () => { document.getElementById(id)?.click(); };
  openMenu(at, [
    { label: 'Settings', icon: MORE.settings, run: () => { if (document.getElementById('settings-page')?.hidden) screens()?.push('#settings-page'); } },
    null,
    { label: 'Sync', icon: MORE.refreshCw, run: click('sync-btn') },
    null,
    ...(u ? [{ label: 'Sign out', icon: MORE.logOut, run: click('sign-out') }, null] : []),
    { label: 'Version', icon: MORE.info, run: () => { void openSettingsPage('About'); } },
  ], { label: 'Account', title: who || 'Signed out' });
  // the hints at each row's end: the last sync's time, the version
  const menu = document.querySelector('.td-menu-layer:last-of-type > .td-menu');
  if (!menu) return;
  menu.classList.add('td-side-menu');
  const items = /** @type {HTMLElement[]} */ ([...menu.querySelectorAll('.ui-menu-item')]);
  const hint = (/** @type {string} */ label, /** @type {string} */ text) => {
    const b = items.find(i => i.textContent?.trim() === label);
    const h = el('span', 'td-side-hint', text);
    b?.append(h);
    return h;
  };
  hint('Sync', lastSynced ? `Synced ${new Date(lastSynced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Not synced yet');
  const v = hint('Version', '…');
  const label = /** @type {any} */ (ctx.app).update?.versionLabel?.();
  if (label?.then) label.then((/** @type {string} */ x) => { v.textContent = x || 'dev'; }, () => { v.textContent = 'dev'; });
  else v.textContent = 'dev';
}
