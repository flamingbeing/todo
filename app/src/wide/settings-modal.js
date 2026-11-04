// Settings at 840 px and up (side.js installs the hook that loads this only then): a dialog in the middle of the page
// (wide.css, #settings-modal) instead of the pushed Settings screen. At the left a nav: "Settings", a search field that
// keeps the rows whose page holds every word typed, and one row per page (its icon and title); at the right the page
// picked, under a head with its title and Close. The pages are the kit's own (#settings-host, built by
// screens/settings.js), moved into the dialog while it shows and put back as they were when it closes, so every
// option saves as it does on a phone. One page shows at a time, by its hidden flag: no history step of its own, so
// Escape, Back and the backdrop close the whole dialog (the kit's detentSheet), and the focus goes back to the opener.
// Narrowed below 840 px while open, it closes and the same page opens as the phone's Settings screen.
import { detentSheet, sheetsSettled, icon } from '@core/ui';
import { MORE } from '../icons-more.js';
import { el } from '../screens/pick.js';
import { openSettingsPage, screens } from '../shell.js';
import { navMatch } from './modal-parts.js';
import { trapTab } from './task-modal.js';

const WIDE = '(min-width: 840px)';
/** @type {{ dialog: HTMLDialogElement, api: ReturnType<typeof detentSheet>, rows: HTMLElement, search: HTMLInputElement, title: HTMLElement, body: HTMLElement } | null} */
let ui = null;
/** the page shown (its title) */
let selected = '';
/** where #settings-host lives on the phone's screen, and how its parts were (put back on close) */
let home = /** @type {Comment | null} */ (null);
let before = /** @type {[HTMLElement, boolean][]} */ ([]);

const host = () => /** @type {HTMLElement} */ (document.getElementById('settings-host'));
const front = () => /** @type {HTMLElement | null} */ (host().querySelector('.ui-settings-menu'));
const until = async (/** @type {() => unknown} */ ok) => { for (let i = 0; i < 80 && !ok(); i++) await new Promise(r => setTimeout(r, 50)); return !!ok(); };

/** the pages: each menu row with its section (the kit adds them in the same order), its title and whether it is listed */
function pages() {
  const menu = front();
  if (!menu?.parentElement) return [];
  const secs = /** @type {HTMLElement[]} */ ([...menu.parentElement.querySelectorAll(':scope > section.ui-settings-group')]);
  return /** @type {HTMLElement[]} */ ([...menu.querySelectorAll('.ui-settings-menu-groups .ui-settings-go')]).map((go, i) => ({
    go, section: secs[i], title: String(go.querySelector('.ui-row-main')?.firstChild?.textContent ?? '').trim(),
    listed: !go.closest('li')?.hidden,
  })).filter(p => p.section && p.title);
}

/** the Settings screen is built the first time its page shows: shown and hidden again in one go (no paint between) */
async function built() {
  if (front()) return true;
  const page = /** @type {HTMLElement} */ (document.getElementById('settings-page'));
  if (page.hidden) { page.hidden = false; await Promise.resolve(); page.hidden = true; }
  return until(front);
}

