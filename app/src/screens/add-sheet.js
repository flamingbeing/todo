// Quick add (#add-sheet): a task's name and description, chips for its date and priority, its project at the foot and
// a round send button. It starts with what the page shown suggests (a project's page: that project; Today and
// Upcoming: a date) and stays open after each add, cleared, for the next task. Enter adds; Esc or a tap outside closes.
import { icon } from '@core/ui';
import { ICONS } from '../icons.js';
import { INBOX, REFUSED } from '../items.js';
import { placeText } from '../tasks.js';
import { dueLine, dayKey } from '../dates.js';
import { colorHex } from '../colors.js';
import { openMenu } from '../ui/menu.js';
import { el, pickPlace, pickDate } from './pick.js';

/** @typedef {import('./views.js').Ctx} Ctx */
/** @typedef {import('./views.js').AddContext} AddContext */

const PRIORITY_COLOR = ['', 'var(--td-p1)', 'var(--td-p2)', 'var(--td-p3)', 'var(--td-text-2)'];
const d = () => /** @type {HTMLDialogElement} */ (document.getElementById('add-sheet'));

/** @param {string} cls @param {string} label */
const button = (cls, label) => {
  const b = /** @type {HTMLButtonElement} */ (el('button', cls));
  b.type = 'button';
  b.setAttribute('aria-label', label);
  return b;
};

/** @param {Ctx} ctx @param {AddContext} start */
export function openQuickAdd(ctx, start) {
  const sheet = d(), body = /** @type {HTMLElement} */ (sheet.querySelector('[data-fill]'));
  /** what the next task gets besides its words */
  const next = { projectId: start.projectId ?? INBOX, sectionId: start.sectionId ?? null, parentId: start.parentId ?? null,
    due: start.due ?? null, priority: 4 };

  const form = /** @type {HTMLFormElement} */ (el('form', 'td-add'));
  const title = Object.assign(document.createElement('input'), { className: 'td-add-title', placeholder: 'Task name', maxLength: 500,
    autocomplete: 'off', enterKeyHint: 'send' });
  title.setAttribute('aria-label', 'Task name');
  const desc = Object.assign(document.createElement('textarea'), { className: 'td-add-desc', placeholder: 'Description', rows: 1, maxLength: 16000 });
  desc.setAttribute('aria-label', 'Description');
  desc.addEventListener('input', () => { desc.style.height = 'auto'; desc.style.height = `${desc.scrollHeight}px`; });

  // the chips: date, priority
  const chips = el('div', 'td-chips');
  const dateChip = button('td-chip', 'Date'), prioChip = button('td-chip', 'Priority');
  const drawChips = () => {
    const line = dueLine(next.due, dayKey());
    dateChip.replaceChildren(icon(ICONS.calendar), el('span', '', line?.text ?? 'Date'));
    dateChip.setAttribute('aria-label', line ? `Date: ${line.text}` : 'Date');
    if (line) dateChip.dataset.tone = line.tone; else delete dateChip.dataset.tone;
    dateChip.classList.toggle('is-set', !!line);
    const flag = icon(ICONS.flag);
    flag.style.color = PRIORITY_COLOR[next.priority];
    prioChip.replaceChildren(flag, el('span', '', next.priority === 4 ? 'Priority' : `P${next.priority}`));
    prioChip.setAttribute('aria-label', next.priority === 4 ? 'Priority' : `Priority: P${next.priority}`);
    prioChip.classList.toggle('is-set', next.priority !== 4);
  };
  dateChip.addEventListener('click', () => pickDate(next.due, due => { next.due = due; drawChips(); title.focus(); }));
  prioChip.addEventListener('click', () => openMenu(prioChip, [1, 2, 3, 4].map(p => ({
    label: `Priority ${p}`, icon: ICONS.flag, color: PRIORITY_COLOR[p], checked: next.priority === p,
    run: () => { next.priority = p; drawChips(); title.focus(); } })), { label: 'Priority' }));
  chips.append(dateChip, prioChip);

  // the foot: where it goes, and send
  const foot = el('div', 'td-add-foot');
  const place = button('td-add-place', 'Project');
  const drawPlace = () => {
    const p = ctx.data().projects.find(x => x.id === next.projectId);
    const i = icon(next.projectId === INBOX ? ICONS.inbox : ICONS.hash);
    if (next.projectId !== INBOX) i.style.color = colorHex(p?.color);
    const words = placeText(/** @type {import('../items.js').Task} */ ({ id: '', title: '-', projectId: next.projectId, sectionId: next.sectionId }), ctx.data().projects, ctx.data().sections);
    place.replaceChildren(i, el('span', '', words), icon(ICONS.chevronDown, { class: 'td-add-place-more' }));
    place.setAttribute('aria-label', `Project: ${words}`);
  };
  place.addEventListener('click', () => pickPlace(ctx.data(), next, to => { next.projectId = to.projectId; next.sectionId = to.sectionId; next.parentId = null; drawPlace(); title.focus(); }));
  const send = /** @type {HTMLButtonElement} */ (el('button', 'td-send'));
  send.type = 'submit';
  send.setAttribute('aria-label', 'Add task');
  send.append(icon(ICONS.arrowUp));
  const ready = () => { send.disabled = !title.value.trim(); };
  title.addEventListener('input', ready);
  foot.append(place, send);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const words = title.value.trim(), about = desc.value.trim();
    if (!words) return;
    title.value = ''; desc.value = ''; desc.style.height = ''; ready();
    title.focus();
    const refused = await ctx.app.addTask({ title: words, description: about || undefined, ...next, due: next.due ?? undefined });
    if (refused) ctx.toast(refused === 'A task needs a title' ? refused : REFUSED);
  });
  desc.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });

  form.append(title, desc, chips, foot);
  body.replaceChildren(form);
  drawChips(); drawPlace(); ready();
  if (!sheet.open) sheet.showModal();
  title.focus();
}
