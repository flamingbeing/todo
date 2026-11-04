// The task view at 840 px and up (task-sheet.js loads this only then): the same #task-sheet, as a dialog in the middle
// of the page with two sides (wide.css, #task-sheet[data-td-modal]). The head: where the task is at the left; at the
// right the task before and after it in the list it was opened from, the menu and Close. The left side holds the
// box, the title, the description, the sub-tasks and the comments (task-sheet.js's own parts, so every change saves as
// on a phone); the rail at the right lists Project, Date, Deadline, Priority, Labels and Reminders, each opening its
// picker. Closing puts the focus back on the row it was opened from. Shift+Delete deletes the task, Ctrl+C (with
// nothing selected) copies its link.
import { icon } from '@core/ui';
import { ICONS } from '../icons.js';
import { MORE } from '../icons-more.js';
import { el } from '../screens/pick.js';
import { neighbours, RAIL } from './modal-parts.js';

/** @typedef {import('app-ui/icons/lucide.js').IconNodes} IconNodes */

/** the screen the task was opened from, and its id there (for the row to give the focus back to) */
let from = /** @type {Element | null} */ (null);
let first = '';
/** what the keys do while the dialog shows (the task on top's) */
let keys = /** @type {{ remove: () => void, copy: () => void } | null} */ (null);
let wired = false;

/** the visible rows' ids of the list it was opened from, in order */
const listIds = () => !from?.isConnected ? [] : /** @type {HTMLElement[]} */ ([...from.querySelectorAll('li.td-row[data-id]')])
  .filter(li => li.getClientRects().length && !li.closest('dialog')).map(li => /** @type {string} */ (li.dataset.id));

/**
 * The task is opening (the dialog was shut): remember the list and the row it came from.
 * @param {HTMLDialogElement} sheet @param {string} id
 */
export function remember(sheet, id) {
  const at = document.activeElement instanceof Element && !sheet.contains(document.activeElement) ? document.activeElement : null;
  const row = at?.closest('li.td-row[data-id]') ?? document.querySelector(`.ui-screen:not([hidden]) li.td-row[data-id="${CSS.escape(id)}"]`);
  from = row?.closest('.ui-screen') ?? null;
  first = row instanceof HTMLElement ? String(row.dataset.id) : id;
  if (wired) return;
  wired = true;
  sheet.addEventListener('close', () => {
    if (!sheet.hasAttribute('data-td-modal')) return;
    // (after the kit's own focus step: the row may have been drawn again since)
    setTimeout(() => {
      const row = from?.querySelector(`li.td-row[data-id="${CSS.escape(first)}"] .td-row-main`);
      if (row instanceof HTMLElement) row.focus({ preventScroll: true });
    });
  });
  trapTab(sheet, () => sheet.hasAttribute('data-td-modal'));
  sheet.addEventListener('keydown', e => {
    if (!sheet.hasAttribute('data-td-modal') || !keys) return;
    const t = /** @type {Element} */ (e.target), typing = !!t.closest?.('input,textarea,select,[contenteditable]');
    if (e.key === 'Delete' && e.shiftKey && !typing) { e.preventDefault(); keys.remove(); }
    else if (e.key.toLowerCase() === 'c' && (e.ctrlKey || e.metaKey) && !typing && !String(getSelection() ?? '')) { e.preventDefault(); keys.copy(); }
  });
}

/**
 * Keeps Tab inside an open dialog: past its last control back to its first, and Shift+Tab the other way (a native modal
 * dialog lets Tab out to the browser's own bar).
 * @param {HTMLDialogElement} dialog @param {() => boolean} [on]  whether it applies now
 */
export function trapTab(dialog, on = () => true) {
  dialog.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || !on()) return;
    const all = /** @type {HTMLElement[]} */ ([...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')])
      .filter(x => !(/** @type {HTMLButtonElement} */ (x).disabled) && x.tabIndex >= 0 && x.getClientRects().length && !x.closest('[inert], .td-menu-layer'));
    if (!all.length) return;
    const first = /** @type {HTMLElement} */ (all[0]), last = /** @type {HTMLElement} */ (all[all.length - 1]);
    if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  });
}

