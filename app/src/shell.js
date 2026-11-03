// The page's shell (index.html: .ui-shell, the kit's bar, the tabs, side bar and drawer) and what the options do to the
// page (the tab bar, Home, larger rows, the add button's place, the app icon). The Settings screen itself (the kit's
// settingsScreen and its pages, screens/settings.js) is built the first time #settings-page shows (lazyModules
// "settings"), so none of it loads at startup. Settings is a screen pushed from Browse (its gear); Browse always stays
// on the bar, since Settings is reached from it.
import { startGestures, adaptiveShell, createTransients, arrangeTabs, applyTabs, tabPages, tabBack, toaster, lazyModules, CLOSE_MS } from '@core/ui';

/**
 * A recipe's own Settings page (modules.js `settingsPages`, one entry per recipe: backup, bin, feedback, shareIn; the recipes fill them): made once the app is there; null
 * when the page has nothing to show (the feedback page in a static app).
 * @typedef {(o: { app: import('./items.js').ItemsApp }) => import('app-ui/ui/settings-screen.js').SettingSection | null} SettingsSlot
 */

// Browse always stays on the bar: Settings opens from it (the tabs off the bar are listed at the top of its menu). Search
// starts off the bar (it is a page pushed from Browse) and can be switched on in Settings > Navigation bar
const TAB_RULES = { fixed: ['browse'], offByDefault: ['search'] };

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
  const go = tabPages(bar, { screens: kit.screens, host, ahead: page => page.dispatchEvent(new CustomEvent('draw-ahead')), backToFirst: false, swipe: false });
  kit.tabs = go;
  goTo = page => { if (go.current() !== page) go.go(page); };
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

/** @type {(page: HTMLElement) => void} set by startShell */
let goTo = () => {};
/** a tab page by its id (Search's Recently visited: Inbox, Today, Upcoming, even one taken off the bar); a screen pushed over the
 * tabs goes first @param {string} id */
export function showPage(id) {
  const page = document.getElementById(id);
  if (page) goTo(page);
}
/** Today's page, whatever Home is: it holds sign-in, access and set-up, so a signed-out start must land there */
export function showToday() {
  const page = document.getElementById('today-page');
  if (page) goTo(page);
}

/** the Home view's tab, from the options (the next start opens on it) @param {unknown} id */
export function setHome(id) {
  home = String(id);
  try { localStorage.setItem(HOME_KEY, home); } catch { /* none */ }
}

/** the tab bar's tabs, in index.html's order (an app's own hidden ones left out) */
export function barTabs() {
  const tabs = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('.ui-tabbar > [data-tab-id]')]);
  // (its name is the button's own text, not its icon's)
  const label = (/** @type {HTMLElement} */ t) => [...t.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('').trim();
  return tabs.filter(t => !t.hidden).map(t => ({ id: /** @type {string} */ (t.dataset.tabId), label: label(t) }));
}
export const tabButton = (/** @type {string} */ id) => /** @type {HTMLElement | null} */ (document.querySelector(`.ui-tabbar > [data-tab-id="${id}"]`));

/** the page's icon and home-screen icon: the default (index.html's) or one of icons/variants (option appIcon) */
let iconShown = 'default';
/** @param {unknown} id */
function setIcon(id) {
  const v = String(id || 'default');
  if (v === iconShown) return;
  iconShown = v;
  const icon = document.querySelector('link[rel="icon"]');
  const touch = document.querySelector('link[rel="apple-touch-icon"]');
  icon?.setAttribute('href', v === 'default' ? 'icons/icon.svg' : `icons/variants/${v}.svg`);
  touch?.setAttribute('href', v === 'default' ? 'icons/apple-touch-icon.png' : `icons/variants/${v}.png`);
}

/**
 * A Settings page from anywhere (Browse's bell, a hold on the tab bar): Browse, its Settings screen, then the page's row
 * in the menu once the screen is built. @param {string} title the page's title, as its menu row starts
 */
export async function openSettingsPage(title) {
  const until = async (/** @type {() => unknown} */ ok) => { for (let i = 0; i < 60 && !ok(); i++) await new Promise(r => setTimeout(r, 50)); return !!ok(); };
  const page = /** @type {HTMLElement} */ (document.getElementById('settings-page'));
  if (page.hidden) {
    tabButton('browse')?.click();
    if (!await until(() => !document.getElementById('browse-page')?.hidden && !screens()?.depth())) return;
    screens()?.push('#settings-page');
    if (!await until(() => !page.hidden)) return;
  }
  if (page.classList.contains('is-sub')) {
    /** @type {HTMLElement | null} */ (document.querySelector('.ui-bar .ui-bar-back'))?.click();
    if (!await until(() => !page.classList.contains('is-sub'))) return;
  }
  const row = () => [...document.querySelectorAll('#settings-host .ui-settings-menu-groups .ui-settings-go')].find(b => b.textContent?.trim().startsWith(title));
  if (await until(row)) /** @type {HTMLElement} */ (row())?.click();
}

const lazy = lazyModules({ settings: () => import('./screens/settings.js') });

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

  // the last sync, kept from the start for About's Sync status (none in a static app)
  let lastSynced = 0;
  const status$ = /** @type {any} */ (app).status$;
  if (typeof status$ === 'function') status$.call(app, (/** @type {any} */ st) => { if (st.state === 'synced' && !st.unsent) lastSynced = Date.now(); });

  // the Settings screen, built the first time its page shows
  const page = /** @type {HTMLElement} */ (document.getElementById('settings-page'));
  let built = false;
  const build = () => {
    if (built || page.hidden) return;
    built = true;
    seen.disconnect();
    void lazy.withMod('settings', m => m.buildSettings(app, { arranged, repaints, rules: TAB_RULES, steps, synced: () => lastSynced, sync: typeof status$ === 'function' }));
  };
  const seen = new MutationObserver(build);
  seen.observe(page, { attributes: true, attributeFilter: ['hidden'] });
  build();

  // what the options do to the page, now and whenever one changes (here or on another device)
  const apply = () => {
    document.querySelector('.ui-screens')?.classList.toggle('big', settings.get('bigRows'));
    document.documentElement.dataset.fab = String(settings.get('fabPos') ?? 'right');
    setIcon(settings.get('appIcon'));
  };
  settings.watch(null, apply);
  apply();
  setHome(settings.get('home'));
  settings.watch('home', setHome);
}
