// The task sheet (#task-sheet): the task's title and description in a card, then a row each for its project, date,
// deadline, priority and labels, then its subtasks with "Add sub-task" and its comments. Every change saves as it is made (on change or when a
// field is left), through the write queue; there is no Save button, and closing keeps what was typed. The "…" has
// Duplicate, Move to and Delete (with an undo). Opening a subtask shows it in the same sheet, with its parent's name
// at the top to go back up.
import { icon, confirmModal } from '@core/ui';
import { ICONS } from '../icons.js';
import { MORE } from '../icons-more.js';
import { REFUSED } from '../items.js';
import { taskLink, priorityOf, placeText, projectOf, labelsOf } from '../tasks.js';
import { dueLine, deadlineLine, dayKey, minutesText } from '../dates.js';
import { colorHex } from '../colors.js';
import { flatten, descendants, canNest } from '../tree.js';
import { byOrder } from '../order.js';
import { rowList } from '../ui/row.js';
import { openMenu } from '../ui/menu.js';
import { el, pickPlace } from './pick.js';
import { pickDate } from './scheduler.js';
import { pickLabels, ticksOf, onIds } from './labels.js';
import { hasMarks, showMarks } from '../markdown.js';
import { commentsSection } from './comments.js';
import { LEADS, cleanReminders, leadText, dueMs } from '../reminders.js';

/** @typedef {import('../items.js').Task} Task */
/** @typedef {import('./views.js').Ctx} Ctx */

const PRIORITY_COLOR = ['', 'var(--td-p1)', 'var(--td-p2)', 'var(--td-p3)', 'var(--td-text-2)'];
const d = () => /** @type {HTMLDialogElement} */ (document.getElementById('task-sheet'));
/** the id of the task shown */
let showing = '';
/** @type {((ctx: Ctx) => void) | null} */
let refresh = null;

/** the task as last heard @param {Ctx} ctx */
const current = ctx => ctx.data().tasks.find(t => t.id === showing) ?? null;

/** @param {Ctx} ctx @param {Task} task */
export function openTask(ctx, task) {
  showing = task.id;
  draw(ctx);
  const sheet = d();
  if (!sheet.open) {
    sheet.showModal();
    sheet.addEventListener('close', () => { showing = ''; refresh = null; }, { once: true });
  }
}

/** the data changed: bring the sheet up to date (a field being typed in keeps its text) @param {Ctx} ctx */
export function redraw(ctx) { if (showing && d().open) refresh?.(ctx); }

/** a row of the sheet: an icon at 16, the words at 56 @param {import('app-ui/icons/lucide.js').IconNodes} ic @param {string} label @param {Node[]} value */
function attrRow(ic, label, value) {
  const b = /** @type {HTMLButtonElement} */ (el('button', 'td-attr'));
  b.type = 'button';
  b.setAttribute('aria-label', label);
  b.append(icon(ic, { class: 'td-attr-icon' }), ...value);
  return b;
}

