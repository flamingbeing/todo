// The Edit task page (#edit-task-sheet), opened by the task menu's "Edit task" and loaded with the task sheet: a full-height
// sheet with a back arrow, the title "Edit task" and a Save button that stays grey until the name or the description
// differs (and the name is not empty). The name sits in a card with its circle, the description in a card of its own
// with a lines icon; the cursor goes to the end of the name with the keyboard up. Save writes both in one change through
// the write queue and closes; Back (or a swipe down) closes with nothing saved, and the task sheet is there as it was.
import { icon } from '@core/ui';
import { ICONS } from '../icons.js';
import { MORE } from '../icons-more.js';
import { REFUSED } from '../items.js';
import { priorityOf } from '../tasks.js';
import { el } from './pick.js';

/** @typedef {import('./views.js').Ctx} Ctx */
/** @typedef {import('../items.js').Task} Task */

/** @param {Ctx} ctx @param {Task} task */
export function openEditTask(ctx, task) {
  const sheet = /** @type {HTMLDialogElement} */ (document.getElementById('edit-task-sheet'));
  const body = /** @type {HTMLElement} */ (sheet.querySelector('[data-fill]'));
  const id = task.id, was = { title: task.title, description: String(task.description ?? '') };

  const head = el('div', 'td-sheet-head td-edit-head');
  const back = /** @type {HTMLButtonElement} */ (el('button', 'td-round td-sheet-x'));
  back.type = 'button'; back.setAttribute('aria-label', 'Back'); back.append(icon(MORE.arrowLeft));
  back.addEventListener('click', () => sheet.close());
  const h = el('h2', 'td-sheet-title', 'Edit task');
  h.id = 'edit-task-title';
  sheet.setAttribute('aria-labelledby', h.id);
  const save = /** @type {HTMLButtonElement} */ (el('button', 'td-sheet-done', 'Save'));
  save.type = 'button'; save.disabled = true;
  head.append(back, h, save);

  // the name: its circle (in the priority's colour) and the words
  const nameCard = el('div', 'td-card td-task-card td-edit-card');
  nameCard.dataset.priority = String(priorityOf(task));
  const circle = el('span', 'td-check');
  circle.setAttribute('aria-hidden', 'true');
  circle.append(icon(ICONS.check, { class: 'td-check-mark' }));
  const title = /** @type {HTMLTextAreaElement} */ (el('textarea', 'td-task-title'));
  title.rows = 1; title.maxLength = 500; title.value = was.title; title.setAttribute('aria-label', 'Task name'); title.enterKeyHint = 'done';
  const words = el('div', 'td-task-words');
  words.append(title);
  nameCard.append(circle, words);

  // the description
  const descCard = el('div', 'td-card td-edit-desc');
  const lines = icon(MORE.textAlignStart, { class: 'td-edit-lines' });
  const desc = /** @type {HTMLTextAreaElement} */ (el('textarea', 'td-task-desc'));
  desc.rows = 1; desc.maxLength = 16000; desc.placeholder = 'Description'; desc.value = was.description; desc.setAttribute('aria-label', 'Description');
  descCard.append(lines, desc);

  const grow = (/** @type {HTMLTextAreaElement} */ a) => { a.style.height = 'auto'; a.style.height = `${a.scrollHeight}px`; };
  const changed = () => !!title.value.trim() && (title.value.trim() !== was.title || desc.value !== was.description);
  for (const a of [title, desc]) a.addEventListener('input', () => { grow(a); save.disabled = !changed(); });
  title.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); desc.focus(); } });

  save.addEventListener('click', async () => {
    if (save.disabled) return;
    const now = ctx.data().tasks.find(t => t.id === id);
    if (!now) { sheet.close(); return; }
    save.disabled = true;
    /** @type {import('../items.js').Fields} */
    const patch = {};
    if (title.value.trim() !== now.title) patch.title = title.value.trim();
    if (desc.value !== String(now.description ?? '')) patch.description = desc.value;
    if (Object.keys(patch).length && await ctx.app.editTask(now, patch)) { ctx.toast(REFUSED); save.disabled = !changed(); return; }
    sheet.close();
  });

  body.replaceChildren(head, nameCard, descCard);
  if (!sheet.open) sheet.showModal();
  grow(title); grow(desc);
  title.focus();
  title.setSelectionRange(title.value.length, title.value.length);
}
