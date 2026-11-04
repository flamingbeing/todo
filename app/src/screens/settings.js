// The Settings screen (#settings-host), built the first time #settings-page shows (shell.js, lazyModules "settings"):
// the kit's settingsScreen with the option rows (settings-rows.js), the app's own pages and About's rows. It opens on a
// menu (the tabs taken off the bar one tap away, then a row per page under its group heading); Back closes a page.
// The app's own parts here: the Theme cards, the App icon list, the add button's place, the Navigation menu checklist,
// the days off, the notification state and the licences page.
import { settingsScreen, tabArranger, icon } from '@core/ui';
import { themeSwitch, themeChoice, chooseTheme, PRESETS, SURFACES } from '@core/theme';
import { APP } from '../config.js';
import { timeText } from '../dates.js';
import { $ } from '../dom.js';
import { ICONS } from '../icons.js';
import { MORE } from '../icons-more.js';
import { APP_ICONS, BROWSE_ROWS } from '../options.js';
import { SETTING_SECTIONS, WEEKDAYS } from '../settings-rows.js';
import { modules } from '../modules.js';
import { barTabs, tabButton } from '../shell.js';

/** @typedef {import('app-ui/ui/settings-screen.js').SettingSection} SettingSection */

// The menu's headings, in this order; a page whose group is not listed goes under 'More' (last), so a new page is never
// left out and a recipe never edits this list. (A page whose visible() is false now is left out: the kit keeps a group's
// heading even when all its pages are hidden.)
const SETTINGS_GROUPS = ['', 'Personalization', 'Productivity', 'More'];
// the order of the pages within a group (the rest keep theirs, after these)
const PAGE_ORDER = ['Account', 'General', 'Theme', 'App icon', 'Navigation bar', 'Navigation menu', 'Quick Add', 'Productivity', 'Reminders', 'Notifications'];
const pageRank = (/** @type {string} */ t) => (PAGE_ORDER.includes(t) ? PAGE_ORDER.indexOf(t) : PAGE_ORDER.length);
/** @param {SettingSection[]} sections */
const byGroup = sections => sections
  .filter(s => typeof s.visible !== 'function' || s.visible())
  .map(s => (SETTINGS_GROUPS.includes(s.group ?? '') ? s : { ...s, group: 'More' }))
  .sort((a, b) => SETTINGS_GROUPS.indexOf(a.group ?? '') - SETTINGS_GROUPS.indexOf(b.group ?? '') || pageRank(a.title) - pageRank(b.title));
// pages with no "this device" line under them (the account is the person's; the licences are text)
const NO_NOTE = ['Account', 'Open source licences'];
const LICENCES = 'Open source licences';
const pad2 = (/** @type {number} */ n) => String(n).padStart(2, '0');
const APP_ICON_WORDS = /** @type {Record<string, string>} */ ({ default: 'Classic', night: 'Night', paper: 'Paper', mint: 'Mint' });
const BROWSE_WORDS = /** @type {Record<string, [string, import('app-ui/icons/lucide.js').IconNodes]>} */ ({
  inbox: ['Inbox', ICONS.inbox], today: ['Today', ICONS.calendar], upcoming: ['Upcoming', MORE.calendarDays], search: ['Search', MORE.search],
  filters: ['Filters & Labels', MORE.layoutGrid], reporting: ['Reporting', MORE.trendingUp], templates: ['Templates', MORE.layoutTemplate],
});
// the add button's places, as drawn on the Navigation bar page
const FAB_PLACES = /** @type {[string, string][]} */ ([['left', 'Left'], ['center', 'Center'], ['right', 'Right']]);
// the libraries the app ships (app/public/vendor), each with its licence file
const VENDOR = /** @type {[string, string][]} */ ([['chrono-node 2.10.3', 'vendor/chrono-node/2.10.3/LICENSE'], ['rrule 2.8.1', 'vendor/rrule/2.8.1/LICENSE']]);

/**
 * @param {string} tag @param {string} [cls] @param {string} [text]
 * @returns {HTMLElement}
 */