/** a 28 px square button in the head @param {IconNodes} ic @param {string} label @param {() => void} run */
function headButton(ic, label, run) {
  const b = /** @type {HTMLButtonElement} */ (el('button', 'td-modal-btn'));
  b.type = 'button';
  b.setAttribute('aria-label', label);
  b.append(icon(ic));
  b.addEventListener('click', run);
  return b;
}

/**
 * Lays the dialog out with the task's parts.
 * @param {HTMLDialogElement} sheet
 * @param {{ body: HTMLElement, head: HTMLElement, up: HTMLElement, more: HTMLElement, left: HTMLElement[], id: string,
 *   go: (id: string) => void, picks: Record<string, () => void>, writable: boolean, remove: () => void, copy: () => void }} o
 * @returns {(values: Record<string, Node[] | null>) => void}  shows the rail's values (null: not set, a "+", named "Label: add")
 */
export function layout(sheet, { body, head, up, more, left, id, go, picks, writable, remove, copy }) {
  keys = { remove: writable ? remove : () => {}, copy };
  const { prev, next } = neighbours(listIds(), id);
  const before = headButton(MORE.chevronUp, 'Previous task', () => { if (prev) go(prev); });
  const after = headButton(ICONS.chevronDown, 'Next task', () => { if (next) go(next); });
  before.disabled = !prev; after.disabled = !next;
  const close = headButton(MORE.x, 'Close', () => sheet.close());
  more.classList.add('td-modal-btn');
  head.replaceChildren(up, el('span', 'td-modal-gap'), before, after, more, close);

  const side = el('div', 'td-modal-left');
  side.append(...left);
  const rail = el('aside', 'td-modal-rail');
  rail.setAttribute('aria-label', 'Details');
  /** @type {Map<string, HTMLButtonElement>} */
  const blocks = new Map();
  for (const [key, label] of RAIL) {
    const b = /** @type {HTMLButtonElement} */ (el('button', 'td-rail-block'));
    b.type = 'button';
    b.dataset.rail = key;
    b.disabled = !writable;
    b.addEventListener('click', () => picks[key]?.());
    blocks.set(key, b);
    rail.append(b);
  }
  const panes = el('div', 'td-modal-panes');
  panes.append(side, rail);
  body.replaceChildren(head, panes);

  return values => {
    for (const [key, label] of RAIL) {
      const b = /** @type {HTMLButtonElement} */ (blocks.get(key)), v = values[key];
      const top = el('span', 'td-rail-label', label);
      if (!v) {
        b.replaceChildren(top, icon(ICONS.plus, { class: 'td-rail-plus' }));
        b.setAttribute('aria-label', `${label}: add`);
        continue;
      }
      const value = el('span', 'td-rail-value');
      value.append(...v);
      b.replaceChildren(top, value);
      b.removeAttribute('aria-label');   // (its words name it: the label, then the value)
    }
  };
}

/**
 * The "•••" menu as a card under its button (openMenu's popover): the day it was added on top, hints at the ends.
 * @param {string} added  "Added on …" or ''
 */
export function dressMenu(added) {
  const menu = document.querySelector('#task-sheet > .td-menu-layer:last-of-type > .td-menu');
  if (!(menu instanceof HTMLElement)) return;
  menu.classList.add('td-modal-menu');
  if (added) menu.prepend(el('div', 'ui-menu-note', added));
  const hint = (/** @type {string} */ label, /** @type {string} */ text) => {
    const b = [...menu.querySelectorAll('.ui-menu-item')].find(i => i.textContent?.trim() === label);
    b?.append(el('span', 'td-modal-hint', text));
  };
  const mac = /Mac|iP(hone|ad)/.test(navigator.platform);
  hint('Copy link to task', mac ? '⌘ C' : 'Ctrl C');
  hint('Delete task', 'Shift Delete');
}