/** @param {Ctx} ctx */
function draw(ctx) {
  const body = /** @type {HTMLElement} */ (d().querySelector('[data-fill]'));
  const t = current(ctx);
  if (!t) { d().close(); return; }
  const save = async (/** @type {import('../items.js').Fields} */ patch) => {
    const now = current(ctx);
    if (now && await ctx.app.editTask(now, patch)) ctx.toast(REFUSED);
  };
  const writable = ctx.canWrite();

  // head: close, the parent's name (a subtask), "…"
  const head = el('div', 'td-sheet-head');
  const x = /** @type {HTMLButtonElement} */ (el('button', 'td-round td-sheet-x'));
  x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.append(icon(MORE.x));
  x.addEventListener('click', () => d().close());
  const parent = t.parentId ? ctx.data().tasks.find(p => p.id === t.parentId) : null;
  const up = el(parent ? 'button' : 'span', 'td-sheet-parent');
  if (parent) {
    /** @type {HTMLButtonElement} */ (up).type = 'button';
    up.append(icon(MORE.chevronLeft), el('span', '', parent.title));
    up.setAttribute('aria-label', `Back to ${parent.title}`);
    up.addEventListener('click', () => { showing = parent.id; draw(ctx); });
  }
  const more = /** @type {HTMLButtonElement} */ (el('button', 'td-round td-sheet-more'));
  more.type = 'button'; more.setAttribute('aria-label', 'More'); more.setAttribute('aria-haspopup', 'menu'); more.append(icon(ICONS.ellipsis));
  // (Copy link: this page's address with #task=<id>, which opens this task's sheet on load; a viewer can copy it too)
  const copyLink = { label: 'Copy link', icon: MORE.link, run: async () => {
    try { await navigator.clipboard.writeText(taskLink(t.id)); ctx.toast('Link copied'); } catch { ctx.toast('Could not copy the link'); }
  } };
  more.addEventListener('click', () => openMenu(more, writable ? [
    { label: 'Duplicate', icon: MORE.copy, run: async () => { const now = current(ctx); if (now && await ctx.app.duplicateTask(now)) ctx.toast(REFUSED); else ctx.toast('Duplicated'); } },
    { label: 'Move to…', icon: ICONS.folderInput, run: () => move() },
    copyLink,
    null,
    { label: 'Delete', icon: MORE.trash2, danger: true, run: () => remove() },
  ] : [copyLink], { label: 'Task' }));
  head.append(x, up, more);

  // the card: box, title, description
  const card = el('div', 'td-card td-task-card');
  const box = /** @type {HTMLButtonElement} */ (el('button', 'td-check'));
  box.type = 'button'; box.setAttribute('role', 'checkbox');
  box.append(icon(ICONS.check, { class: 'td-check-mark' }));
  box.disabled = !writable;
  box.addEventListener('click', async () => {
    const now = current(ctx);
    if (!now) return;
    if (now.done) { if (await ctx.app.untick([now])) ctx.toast(REFUSED); return; }
    d().close();
    ctx.complete(now);
  });
  const title = /** @type {HTMLTextAreaElement} */ (el('textarea', 'td-task-title'));
  title.rows = 1; title.maxLength = 500; title.setAttribute('aria-label', 'Task name'); title.readOnly = !writable;
  const desc = /** @type {HTMLTextAreaElement} */ (el('textarea', 'td-task-desc'));
  desc.rows = 1; desc.maxLength = 16000; desc.placeholder = 'Description'; desc.setAttribute('aria-label', 'Description'); desc.readOnly = !writable;
  const grow = (/** @type {HTMLTextAreaElement} */ a) => { a.style.height = 'auto'; a.style.height = `${a.scrollHeight}px`; };
  for (const a of [title, desc]) a.addEventListener('input', () => grow(a));
  title.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } });
  title.addEventListener('change', () => {
    const v = title.value.trim();
    if (!v) { title.value = current(ctx)?.title ?? ''; return; }
    if (v !== current(ctx)?.title) void save({ title: v });
  });
  desc.addEventListener('change', () => { if (desc.value !== (current(ctx)?.description ?? '')) void save({ description: desc.value }); });
  // the words with their marks (bold, links: markdown.js) laid over each field while it is not being edited; a tap
  // between links reaches the field below (the layer lets taps through, but not on its links)
  const views = [title, desc].map(a => {
    const v = el('div', `td-md ${a === title ? 'td-md-title' : 'td-md-desc'}`);
    v.setAttribute('aria-hidden', 'true');
    a.addEventListener('focus', () => marks(a, v));
    a.addEventListener('blur', () => marks(a, v));
    return v;
  });
  const marks = (/** @type {HTMLTextAreaElement} */ a, /** @type {HTMLElement} */ v) => {
    const on = document.activeElement !== a && hasMarks(a.value);
    a.classList.toggle('has-md', on);
    v.hidden = !on;
    if (!on) { v.replaceChildren(); return; }
    showMarks(v, a.value);
    for (const link of v.querySelectorAll('a')) link.tabIndex = -1;
  };
  const words = el('div', 'td-task-words');
  words.append(title, views[0], desc, views[1]);
  card.append(box, words);

  // the rows: project, date, priority, labels
  const rows = el('div', 'td-card td-attrs');
  const place = attrRow(ICONS.hash, 'Project', []), date = attrRow(ICONS.calendar, 'Date', []), prio = attrRow(MORE.flag, 'Priority', []);
  const labels = attrRow(ICONS.tag, 'Labels', []), deadline = attrRow(ICONS.target, 'Deadline', []);
  const remind = attrRow(MORE.bell, 'Reminders', []);
  for (const b of [place, date, deadline, remind, prio, labels]) b.disabled = !writable;
  const move = () => { const now = current(ctx); if (now) pickPlace(ctx.data(), { projectId: projectOf(now), sectionId: now.sectionId }, async to => {
    const at = current(ctx);
    if (at && await ctx.app.moveTask(at, { ...to, parentId: null })) ctx.toast(REFUSED);
  }); };
  place.addEventListener('click', move);
  date.addEventListener('click', () => { const now = current(ctx); pickDate(now?.due, (due, duration) => save({ due, ...(duration !== undefined ? { duration } : {}) }),
    { data: ctx.data(), weekStart: Number(ctx.app.settings.get('weekStart') ?? 1), duration: now?.duration ?? null }); });
  deadline.addEventListener('click', () => { const now = current(ctx); if (now) pickDate(now.deadline ? { date: now.deadline } : null, d => save({ deadline: d?.date ?? null }),
    { data: ctx.data(), weekStart: Number(ctx.app.settings.get('weekStart') ?? 1), dateOnly: true }); });
  labels.addEventListener('click', () => { const now = current(ctx); if (now) pickLabels(ctx, ticksOf(now, ctx.data().labels), ticks => save({ labels: onIds(ticks) })); });
  prio.addEventListener('click', () => openMenu(prio, [1, 2, 3, 4].map(p => ({ label: `Priority ${p}`, icon: MORE.flag, color: PRIORITY_COLOR[p],
    checked: priorityOf(/** @type {Task} */ (current(ctx))) === p, run: () => save({ priority: p }) })), { label: 'Priority' }));
  // reminders: tick the leads wanted (before the due time; a date with no time counts as 09:00)
  remind.addEventListener('click', () => {
    const now = current(ctx);
    if (!now) return;
    if (dueMs(now) === null) { ctx.toast('Set a date first'); return; }
    const has = cleanReminders(now.reminders);
    openMenu(remind, LEADS.map(([lead, label]) => ({ label, icon: MORE.bell, checked: has.includes(lead),
      run: () => save({ reminders: has.includes(lead) ? has.filter(x => x !== lead) : [...has, lead] }) })), { label: 'Reminders' });
  });
  rows.append(place, date, deadline, remind, prio, labels);

  // subtasks
  const subs = el('section', 'td-subtasks');
  const remove = async () => {
    const now = current(ctx);
    if (!now) return;
    const n = descendants(now.id, ctx.data().tasks).length;
    if (n && !await confirmModal(`Delete “${now.title}” and its ${n === 1 ? 'subtask' : `${n} subtasks`}?`, { title: 'Delete task', danger: true, yes: 'Delete' })) return;
    const gone = [now, ...descendants(now.id, ctx.data().tasks)];
    d().close();
    if (await ctx.app.remove(now, id => ctx.files?.of(id) ?? [])) { ctx.toast(REFUSED); return; }
    ctx.undo.show('Task deleted', async () => { for (const g of gone) if (await ctx.app.put(g)) { ctx.toast(REFUSED); return; } });
  };

  const talk = commentsSection();
  const fill = (/** @type {Ctx} */ c) => {
    const now = current(c);
    // gone (deleted on another device: a delete here closes the sheet first)
    if (!now) { d().close(); c.toast('This task was deleted on another device'); return; }
    const p = priorityOf(now);
    card.dataset.priority = String(p);
    box.setAttribute('aria-checked', String(!!now.done));
    box.setAttribute('aria-label', `${now.done ? 'Not done' : 'Complete'}: ${now.title}`);
    if (document.activeElement !== title) { title.value = now.title; grow(title); }
    if (document.activeElement !== desc) { desc.value = String(now.description ?? ''); grow(desc); }
    marks(title, views[0]); marks(desc, views[1]);
    const data = c.data(), pid = projectOf(now), proj = data.projects.find(x => x.id === pid);
    const hash = icon(pid === 'inbox' ? ICONS.inbox : ICONS.hash, { class: 'td-attr-icon' });
    hash.style.color = pid === 'inbox' ? 'var(--td-text-2)' : colorHex(proj?.color);
    const where = placeText(now, data.projects, data.sections);
    place.replaceChildren(hash, el('span', 'td-attr-text', where));
    place.setAttribute('aria-label', `Project: ${where}`);
    const due = dueLine(now.due, dayKey(), { dur: now.duration });
    // the duration: in the time's range when there is one, else after the day ("Tomorrow · 45 min")
    const long = due && now.duration && !now.due?.time ? ` · ${minutesText(now.duration)}` : '';
    const dueText = el('span', `td-attr-text${due ? '' : ' td-attr-empty'}`, due ? due.text + long : 'Date');
    const cal = icon(ICONS.calendar, { class: 'td-attr-icon' });
    if (due) { cal.dataset.tone = due.tone; dueText.dataset.tone = due.tone; }
    date.replaceChildren(cal, dueText, ...(due?.repeats ? [icon(ICONS.repeat, { class: 'td-meta-icon td-repeat' })] : []));
    date.setAttribute('aria-label', due ? `Date: ${due.text}${long}` : 'Date');
    const dl = deadlineLine(now.deadline, dayKey());
    deadline.replaceChildren(icon(ICONS.target, { class: 'td-attr-icon td-deadline-icon' }), el('span', `td-attr-text${dl ? '' : ' td-attr-empty'}`, dl ? dl.text : 'Deadline'));
    if (dl) /** @type {HTMLElement} */ (deadline.lastElementChild).dataset.tone = dl.tone;
    deadline.setAttribute('aria-label', dl ? `Deadline: ${dl.text}` : 'Deadline');
    const rem = cleanReminders(now.reminders);
    const remText = rem.length ? rem.map(leadText).join(', ').replace(/ before/g, '') : '';
    remind.replaceChildren(icon(MORE.bell, { class: 'td-attr-icon' }), el('span', `td-attr-text${remText ? '' : ' td-attr-empty'}`, remText || 'Reminders'));
    remind.setAttribute('aria-label', remText ? `Reminders: ${remText}` : 'Reminders');
    const flag = icon(MORE.flag, { class: `td-attr-icon td-flag${p < 4 ? ' is-filled' : ''}` });
    flag.style.color = PRIORITY_COLOR[p];
    prio.replaceChildren(flag, el('span', 'td-attr-text', `Priority ${p}`));
    prio.setAttribute('aria-label', `Priority ${p}`);
    const mine = labelsOf(now, data.labels);
    const chips = mine.map(l => {
      const chip = el('span', 'td-chip', l.name);
      chip.style.color = colorHex(l.color);
      return chip;
    });
    labels.replaceChildren(icon(ICONS.tag, { class: 'td-attr-icon' }), ...(chips.length ? chips : [el('span', 'td-attr-text td-attr-empty', 'Labels')]));
    labels.setAttribute('aria-label', mine.length ? `Labels: ${mine.map(l => l.name).join(', ')}` : 'Labels');

    // its subtasks, open and done (a done one shows ticked)
    const kids = byOrder(data.tasks.filter(k => k.parentId === now.id));
    const lines = flatten(kids, data.tasks, { open: () => false });
    const head2 = el('h3', 'td-subtasks-title', 'Sub-tasks');
    const parts = [head2];
    if (lines.length) {
      const list = rowList(lines, { ...c.rows(), place: false, onOpen: k => { showing = k.id; draw(c); },
        onComplete: async (k, row) => {
          if (k.done) { if (await c.app.untick([k])) c.toast(REFUSED); return; }
          row.classList.add('is-done');
          const { refused } = await c.app.complete(k);
          if (refused) c.toast(REFUSED);
        } }, 'Sub-tasks');
      parts.push(list);
    }
    /** @type {HTMLInputElement | null} */
    let keep = null;
    const depthOk = canNest(/** @type {Task} */ ({ ...now, id: '_new', parentId: null }), now, data.tasks);
    if (c.canWrite() && depthOk) {
      const form = /** @type {HTMLFormElement} */ (el('form', 'td-add-sub'));
      const add = /** @type {HTMLInputElement} */ (el('input', ''));
      add.placeholder = 'Add sub-task'; add.maxLength = 500; add.setAttribute('aria-label', 'Add sub-task');
      form.append(icon(ICONS.plus, { class: 'td-add-icon' }), add);
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const v = add.value.trim();
        if (!v) return;
        add.value = '';
        const at = current(c);
        if (!at) return;
        if (await c.app.addTask({ title: v, projectId: projectOf(at), sectionId: at.sectionId ?? null, parentId: at.id })) c.toast(REFUSED);
        requestAnimationFrame(() => /** @type {HTMLInputElement | null} */ (d().querySelector('.td-add-sub input'))?.focus());
      });
      // a refresh (a change arriving) keeps what is being typed
      const was = /** @type {HTMLInputElement | null} */ (subs.querySelector('.td-add-sub input'));
      if (was?.value) add.value = was.value;
      if (was && document.activeElement === was) keep = add;
      parts.push(form);
    }
    subs.replaceChildren(...parts);
    keep?.focus();
    talk.fill(c, now.id);
  };
  refresh = fill;
  fill(ctx);
  body.replaceChildren(head, card, rows, subs, talk.root);
}