const el = (tag, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

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

/** the subheading row a page's rows hold (the kit draws { heading } as li > h3) @param {HTMLElement} part @param {string} text */
const headingRow = (part, text) => /** @type {HTMLElement | undefined} */ ([...(part.parentElement?.querySelectorAll('.ui-setting-subhead') ?? [])]
  .find(li => li.textContent?.trim().startsWith(text)));

/**
 * A Settings page shown as a screen of its own (the kit's menu.onPage): its title in the large title and the bar, no
 * account block over it; the bar's Back closes it (the page is a history step). null: the menu again.
 * @param {{ title: string } | null} page
 */
function onPage(page) {
  const title = page ? page.title : 'Settings';
  $('settings-title').textContent = title;
  const small = document.querySelector('.ui-bar-title');
  if (small && !$('settings-page').hidden) small.textContent = title;
  $('settings-page').classList.toggle('is-sub', !!page);
}

/** a radio-like button in a group (role radio) @param {string} cls @param {boolean} on */
function radio(cls, on) {
  const b = /** @type {HTMLButtonElement} */ (el('button', cls));
  b.type = 'button';
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-checked', String(on));
  return b;
}
/** marks the one picked in a radio group @param {HTMLElement} group @param {HTMLElement} picked */
const pick = (group, picked) => { for (const b of group.querySelectorAll('[role="radio"]')) b.setAttribute('aria-checked', String(b === picked)); };

// ---- Theme: Appearance (automatic, light, dark), then a card per style. STOPGAP (app-ui ask "theme cards", owner's
// notes): the kit's themeSwitch draws selects only; the cards here call chooseTheme and keep its selects in step. The
// kit's switch stays under "More options" (its ids are what the tests and a settings file use).
/** @param {HTMLElement} host */
function themePage(host) {
  const syncSelect = (/** @type {string} */ id, /** @type {string} */ v) => { const s = /** @type {HTMLSelectElement | null} */ (host.querySelector(`#${id}`)); if (s) s.value = v; };
  const looks = /** @type {[string, string][]} */ ([['auto', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']]);
  const mode = el('div', 'td-seg');
  mode.setAttribute('role', 'radiogroup');
  mode.setAttribute('aria-label', 'Appearance');
  for (const [id, word] of looks) {
    const b = radio('td-seg-btn', themeChoice().theme === id);
    b.textContent = word;
    b.dataset.theme = id;
    b.addEventListener('click', () => { chooseTheme({ theme: /** @type {any} */ (id) }); pick(mode, b); syncSelect('theme-pick', id); });
    mode.append(b);
  }
  const cards = el('div', 'td-theme-cards');
  cards.setAttribute('role', 'radiogroup');
  cards.setAttribute('aria-label', 'Style');
  for (const p of PRESETS) {
    const b = radio('td-theme-card', (themeChoice().preset || 'default') === p.id);
    b.dataset.preset = p.id;
    const accent = p.accent ?? APP.accent;
    const ground = SURFACES[p.surface ?? '']?.light?.bg ?? '#ffffff';
    const view = el('span', 'td-theme-view');
    view.style.background = ground;
    const bar = el('span', 'td-theme-bar');
    bar.style.background = accent;
    view.append(bar, el('span', 'td-theme-line'), el('span', 'td-theme-line is-short'));
    const name = el('span', 'td-theme-name', p.name);
    b.append(view, name, icon(ICONS.check, { class: 'td-theme-tick' }));
    b.title = p.desc;
    b.addEventListener('click', () => { chooseTheme({ preset: /** @type {any} */ (p.id) }); pick(cards, b); syncSelect('preset-pick', p.id); });
    cards.append(b);
  }
  host.append(el('h3', 'td-settings-sub', 'Appearance'), mode, el('h3', 'td-settings-sub', 'Style'), cards, el('h3', 'td-settings-sub', 'More options'));
  const stop = themeSwitch(host, { name: APP.title || APP.name });
  // the kit's own pickers keep the cards in step the other way
  const follow = () => {
    const c = themeChoice();
    for (const b of mode.querySelectorAll('[role="radio"]')) b.setAttribute('aria-checked', String(/** @type {HTMLElement} */ (b).dataset.theme === c.theme));
    for (const b of cards.querySelectorAll('[role="radio"]')) b.setAttribute('aria-checked', String(/** @type {HTMLElement} */ (b).dataset.preset === (c.preset || 'default')));
  };
  host.addEventListener('change', follow);
  return () => { stop(); host.removeEventListener('change', follow); };
}

/**
 * @param {import('../items.js').ItemsApp} app
 * @param {{ arranged: () => { hidden: string[] }, repaints: Set<() => void>, rules: { fixed: string[], offByDefault: string[] },
 *   steps: any, synced: () => number, sync: boolean }} o
 */
export function buildSettings(app, { arranged, repaints, rules, steps, synced, sync }) {
  const { settings } = app;

  // About's own rows: Sync status ("Last synced 14:05"; none in a static app), Privacy policy and Terms (only when
  // APP.privacyUrl / APP.termsUrl are set in config.js; links), and the licences
  const syncText = () => { const t = synced(); return t ? `Last synced ${timeText(`${pad2(new Date(t).getHours())}:${pad2(new Date(t).getMinutes())}`)}` : 'Not synced yet'; };
  const paintSync = () => {
    for (const r of document.querySelectorAll('#settings-host .ui-about-extra')) {
      if (r.querySelector('.ui-row-main')?.textContent === 'Sync status') { const v = r.querySelector('.ui-setting-value'); if (v) v.textContent = syncText(); }
    }
  };
  const goTo = (/** @type {string} */ title) => /** @type {HTMLElement | undefined} */ ([...document.querySelectorAll('#settings-host .ui-settings-go')]
    .find(b => b.textContent?.trim().startsWith(title)))?.click();
  const links = /** @type {[string, unknown][]} */ ([['Privacy policy', /** @type {any} */ (APP).privacyUrl], ['Terms of service', /** @type {any} */ (APP).termsUrl]]);
  const aboutRows = [
    ...(sync ? [{ label: 'Sync status', value: syncText() }] : []),
    ...links.filter(([, u]) => typeof u === 'string' && /^https:\/\//.test(u)).map(([label, u]) => ({ label, href: /** @type {string} */ (u), value: 'Open' })),
    { label: LICENCES, sub: 'The libraries this app is built with', run: () => goTo(LICENCES) },
  ];
  const status$ = /** @type {any} */ (app).status$;
  if (sync && typeof status$ === 'function') status$.call(app, () => queueMicrotask(paintSync));

  /** @type {SettingSection[]} */
  const own = [
    // the account block (index.html #account, cloud app only) lives on its own page, as the first row of the menu
    ...(document.getElementById('account') ? [{ title: 'Account', icon: MORE.circleUser, group: '', find: 'sign out email profile',
      mount: /** @param {HTMLElement} host */ host => { host.append(/** @type {HTMLElement} */ (document.getElementById('account'))); } }] : []),
    { title: 'Theme', icon: MORE.palette, sub: 'Colours, dark mode and style', group: 'Personalization', find: 'look colour dark light density glass appearance', mount: themePage },
    { title: 'App icon', icon: MORE.shapes, sub: 'The icon on your home screen', group: 'Personalization', find: 'icon home screen logo', mount: host => {
      const list = el('ul', 'ui-list td-icon-list');
      list.setAttribute('role', 'radiogroup');
      list.setAttribute('aria-label', 'App icon');
      for (const id of APP_ICONS) {
        const li = document.createElement('li');
        const b = radio('ui-row td-icon-row', settings.get('appIcon') === id);
        b.dataset.icon = id;
        const img = Object.assign(document.createElement('img'), { src: id === 'default' ? 'icons/icon.svg' : `icons/variants/${id}.svg`, alt: '', width: 56, height: 56 });
        b.append(img, el('span', 'td-icon-name', APP_ICON_WORDS[id] ?? id), icon(ICONS.check, { class: 'td-icon-tick' }));
        b.addEventListener('click', () => { settings.set('appIcon', id); pick(list, b); });
        li.append(b);
        list.append(li);
      }
      host.append(list, el('p', 'td-settings-caption', 'The tab and a home screen shortcut made from now on use this icon. A shortcut you already have keeps its icon until you add it again.'));
    } },
    { title: 'Navigation bar', icon: MORE.smartphone, group: 'Personalization', find: 'arrange tabs order tab bar add button left right center', mount: host => {
      // the add button's place: a little phone per place, a radio under each
      const places = el('div', 'td-fab-places');
      places.setAttribute('role', 'radiogroup');
      places.setAttribute('aria-label', 'Add button');
      for (const [id, word] of FAB_PLACES) {
        const b = radio('td-fab-place', (settings.get('fabPos') ?? 'right') === id);
        b.dataset.place = id;
        const phone = el('span', 'td-fab-phone');
        phone.append(el('span', 'td-fab-lines'), el('span', 'td-fab-dot'));
        b.append(phone, el('span', 'td-fab-word', word), el('span', 'td-fab-radio'));
        b.addEventListener('click', () => { settings.set('fabPos', id); pick(places, b); });
        places.append(b);
      }
      const tabsHost = el('div', '');
      host.append(el('h3', 'td-settings-sub', 'Add button'), places, el('h3', 'td-settings-sub', 'Buttons'), tabsHost);
      let stop = () => {};
      const draw = () => { stop(); stop = tabArranger(tabsHost, { tabs: barTabs(), get: () => settings.get('tabs'), set: v => settings.set('tabs', v), rules }); };
      repaints.add(draw);
      draw();
      return () => { repaints.delete(draw); stop(); };
    } },
    { title: 'Import from Todoist', icon: MORE.folderInput, sub: 'Bring your projects and tasks over', group: 'More', find: 'migrate move api token tasks',
      mount: host => onShow(host, async h => (await import('./import.js')).importScreen(h, { app, openInbox: () => tabButton('inbox')?.click() })) },
    { title: 'Export to Todoist', icon: MORE.folderInput, sub: 'Copy your tasks there, or save a backup file', group: 'More', find: 'migrate move copy api token tasks backup download file json',
      mount: host => onShow(host, async h => (await import('./export.js')).exportScreen(h, { app })) },
    { title: LICENCES, icon: MORE.scale, group: 'More', find: 'licence license open source', mount: host => onShow(host, async h => {
      const box = el('div', 'td-licences');
      h.append(box);
      for (const [name, url] of VENDOR) {
        const pre = el('pre', 'td-licence', 'Loading…');
        box.append(el('h3', 'td-settings-sub', name), pre);
        fetch(url).then(r => (r.ok ? r.text() : Promise.reject(new Error(String(r.status))))).then(t => { pre.textContent = t.trim(); }, () => { pre.textContent = 'Could not load the licence text.'; });
      }
      box.append(el('p', 'td-settings-caption', 'Icons: Lucide (ISC licence).'));
      return { leave: () => {}, destroy: () => box.remove() };
    }) },
    // admins: the people asking for access (requests/{uid}), each let in or declined
    { title: 'Access requests', icon: MORE.user, sub: 'Let people in who signed in with Google', group: 'More', find: 'people users members invite approve access sign up',
      visible: () => !!(/** @type {any} */ (app).members?.admin?.()),
      mount: host => onShow(host, async h => (await import('./people.js')).peopleScreen(h, { members: /** @type {any} */ (app).members })) },
    // the recipes' own pages (an empty slot adds none)
    ...Object.values(modules.settingsPages ?? {}).flatMap(slot => { const section = slot?.({ app }); return section ? [section] : []; }),
  ];

  // the option pages' own parts, after their rows
  /** @type {Record<string, (host: HTMLElement) => (() => void) | void>} */
  const parts = {
    'Navigation menu': host => {
      const head = headingRow(host, 'Menu items');
      const all = /** @type {HTMLButtonElement} */ (el('button', 'td-link-btn'));
      all.type = 'button';
      const boxes = el('ul', 'ui-list td-menu-items');
      const onBar = (/** @type {string} */ id) => ['inbox', 'today', 'upcoming'].includes(id) && !arranged().hidden.includes(id) && barTabs().some(t => t.id === id);
      const draw = () => {
        const hidden = /** @type {string[]} */ (settings.get('browseHidden') ?? []);
        const free = BROWSE_ROWS.filter(id => !onBar(id));
        all.textContent = free.every(id => hidden.includes(id)) ? 'Show all' : 'Hide all';
        boxes.replaceChildren(...BROWSE_ROWS.map(id => {
          const li = document.createElement('li');
          const [word, ic] = BROWSE_WORDS[id];
          const label = el('label', 'ui-row td-menu-item');
          const box = Object.assign(document.createElement('input'), { type: 'checkbox', className: 'td-check', checked: !hidden.includes(id) && !onBar(id), disabled: onBar(id) });
          box.dataset.item = id;
          box.addEventListener('change', () => settings.set('browseHidden', box.checked ? hidden.filter(x => x !== id) : [...hidden, id]));
          const text = el('span', 'ui-row-main', word);
          if (onBar(id)) text.append(el('span', 'ui-row-sub', 'On the tab bar'));
          label.append(box, icon(ic, { class: 'td-menu-icon' }), text);
          li.append(label);
          return li;
        }));
      };
      all.addEventListener('click', () => {
        const free = BROWSE_ROWS.filter(id => !onBar(id));
        const hidden = /** @type {string[]} */ (settings.get('browseHidden') ?? []);
        settings.set('browseHidden', free.every(id => hidden.includes(id)) ? [] : free);
      });
      head?.classList.add('td-subhead-end');
      head?.append(all);
      host.append(boxes, el('p', 'td-settings-caption', 'Items that are on the tab bar are left out of the menu.'));
      const stopWatch = settings.watch('browseHidden', draw);
      repaints.add(draw);
      draw();
      return () => { repaints.delete(draw); stopWatch?.(); };
    },
    Productivity: host => {
      // the days off: a square per weekday, in the week's order, after the "Days off" heading
      const head = headingRow(host, 'Days off');
      const li = el('li', 'td-days-off');
      const days = el('div', 'td-days');
      days.setAttribute('role', 'group');
      days.setAttribute('aria-label', 'Days off');
      li.append(days);
      head?.after(li);
      const draw = () => {
        const off = /** @type {number[]} */ (settings.get('daysOff') ?? []);
        const start = Number(settings.get('weekStart') ?? 1);
        days.replaceChildren(...Array.from({ length: 7 }, (_, i) => {
          const d = (start + i) % 7;
          const b = /** @type {HTMLButtonElement} */ (el('button', 'td-day', WEEKDAYS[d].slice(0, 1)));
          b.type = 'button';
          b.dataset.day = String(d);
          b.setAttribute('aria-label', WEEKDAYS[d]);
          b.setAttribute('aria-pressed', String(off.includes(d)));
          b.addEventListener('click', () => settings.set('daysOff', off.includes(d) ? off.filter(x => x !== d) : [...off, d]));
          return b;
        }));
      };
      const a = settings.watch('daysOff', draw), b = settings.watch('weekStart', draw);
      draw();
      return () => { li.remove(); a?.(); b?.(); };
    },
    Reminders: host => {
      const head = headingRow(host, 'Reminders not working?');
      const li = el('li', '');
      const b = /** @type {HTMLButtonElement} */ (el('button', 'ui-row td-info-row'));
      b.type = 'button';
      b.append(icon(MORE.info, { class: 'td-menu-icon' }), el('span', 'ui-row-main', 'Check notification settings'), icon(ICONS.chevronRight, { class: 'td-browse-chevron' }));
      b.addEventListener('click', () => { /** @type {HTMLElement | null} */ (document.querySelector('.ui-bar .ui-bar-back'))?.click(); setTimeout(() => goTo('Notifications'), 350); });
      li.append(b);
      head?.after(li);
      return () => li.remove();
    },
    Notifications: host => {
      const line = el('p', 'td-settings-caption td-notify-state');
      const say = () => {
        const can = 'serviceWorker' in navigator && 'PushManager' in globalThis && typeof Notification !== 'undefined';
        line.textContent = !can ? 'This browser cannot show notifications.'
          : Notification.permission === 'granted' ? 'Notifications are allowed for this app.'
            : Notification.permission === 'denied' ? 'Notifications are blocked. Allow them for this site in the browser settings.'
              : 'You will be asked to allow notifications when you turn this on.';
      };
      say();
      host.append(line);
      const stop = settings.watch('reminders', () => setTimeout(say, 500));
      return () => { stop?.(); line.remove(); };
    },
  };

  const note = () => el('p', 'td-settings-caption td-device-note', 'Settings on this page apply to this device.');
  /** @param {SettingSection} s @returns {SettingSection} */
  const withParts = s => {
    const part = parts[s.title], mount = s.mount;
    if (!part && !mount && NO_NOTE.includes(s.title)) return s;
    return { ...s, mount: host => {
      const stops = [mount?.(host), part?.(host)];
      if (!NO_NOTE.includes(s.title)) host.append(note());
      return () => { for (const f of stops) if (typeof f === 'function') f(); };
    } };
  };

  settingsScreen($('settings-host'), {
    settings,
    menu: { steps, onPage, search: false },
    labels: { appGroup: 'More' },
    sections: byGroup([...SETTING_SECTIONS, ...own]).map(withParts),
    about: { name: APP.title || APP.name, update: app.update, rows: aboutRows },
  });
  // the licences open from About, not from the menu
  for (const b of document.querySelectorAll('#settings-host .ui-settings-go')) {
    if (b.textContent?.trim().startsWith(LICENCES)) /** @type {HTMLElement} */ (b.closest('li') ?? b).hidden = true;
  }
  paintSync();
}
