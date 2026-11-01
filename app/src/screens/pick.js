// The small sheets the task sheet, quick add and the project sheet open over themselves (#pick-sheet): a list to pick
// one from (a project and section, a colour, a parent project). Dates have their own sheet (scheduler.js).
import { icon } from '@core/ui';
import { ICONS } from '../icons.js';
import { MORE } from '../icons-more.js';
import { INBOX } from '../items.js';
import { projectTree } from '../arrange.js';
import { colorHex } from '../colors.js';
import { byOrder } from '../order.js';

/** @typedef {{ label: string, icon?: import('app-ui/icons/lucide.js').IconNodes, color?: string, depth?: number, checked?: boolean, run: () => unknown }} Choice */

const sheet = () => /** @type {HTMLDialogElement} */ (document.getElementById('pick-sheet'));
/** @param {string} tag @param {string} cls @param {string} [text] */
export const el = (tag, cls, text) => { const e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e; };

/** the sheet's head: a round close button, the title, and optionally a Done @param {string} title @param {HTMLDialogElement} d @param {(() => void) | null} [done] */
export function sheetHead(title, d, done = null) {
  const head = el('div', 'td-sheet-head');
  const x = /** @type {HTMLButtonElement} */ (el('button', 'td-round td-sheet-x'));
  x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.append(icon(MORE.x));
  x.addEventListener('click', () => d.close());
  const h = el('h2', 'td-sheet-title', title);
  h.id = `${d.id}-title`;
  d.setAttribute('aria-labelledby', h.id);
  head.append(x, h);
  if (done) {
    const b = /** @type {HTMLButtonElement} */ (el('button', 'td-sheet-done', 'Done'));
    b.type = 'button'; b.addEventListener('click', done);
    head.append(b);
  } else head.append(el('span', 'td-sheet-spacer'));
  return head;
}

/** opens the pick sheet with a list; a pick closes it @param {string} title @param {Choice[]} choices */
export function pickOne(title, choices) {
  const d = sheet(), body = /** @type {HTMLElement} */ (d.querySelector('[data-fill]'));
  const list = el('ul', 'td-card td-choices');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', title);
  list.append(...choices.map(c => {
    const li = el('li', ''), b = /** @type {HTMLButtonElement} */ (el('button', 'td-choice'));
    b.type = 'button';
    b.setAttribute('role', 'option');
    b.setAttribute('aria-selected', String(!!c.checked));
    if (c.depth) b.style.setProperty('--depth', String(c.depth));
    if (c.icon) { const i = icon(c.icon, { class: 'td-choice-icon' }); if (c.color) i.style.color = c.color; b.append(i); }
    b.append(el('span', 'td-choice-label', c.label));
    if (c.checked) b.append(icon(ICONS.check, { class: 'td-choice-check' }));
    b.addEventListener('click', () => { d.close(); void c.run(); });
    li.append(b);
    return li;
  }));
  body.replaceChildren(sheetHead(title, d), list);
  if (!d.open) d.showModal();
  /** @type {HTMLElement | null} */ (list.querySelector('[aria-selected="true"]') ?? list.querySelector('button'))?.focus({ preventScroll: true });
}

/**
 * Picks a project and section: the Inbox and its sections, then every project with its sections under it.
 * @param {import('../items.js').Data} data @param {{ projectId: string, sectionId?: string | null }} now
 * @param {(to: { projectId: string, sectionId: string | null }) => unknown} done
 */
export function pickPlace(data, now, done) {
  /** @type {Choice[]} */
  const choices = [];
  const sectionsOf = (/** @type {string} */ pid, /** @type {number} */ depth) => byOrder(data.sections.filter(s => s.projectId === pid)).forEach(s => choices.push({
    label: s.name, icon: ICONS.listTree, depth: depth + 1, checked: now.projectId === pid && now.sectionId === s.id, run: () => done({ projectId: pid, sectionId: s.id }) }));
  choices.push({ label: 'Inbox', icon: ICONS.inbox, checked: now.projectId === INBOX && !now.sectionId, run: () => done({ projectId: INBOX, sectionId: null }) });
  sectionsOf(INBOX, 0);
  for (const { project: p, depth } of projectTree(data.projects.map(x => ({ ...x, collapsed: false })))) {
    choices.push({ label: p.name, icon: ICONS.hash, color: colorHex(p.color), depth, checked: now.projectId === p.id && !now.sectionId,
      run: () => done({ projectId: p.id, sectionId: null }) });
    sectionsOf(p.id, depth);
  }
  pickOne('Move to', choices);
}