function make() {
  const dialog = /** @type {HTMLDialogElement} */ (el('dialog', 'ui-sheet td-sheet td-settings-modal'));
  dialog.id = 'settings-modal';
  dialog.setAttribute('data-detents', 'large');
  dialog.setAttribute('data-wide', 'panel');
  dialog.setAttribute('aria-labelledby', 'settings-modal-title');
  const nav = el('nav', 'td-set-nav');
  nav.setAttribute('aria-label', 'Settings');
  const head = el('h2', 'td-set-nav-head', 'Settings');
  const find = el('label', 'td-set-search');
  const search = /** @type {HTMLInputElement} */ (el('input', ''));
  search.type = 'search'; search.placeholder = 'Search'; search.autocomplete = 'off'; search.setAttribute('aria-label', 'Search settings');
  find.append(icon(MORE.search, { class: 'td-set-search-icon' }), search);
  const rows = el('ul', 'td-set-rows');
  nav.append(head, find, rows);
  const main = el('div', 'td-set-main');
  const top = el('div', 'td-set-head');
  const title = el('h2', 'td-set-title');
  title.id = 'settings-modal-title';
  const close = /** @type {HTMLButtonElement} */ (el('button', 'td-modal-btn'));
  close.type = 'button'; close.setAttribute('aria-label', 'Close'); close.append(icon(MORE.x));
  close.addEventListener('click', () => api.close());
  top.append(title, close);
  const body = el('div', 'td-set-body');
  main.append(top, body);
  dialog.append(nav, main);
  document.body.append(dialog);
  const api = detentSheet(dialog);
  trapTab(dialog);
  search.addEventListener('input', () => filter());
  dialog.addEventListener('close', putBack);
  matchMedia(WIDE).addEventListener('change', e => {
    if (e.matches || !dialog.open) return;
    const at = selected;
    putBack();   // (now: the close event comes a task later)
    // the phone's page opens once the dialog's own history step has gone back (else that step back shuts the page)
    dialog.addEventListener('close', () => setTimeout(() => void sheetsSettled().then(() => openSettingsPage(at)), 120), { once: true });
    dialog.close();
  });
  return { dialog, api, rows, search, title, body };
}

/** the rows whose page holds every word typed */
function filter() {
  if (!ui) return;
  const q = ui.search.value;
  const all = pages();
  for (const li of /** @type {HTMLElement[]} */ ([...ui.rows.children])) {
    const p = all.find(x => x.title === li.dataset.title);
    li.hidden = !!p && !navMatch(q, p.title, p.section.textContent ?? '');
  }
}

/** shows one page (by its title) and marks its row @param {string} title */
function show(title) {
  if (!ui) return;
  const all = pages().filter(p => p.listed);
  const pick = all.find(p => p.title === title) ?? all[0];
  if (!pick) return;
  selected = pick.title;
  const menu = front();
  if (menu) menu.hidden = true;
  for (const p of pages()) p.section.hidden = p.section !== pick.section;
  for (const b of ui.rows.querySelectorAll('button')) {
    if (b.closest('li')?.dataset.title === pick.title) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  ui.title.textContent = pick.title;
  ui.body.scrollTop = 0;
}

/** the nav's rows, one per listed page (drawn on each opening: a page can come and go with an option) */
function drawRows() {
  if (!ui) return;
  const lis = pages().filter(p => p.listed).map(p => {
    const li = el('li', '');
    li.dataset.title = p.title;
    const b = /** @type {HTMLButtonElement} */ (el('button', 'td-set-row'));
    b.type = 'button';
    const ic = p.go.querySelector('.ui-settings-icon');
    if (ic) b.append(ic.cloneNode(true));
    b.append(el('span', '', p.title));
    b.addEventListener('click', () => show(p.title));
    li.append(b);
    return li;
  });
  ui.rows.replaceChildren(...lis);
}

/** the pages back on the phone's screen, as they were */
function putBack() {
  const h = host();
  for (const [part, hidden] of before) part.hidden = hidden;
  before = [];
  if (home?.parentNode) { home.replaceWith(h); home = null; }
}

/**
 * Opens Settings as the dialog, on a page (its title, as its menu row starts) or the one shown last.
 * @param {string} [title] @returns {Promise<void>}
 */
export async function openSettingsModal(title) {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (!await built()) { screens()?.push('#settings-page'); return; }
  ui ??= make();
  if (ui.dialog.open) { if (title) show(pages().find(p => p.title.startsWith(title))?.title ?? title); return; }
  const h = host();
  const menu = front();
  before = /** @type {[HTMLElement, boolean][]} */ ([...(menu ? [menu] : []), ...pages().map(p => p.section)].map(x => [x, x.hidden]));
  for (const x of h.querySelectorAll('.is-slide-in, .is-slide-out')) x.classList.remove('is-slide-in', 'is-slide-out');
  home = document.createComment('settings-host');
  h.replaceWith(home);
  ui.body.append(h);
  ui.search.value = '';
  drawRows();
  show(title ? pages().find(p => p.title.startsWith(title))?.title ?? '' : selected);
  ui.api.open(opener);
  /** @type {HTMLElement | null} */ (ui.rows.querySelector('[aria-current="page"]'))?.focus({ preventScroll: true });
}
