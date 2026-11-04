// A mouse over a task row on the wide list pages (840 px and up, and a mouse: wide/side.js loads this file on the first
// mouse move, so a phone, a tablet or a touch screen never does). The row is shaded (wide.css) and gets:
//   three buttons at its right   Date (the scheduler), Comment (the task, at its comments), More (the row's menu, as a hold)
//   a grip left of its ring      pressing it lifts the row at once (ui/row-drag.js), to drag it
// One set of buttons moves from row to row. Touch keeps its swipes and its hold; nothing here reacts to a finger or a pen.
import { icon } from '@core/ui';
import { ICONS } from '../icons.js';
import { MORE } from '../icons-more.js';
import { el } from '../screens/pick.js';

/** @typedef {import('../screens/views.js').Ctx} Ctx */
/** @typedef {import('../items.js').Task} Task */

const LISTS = '#today, #inbox, #project, #place';
let started = false;

/** @param {Ctx} ctx @param {PointerEvent} [first]  the move that loaded this file (its row gets the buttons) */
export function startHover(ctx, first) {
  if (started) return;
  started = true;
  const big = matchMedia('(min-width: 840px)');

  const bar = el('span', 'td-hover-actions');
  const button = (/** @type {string} */ label, /** @type {import('app-ui/icons/lucide.js').IconNodes} */ nodes, /** @type {(t: Task, row: HTMLElement) => void} */ run) => {
    const b = /** @type {HTMLButtonElement} */ (el('button', ''));
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.title = label;
    b.append(icon(nodes));
    b.addEventListener('click', e => {
      e.stopPropagation();
      const row = /** @type {HTMLElement | null} */ (b.closest('.td-row'));
      const t = row && ctx.data().tasks.find(x => x.id === row.dataset.id);
      if (row && t) run(t, row);
    });
    bar.append(b);
    return b;
  };
  const date = button('Date', ICONS.calendar, t => { void import('../screens/select.js').then(m => m.scheduleTasks(ctx, [t])); });
  button('Comment', ICONS.messageSquare, t => { ctx.openTask(t); toComments(); });
  const more = button('More actions', ICONS.ellipsis, (t, row) => {
    const host = /** @type {HTMLElement | null} */ (row.closest(LISTS));
    if (host) void import('../screens/select.js').then(m => m.holdMenu(ctx, t, row, host));
  });
  const grip = el('span', 'td-grip');
  grip.setAttribute('aria-hidden', 'true');
  grip.append(icon(MORE.gripVertical));

  const over = (/** @type {PointerEvent} */ e) => {
    if (e.pointerType !== 'mouse' || !big.matches) return;
    const row = /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest?.('.td-row'));
    const host = row?.closest(LISTS);
    if (!row || !host || host.classList.contains('td-board') || !row.dataset.id || row === bar.parentElement) return;
    if (row.classList.contains('is-lifted') || row.classList.contains('is-swiping')) return;
    const write = ctx.canWrite();
    date.hidden = more.hidden = !write;
    grip.hidden = !write;
    row.append(grip, bar);
  };
  document.addEventListener('pointerover', over, { passive: true });
  if (first) over(first);
}

/** once the task view is open, its comment field in sight and focused */
function toComments() {
  const until = performance.now() + 2000;
  const look = () => {
    const f = /** @type {HTMLTextAreaElement | null} */ (document.querySelector('#task-sheet textarea[aria-label="Add a comment"]'));
    if (f && f.offsetParent) { f.scrollIntoView({ block: 'center' }); f.focus({ preventScroll: true }); return; }
    if (performance.now() < until) requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
}
