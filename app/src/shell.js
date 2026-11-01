// The page's shell (index.html: .ui-shell, the kit's bar, the five tabs, side bar and drawer) and the Settings page: the
// kit's settingsScreen with the options (options.js) and its About rows, and what the options do to the tabs.
// Settings is a screen pushed from Browse (its gear). It opens on a menu: a search box, the tabs taken off the bar (one
// tap away), then a row per page; Back closes a page. The Tab bar page arranges the tabs (the kit's tabArranger; the
// tabs option, this device); Browse always stays on the bar, since Settings is reached from it.
import { startGestures, adaptiveShell, settingsScreen, createTransients, tabArranger, arrangeTabs, applyTabs, tabPages, tabBack, toaster, CLOSE_MS } from '@core/ui';
import { themeSwitch } from '@core/theme';
import { APP } from './config.js';
import { $ } from './dom.js';
import { ICONS } from './icons.js';
import { SETTING_SECTIONS } from './options.js';
import { modules } from './modules.js';

/**
 * A recipe's own Settings page (modules.js `settingsPages`, one entry per recipe: backup, bin, feedback, shareIn; the recipes fill them): made once the app is there; null
 * when the page has nothing to show (the feedback page in a static app).
 * @typedef {(o: { app: import('./items.js').ItemsApp }) => import('app-ui/ui/settings-screen.js').SettingSection | null} SettingsSlot
 */

// The Settings menu's headings, in this order; a page whose group is not listed goes under 'Other' (last), so a new
// page is never left out and a recipe never edits this list
const SETTINGS_GROUPS = ['Tasks', 'Look', 'Sharing', 'Data', 'Advanced', 'Other'];
// (a page whose visible() is false now is left out: the kit keeps a group's heading even when all its pages are hidden,
// so an Advanced with no features showed an empty heading; a key-gated page stays, as it can turn on live)
/** @param {import('app-ui/ui/settings-screen.js').SettingSection[]} sections */
const byGroup = sections => sections
  .filter(s => typeof s.visible !== 'function' || s.visible())
  .map(s => (SETTINGS_GROUPS.includes(s.group ?? '') ? s : { ...s, group: 'Other' }))
  .sort((a, b) => SETTINGS_GROUPS.indexOf(a.group ?? '') - SETTINGS_GROUPS.indexOf(b.group ?? ''));

// Browse always stays on the bar: Settings opens from it (the tabs off the bar are listed at the top of its menu)
const TAB_RULES = { fixed: ['browse'] };

/** @type {any} */
let kit = null;
/** the kit's screens (push and pop), once the shell has started */
export const screens = () => /** @type {{ push: (sel: string) => unknown, pop: () => unknown, depth: () => number } | undefined} */ (kit?.screens);

// The shell starts first, as soon as the page's scripts have run, so the tabs and the menu work while the app is still
// starting; the Settings page follows (settingsPage) once the app and its options are there.
// A page that draws itself late (a lazy screen, a list filled on first view) listens for 'draw-ahead' and draws a
// still copy then, so a swipe or a quick flick never brings it in blank (app-ui rc.69 `ahead`, from the logbook).
// An app that empties its hidden pages must spare the `.is-beside` ones.
//
// STOPGAP (app-ui ask "home tab", owner's notes): tabPages sends Back to the first tab on the bar and opens on the lit
// one; this app's Home (option `home`, Today) is where it opens and Back goes, and moving tabs in the DOM would change
// the swipe order. So startGestures runs without the tabs' pages, tabPages starts here with its Back off, and the kit's
// tabBack runs with Home as first. Drop it when tabPages takes a `home` option: call startGestures as before.
/** the Home view's tab id, kept here so the next start opens on it before the options load */
const HOME_KEY = 'td-home';
let home = 'today';
try { home = localStorage.getItem(HOME_KEY) || 'today'; } catch { /* none */ }
const steps = createTransients({ history, location, events: window });
/** @param {HTMLElement} t a tab on the bar that shows */
const live = t => !t.hidden && !t.hasAttribute('data-off-bar');
export function startShell() {
  const bar = /** @type {HTMLElement} */ (document.querySelector('.ui-tabbar'));
  const host = /** @type {HTMLElement} */ (document.querySelector('.ui-screens'));
  const tabs = /** @type {HTMLElement[]} */ ([...bar.querySelectorAll('[data-tab-page]')]);
  const pages = tabs.map(t => t.getAttribute('data-tab-page') ?? '');
  const tabOf = (/** @type {string} */ id) => tabs.find(t => t.dataset.tabId === id && live(t));
  /** the Home view's page: its tab if it shows, else Today's, else the first */
  const homePage = () => document.querySelector((tabOf(home) ?? tabOf('today') ?? tabs.find(live))?.getAttribute('data-tab-page') ?? '');
  for (const t of tabs) t.removeAttribute('data-tab-page');
  kit = startGestures(document, { ahead: page => page.dispatchEvent(new CustomEvent('draw-ahead')) });
  tabs.forEach((t, i) => t.setAttribute('data-tab-page', pages[i]));
  const start = tabOf(home);
  if (start) for (const t of tabs) { if (t === start) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); }
  const go = tabPages(bar, { screens: kit.screens, host, ahead: page => page.dispatchEvent(new CustomEvent('draw-ahead')), backToFirst: false });
  kit.tabs = go;
  try { history.scrollRestoration = 'manual'; } catch { /* none */ }
  /** @type {(() => void) | null} */
  let unsay = null;
  const back = tabBack({ history, events: window, first: go.current() === homePage(), onFirst: () => { go.go(/** @type {HTMLElement} */ (homePage())); },
    onClose: () => { unsay?.(); unsay = toaster(document.body).show('Press Back again to close', { ms: CLOSE_MS }); } });
  host.addEventListener('ui-tab', e => back.went(/** @type {CustomEvent} */ (e).detail.page === homePage()));
  // a tab tapped over a Settings page closes the page's history step first, then goes; the current tab scrolls to top
  let again = false;
  bar.addEventListener('click', e => {
    const t = /** @type {Element} */ (e.target).closest('[data-tab-page]');
    if (!t) return;
    // (`again`: a reload can leave ids in the entry)
    if (!again && history.state?.uiTransient?.ids?.length) { e.stopPropagation(); e.preventDefault(); again = true; void steps.dismissAll().then(() => { /** @type {HTMLElement} */ (t).click(); again = false; }); }
    else if (document.querySelector(t.getAttribute('data-tab-page') ?? '') === go.current() && !kit.screens.depth()) scrollTo({ top: 0, behavior: 'smooth' });
  });
  const shell = adaptiveShell(/** @type {HTMLElement} */ (document.querySelector('.ui-shell')), { screens: kit.screens });
  Object.assign(window, { kit, shell });   // for the tests
}

/** the Home view's tab, from the options (the next start opens on it) @param {unknown} id */
export function setHome(id) {
  home = String(id);
  try { localStorage.setItem(HOME_KEY, home); } catch { /* none */ }
}

/** the tab bar's tabs, in index.html's order (an app's own hidden ones left out) */
function barTabs() {
  const tabs = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('.ui-tabbar > [data-tab-id]')]);
  // (its name is the button's own text, not its icon's)
  const label = (/** @type {HTMLElement} */ t) => [...t.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('').trim();
  return tabs.filter(t => !t.hidden).map(t => ({ id: /** @type {string} */ (t.dataset.tabId), label: label(t) }));
}
const tabButton = (/** @type {string} */ id) => /** @type {HTMLElement | null} */ (document.querySelector(`.ui-tabbar > [data-tab-id="${id}"]`));

/**
 * A Settings page whose code loads when the page is first shown (settingsScreen mounts every page when it is built, shown
 * or not, so a page that is heavy waits until it is on screen). load(host) -> its parts; leave runs whenever the page is
 * hidden again. @param {HTMLElement} host
 * @param {(host: HTMLElement) => Promise<{ leave: () => void, destroy: () => void }>} load
 */
function onShow(host, load) {
  /** @type {Promise<{ leave: () => void, destroy: () => void }> | null} */
  let page = null;
  const watch = new IntersectionObserver(entries => {
    const seen = entries.some(e => e.isIntersecting);
    if (seen) page ??= load(host);
    else page?.then(p => p.leave());
  });
  watch.observe(host);
  return () => { watch.disconnect(); page?.then(p => p.destroy()); };
}

/** a list of rows in host @param {HTMLElement} host @param {HTMLElement[]} items */
function listIn(host, items) {
  const list = document.createElement('ul');
  list.className = 'ui-list';
  list.append(...items.map(item => { const li = document.createElement('li'); li.append(item); return li; }));
  host.append(list);
}

/**
 * A Settings page shown as a screen of its own (the kit's menu.onPage, app-ui rc.80+): its title in the large title and
 * the bar, no account block over it; the bar's Back closes it (the page is a history step). null: the menu again.
 * @param {{ title: string } | null} page
 */
function onPage(page) {
  const title = page ? page.title : 'Settings';
  $('settings-title').textContent = title;
  const small = document.querySelector('.ui-bar-title');
  if (small && !$('settings-page').hidden) small.textContent = title;
  $('settings-page').classList.toggle('is-sub', !!page);
}

/** @param {import('./items.js').ItemsApp | null} app  null: not set up, so no Settings page (Browse is not drawn either) */
export function settingsPage(app) {
  if (!app) return;
  const { settings } = app;
  const bar = /** @type {HTMLElement} */ (document.querySelector('.ui-tabbar'));

  // the bar as arranged on this device, now and whenever the arrangement changes (here, Reset or a settings file)
  /** @type {Set<() => void>} */
  const repaints = new Set();
  const arranged = () => arrangeTabs(barTabs().map(t => t.id), settings.get('tabs'), TAB_RULES);
  const paintBar = () => { applyTabs(bar, arranged()); repaints.forEach(f => f()); };
  settings.watch('tabs', paintBar);
  paintBar();

  /** the tabs taken off the bar, one tap away at the top of the menu (none: nothing shows) @param {HTMLElement} host */
  const offBar = host => {
    const draw = () => {
      const off = arranged().hidden;
      host.replaceChildren();
      if (!off.length) return;
      host.append(Object.assign(document.createElement('h2'), { className: 'ui-settings-title', textContent: 'Off the tab bar' }));
      listIn(host, off.map(id => {
        const b = Object.assign(document.createElement('button'), { type: 'button', className: 'ui-row ui-settings-go', textContent: barTabs().find(t => t.id === id)?.label || id });
        b.addEventListener('click', () => tabButton(id)?.click());
        return b;
      }));
    };
    repaints.add(draw);
    draw();
    return () => { repaints.delete(draw); };
  };

  settingsScreen($('settings-host'), {
    settings,
    menu: { steps, top: offBar, onPage },
    sections: byGroup([
      ...SETTING_SECTIONS,
      { title: 'Tab bar', icon: ICONS.menu, sub: 'Order, and which tabs show', group: 'Look', find: 'arrange tabs', mount: host => {
        let stop = () => {};
        const draw = () => { stop(); stop = tabArranger(host, { tabs: barTabs(), get: () => settings.get('tabs'), set: v => settings.set('tabs', v), rules: TAB_RULES }); };
        repaints.add(draw);
        draw();
        return () => { repaints.delete(draw); stop(); };
      } },
      { title: 'Import from Todoist', icon: ICONS.folderInput, sub: 'Bring your projects and tasks over', group: 'Data', find: 'migrate move api token tasks',
        mount: host => onShow(host, async h => (await import('./screens/import.js')).importScreen(h, { app, openInbox: () => tabButton('inbox')?.click() })) },
      { title: 'Look', icon: ICONS.smartphone, sub: 'Theme, colour and density', group: 'Look', mount: host => { themeSwitch(host, { name: APP.title || APP.name }); } },
      // the recipes' own pages (an empty slot adds none)
      ...Object.values(modules.settingsPages ?? {}).flatMap(slot => { const section = slot?.({ app }); return section ? [section] : []; }),
    ]),
    about: { name: APP.title || APP.name, update: app.update },
  });

  // what the options do to the page, now and whenever one changes (here or on another device)
  const apply = () => {
    document.querySelector('.ui-screens')?.classList.toggle('big', settings.get('bigRows'));
  };
  settings.watch(null, apply);
  apply();
  setHome(settings.get('home'));
  settings.watch('home', setHome);
}
