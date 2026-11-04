// The task sheet (#task-sheet), laid out as the reference's task view: the project as a breadcrumb at the top left
// ("Work / This week ›", opens the place picker) and "•••" (the menu) at the right, no Close button (swipe down, the
// backdrop, Esc and Back close it); the ring and the title; the Date row (the description row joins once it has text);
// under them ONE sideways-scrolling row of pills (.ui-scroll-x): Description (focuses the field), Priority, Reminders,
// Labels, Deadline, Move to…, each opening its picker, a set value showing in its pill ("P1" with the flag in its colour,
// the label names, the date, the reminder summary); a grey band, the sub-tasks ("Add sub-task" in the accent); a band, the
// comments, with the comment field docked at the bottom. Every change saves as it is made (on change or when a
// field is left), through the write queue; there is no Save button, and closing keeps what was typed. The "•••" is a
// bottom action sheet (the kit's panel, skinned in app.css) with
// Edit task (a full page: edit-task.js), Duplicate, Complete forever (a repeating task), Copy link, Hide completed
// sub-tasks, View activity, Email and Delete (with an undo). "Add sub-task" and the "+" in the
// Sub-tasks header open quick add above the keyboard for it (the sheet stays at its height behind). Opening a subtask shows it in the same sheet, with its parent's name
// at the top to go back up.
// On a phone it opens at half the screen with the list showing above (app-ui's detents, index.html: "medium large"; app.css makes the medium one 55% of the screen); a
// drag up takes it to full height, a drag down back to half, and once more closes it. Focusing a field that takes
// typing (the title, the description or a comment) takes it to full height at once, so the keyboard
// leaves room for the whole card. A panel (840 px and wider) keeps its own height.
import { icon, confirmModal, holdKeyboard } from '@core/ui';
import { ICONS } from '../icons.js';
import { MORE } from '../icons-more.js';
import { REFUSED } from '../items.js';
import { taskLink, priorityOf, placeText, projectOf, labelsOf } from '../tasks.js';
import { dueLine, deadlineLine, dayKey, minutesText } from '../dates.js';
import { when } from './comments.js';
import { colorHex } from '../colors.js';
import { flatten, descendants, canNest } from '../tree.js';
import { byOrder } from '../order.js';
import { rowList } from '../ui/row.js';
import { openMenu } from '../ui/menu.js';
import { el, pickPlace, pickPriority, pickReminders } from './pick.js';
import { pickDate, dayOptions } from './scheduler.js';
import { pickLabels, ticksOf, onIds } from './labels.js';
import { hasMarks, showMarks } from '../markdown.js';
import { commentsSection } from './comments.js';
import { openEditTask } from './edit-task.js';
import { cleanReminders, leadText, dueMs, autoReminders } from '../reminders.js';

/** @typedef {import('../items.js').Task} Task */
/** @typedef {import('./views.js').Ctx} Ctx */

const PRIORITY_COLOR = ['', 'var(--td-p1)', 'var(--td-p2)', 'var(--td-p3)', 'var(--td-text-2)'];
const d = () => /** @type {HTMLDialogElement} */ (document.getElementById('task-sheet'));
/** the id of the task shown */
let showing = '';
/** @type {((ctx: Ctx) => void) | null} */
let refresh = null;
/** sub-tasks that are done are hidden (the menu's toggle; per opening) */
let hideDone = false;
/** the Sub-tasks list is folded away */
let folded = false;
/** 840 px and up: the same sheet as a dialog in the middle with two sides (wide/task-modal.js, loaded only then) */
const wideQ = () => matchMedia('(min-width: 840px)').matches;
/** @type {typeof import('../wide/task-modal.js') | null} */
let wideMod = null;
/** lays the open sheet out again (the width crossed 840 px: the same parts, so nothing typed is lost) */
let relayout = /** @type {(() => void) | null} */ (null);
let watching = false;

/** the task as last heard @param {Ctx} ctx */
const current = ctx => ctx.data().tasks.find(t => t.id === showing) ?? null;

/** a field that takes typing gets focus on a phone: the sheet goes up to full height, by the kit's grabber (its own glide) */
let grows = false;
function growOnFocus() {
  if (grows) return;
  grows = true;
  d().addEventListener('focusin', e => {
    const f = /** @type {HTMLInputElement | null} */ (e.target instanceof Element ? e.target.closest('input,textarea') : null);
    if (!f || f.readOnly || d().getAttribute('data-detent') === 'large' || matchMedia('(min-width: 840px)').matches) return;
    /** @type {HTMLElement | null} */ (d().querySelector('.ui-sheet-grabber'))?.click();
  });
}

/** @param {Ctx} ctx @param {Task} task */
export function openTask(ctx, task) {
  if (wideQ() && !wideMod) { void import('../wide/task-modal.js').then(m => { wideMod = m; openTask(ctx, task); }); return; }
  growOnFocus();
  if (!watching) {
    watching = true;
    matchMedia('(min-width: 840px)').addEventListener('change', () => {
      if (!d().open || !relayout) return;
      if (wideQ() && !wideMod) void import('../wide/task-modal.js').then(m => { wideMod = m; relayout?.(); });
      else relayout();
    });
  }
  if (!d().open && wideQ()) wideMod?.remember(d(), task.id);
  if (!d().open) { hideDone = false; folded = false; }
  showing = task.id;
  draw(ctx);
  const sheet = d();
  if (!sheet.open) {
    sheet.showModal();
    sheet.addEventListener('close', () => { showing = ''; refresh = null; relayout = null; }, { once: true });
  }
}

/** the data changed: bring the sheet up to date (a field being typed in keeps its text) @param {Ctx} ctx */
export function redraw(ctx) { if (showing && d().open) refresh?.(ctx); }

/** a row of the sheet (or, when nothing is set, a chip in the row under it): an icon at 16, the words at 56 @param {import('app-ui/icons/lucide.js').IconNodes} ic @param {string} label @param {Node[]} value */
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

  // head: the project (opens the place picker) or, in a sub-task, its parent; "⋮" at the right (swipe down to close)
  const head = el('div', 'td-sheet-head');
  const parent = t.parentId ? ctx.data().tasks.find(p => p.id === t.parentId) : null;
  const up = /** @type {HTMLButtonElement} */ (el('button', 'td-sheet-parent'));
  up.type = 'button';
  if (parent) {
    up.append(icon(MORE.chevronLeft), el('span', '', parent.title));
    up.setAttribute('aria-label', `Back to ${parent.title}`);
    up.addEventListener('click', () => { showing = parent.id; draw(ctx); });
  }
  const more = /** @type {HTMLButtonElement} */ (el('button', 'td-sheet-more td-sheet-circle'));
  more.type = 'button'; more.setAttribute('aria-label', 'More'); more.setAttribute('aria-haspopup', 'menu'); more.append(icon(MORE.ellipsis));
  // (Copy link: this page's address with #task=<id>, which opens this task's sheet on load; a viewer can copy it too)
  const copyLink = { label: 'Copy link to task', icon: MORE.link, run: async () => {
    try { await navigator.clipboard.writeText(taskLink(t.id)); ctx.toast('Link copied'); } catch { ctx.toast('Could not copy the link'); }
  } };
  more.addEventListener('click', () => {
    const now = current(ctx);
    if (!now) return;
    const made = when(now.createdAt);
    const email = { label: 'Email to this task', icon: MORE.mail, run: () => {
      const body = [String(now.description ?? ''), taskLink(now.id)].filter(Boolean).join('\n\n');
      location.href = `mailto:?subject=${encodeURIComponent(now.title)}&body=${encodeURIComponent(body)}`;
    } };
    const activity = { label: 'View activity', icon: MORE.activity, run: () => ctx.openActivity({ task: now }) };
    // (a repeating task can also be done for good: its repeat comes off, so it does not roll on)
    const forever = now.due?.rrule && !now.done ? [{ label: 'Complete forever', icon: MORE.checkCheck, run: async () => {
      const at = current(ctx);
      if (!at) return;
      d().close();
      if (await ctx.app.completeForever(at)) ctx.toast(REFUSED);
    } }] : [];
    const wide = !!wideMod && d().hasAttribute('data-td-modal');
    const note = made ? `Added on ${made}` : '';
    openMenu(more, writable ? [
      ...(wide ? [] : [{ label: 'Edit task', icon: MORE.pencil, run: () => openEditTask(ctx, now) }]),
      { label: 'Duplicate task', icon: MORE.copy, run: async () => { const at = current(ctx); if (at && await ctx.app.duplicateTask(at)) ctx.toast(REFUSED); else ctx.toast('Duplicated'); } },
      ...forever,
      copyLink,
      { label: hideDone ? 'Show completed sub-tasks' : 'Hide completed sub-tasks', icon: hideDone ? MORE.eye : MORE.circleSlash, run: () => { hideDone = !hideDone; refresh?.(ctx); } },
      activity,
      email,
      null,
      { label: 'Delete task', icon: MORE.trash2, danger: true, run: () => remove() },
    ] : [copyLink, activity, email], { label: 'Task', sheet: !wide, note });
    // (at 840 px and up: a card under the button, the day it was added on top, the keys at the ends)
    if (wide) wideMod?.dressMenu(note);
  });

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
  desc.addEventListener('blur', () => { descRow.hidden = !desc.value && !d().hasAttribute('data-td-modal'); });
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
  words.append(title, views[0]);
  card.append(box, words);
  // the description: the first row, its lines icon at the left; empty, its placeholder in grey
  const descRow = el('div', 'td-attr td-attr-desc');
  descRow.hidden = true;   // (shown once the description has text, or while it is being typed; the Description pill opens it)
  const descWords = el('div', 'td-task-words');
  descWords.append(desc, views[1]);
  descRow.append(icon(MORE.textAlignStart, { class: 'td-attr-icon' }), descWords);

  // the rows: description (once it has text), date; under them one sideways-scrolling row of pills: Description,
  // Priority, Reminders, Labels, Deadline, Move to… (a set value shows in its pill)
  const rows = el('div', 'td-attrs');
  const scroll = el('div', 'td-sheet-scroll');
  const place = /** @type {HTMLButtonElement} */ (up), date = attrRow(ICONS.calendar, 'Date', []), prio = attrRow(MORE.flag, 'Priority', []);
  const labels = attrRow(ICONS.tag, 'Labels', []), deadline = attrRow(ICONS.target, 'Deadline', []);
  const remind = attrRow(MORE.bell, 'Reminders', []);
  for (const b of [place, date, deadline, remind, prio, labels]) b.disabled = !writable;
  const move = () => { const now = current(ctx); if (now) pickPlace(ctx.data(), { projectId: projectOf(now), sectionId: now.sectionId }, async to => {
    const at = current(ctx);
    if (at && await ctx.app.moveTask(at, { ...to, parentId: null })) ctx.toast(REFUSED);
  }); };
  place.addEventListener('click', move);
  date.addEventListener('click', () => { const now = current(ctx); pickDate(now?.due, (due, duration) => {
    // (Settings > Reminders: a due time on a task with no reminder gets the automatic one)
    const auto = autoReminders(due, now?.reminders, ctx.app.settings.get('autoReminder'));
    save({ due, ...(duration !== undefined ? { duration } : {}), ...(auto.length && !now?.reminders?.length ? { reminders: auto } : {}) });
  },
    { data: ctx.data(), ...dayOptions(ctx.app.settings), duration: now?.duration ?? null }); });
  deadline.addEventListener('click', () => { const now = current(ctx); if (now) pickDate(now.deadline ? { date: now.deadline } : null, d => save({ deadline: d?.date ?? null }),
    { data: ctx.data(), ...dayOptions(ctx.app.settings), dateOnly: true }); });
  labels.addEventListener('click', () => { const now = current(ctx); if (now) pickLabels(ctx, ticksOf(now, ctx.data().labels), ticks => save({ labels: onIds(ticks) })); });
  prio.addEventListener('click', () => pickPriority(priorityOf(/** @type {Task} */ (current(ctx))), p => save({ priority: p })));
  // reminders: the Reminders sheet (suggestions, the set ones, + Add reminder) (before the due time; a date with no time counts as 09:00)
  remind.addEventListener('click', () => {
    const now = current(ctx);
    if (!now) return;
    if (dueMs(now) === null) { ctx.toast('Set a date first'); return; }
    pickReminders(/** @type {number} */ (dueMs(now)), cleanReminders(now.reminders), list => save({ reminders: list }));
  });
  const chipRow = el('div', 'td-attr-chips ui-scroll-x');
  const moveTo = attrRow(MORE.folderInput, 'Move to…', [el('span', 'td-attr-text', 'Move to…')]);
  const descChip = attrRow(MORE.textAlignStart, 'Description', [el('span', 'td-attr-text', 'Description')]);
  for (const b of [moveTo, descChip, deadline, remind, prio, labels]) { b.classList.add('is-chip'); b.disabled = !writable; }
  moveTo.addEventListener('click', move);
  descChip.addEventListener('click', () => { descRow.hidden = false; desc.focus(); });

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
  /** the wide dialog's rail (null on a phone) @type {((values: Record<string, Node[] | null>) => void) | null} */
  let railFill = null;
  // the parts laid out: on a phone the head (no Close button: swipe down, the backdrop, Esc and Back close it), the
  // scrolling card and the docked comment field; at 840 px and up the dialog's two sides (wide/task-modal.js)
  const layout = () => {
    const wide = !!wideMod && wideQ();
    d().toggleAttribute('data-td-modal', wide);
    if (wide && wideMod) {
      railFill = wideMod.layout(d(), { body, head, up, more, left: [card, descRow, subs, talk.root, talk.bar], id: t.id,
        go: id => { showing = id; draw(ctx); }, writable, remove: () => void remove(), copy: () => void copyLink.run(),
        picks: { project: move, date: () => date.click(), deadline: () => deadline.click(), priority: () => prio.click(),
          labels: () => labels.click(), reminders: () => remind.click() } });
      return;
    }
    railFill = null;
    more.classList.remove('td-modal-btn');
    head.replaceChildren(up, more);
    scroll.replaceChildren(card, rows, chipRow, subs, talk.root);
    body.replaceChildren(head, scroll, talk.bar);
  };
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
    const hash = icon(pid === 'inbox' ? ICONS.inbox : ICONS.hash, { class: 'td-crumb-icon' });   // (12 px, in the project's colour)
    hash.style.color = colorHex(proj?.color ?? 'charcoal');
    const where = placeText(now, data.projects, data.sections);
    if (!parent) {
      place.replaceChildren(hash, el('span', '', where), icon(ICONS.chevronRight, { class: 'td-crumb-go' }));
      place.setAttribute('aria-label', `Project: ${where}`);
    }
    const due = dueLine(now.due, dayKey(), { dur: now.duration });
    // the duration: in the time's range when there is one, else after the day ("Tomorrow · 45 min")
    const long = due && now.duration && !now.due?.time ? ` · ${minutesText(now.duration)}` : '';
    const dueText = el('span', `td-attr-text${due ? '' : ' td-attr-empty'}`, due ? due.text + long : 'Date');
    const cal = icon(ICONS.calendar, { class: 'td-attr-icon' });
    if (due) { cal.dataset.tone = due.tone; dueText.dataset.tone = due.tone; }
    date.replaceChildren(cal, dueText, ...(due?.repeats ? [icon(ICONS.repeat, { class: 'td-meta-icon td-repeat' })] : []));
    date.setAttribute('aria-label', due ? `Date: ${due.text}${long}` : 'Date');
    const dl = deadlineLine(now.deadline, dayKey());
    deadline.replaceChildren(icon(ICONS.target, { class: 'td-attr-icon td-deadline-icon' }), el('span', 'td-attr-text', dl ? dl.text : 'Deadline'));
    if (dl) /** @type {HTMLElement} */ (deadline.lastElementChild).dataset.tone = dl.tone;
    deadline.setAttribute('aria-label', dl ? `Deadline: ${dl.text}` : 'Deadline');
    const rem = cleanReminders(now.reminders);
    const remText = rem.length ? rem.map(leadText).join(', ').replace(/ before/g, '') : '';
    remind.replaceChildren(icon(MORE.alarmClock, { class: 'td-attr-icon' }), el('span', 'td-attr-text', remText ? `Reminders: ${remText}` : 'Reminder'));
    remind.setAttribute('aria-label', remText ? `Reminders: ${remText}` : 'Reminder');
    // priority: "P1".."P3" with the flag in its colour once set (4 is the default and shows the plain word)
    const flag = icon(MORE.flag, { class: `td-attr-icon td-flag${p < 4 ? ' is-filled' : ''}` });
    flag.style.color = PRIORITY_COLOR[p];
    prio.replaceChildren(flag, el('span', 'td-attr-text', p < 4 ? `P${p}` : 'Priority'));
    prio.setAttribute('aria-label', p < 4 ? `Priority P${p}` : 'Priority');
    const mine = labelsOf(now, data.labels);
    labels.replaceChildren(icon(ICONS.tag, { class: 'td-attr-icon' }), el('span', 'td-attr-text', mine.length ? mine.map(l => l.name).join(', ') : 'Labels'));
    labels.setAttribute('aria-label', mine.length ? `Labels: ${mine.map(l => l.name).join(', ')}` : 'Labels');
    descRow.hidden = !railFill && !desc.value && document.activeElement !== desc;
    rows.replaceChildren(...(railFill ? [] : [descRow]), date);
    // the rail (840 px and up): copies of the same values, a "+" where nothing is set
    const copy = (/** @type {Element} */ b) => [...b.childNodes].map(n => n.cloneNode(true));
    railFill?.({ project: [hash.cloneNode(true), el('span', '', where)], date: due ? copy(date) : null,
      deadline: dl ? copy(deadline) : null, priority: p < 4 ? copy(prio) : [flag.cloneNode(true), el('span', 'td-attr-text', 'P4')], labels: mine.length ? copy(labels) : null,
      reminders: remText ? [el('span', 'td-attr-text', remText)] : null });
    chipRow.replaceChildren(...(writable ? [descChip, prio, remind, labels, deadline, moveTo] : [prio, remind, labels, deadline]));

    // its subtasks, open and done (a done one shows ticked); the header counts them, "+" adds one, the chevron folds the list
    const all = byOrder(data.tasks.filter(k => k.parentId === now.id));
    const kids = hideDone ? all.filter(k => !k.done) : all;
    const lines = flatten(kids, data.tasks, { open: () => false });
    const parts = [];
    const depthOk = canNest(/** @type {Task} */ ({ ...now, id: '_new', parentId: null }), now, data.tasks);
    // "Add sub-task" and the header's "+" open quick add over the sheet (it closes after the one add, the sheet stays as it is)
    const addSub = () => {
      const at = current(c);
      if (!at) return;
      const hold = holdKeyboard();
      c.openQuickAdd({ projectId: projectOf(at), sectionId: at.sectionId ?? null, parentId: at.id }, hold);
    };
    if (all.length) {
      const bar = el('div', 'td-subtasks-head');
      const h = el('h3', 'td-subtasks-title', 'Sub-tasks ');
      const count = el('span', 'td-subtasks-count', `${all.filter(k => k.done).length}/${all.length}`);
      h.append(count);
      bar.append(h);
      if (c.canWrite() && depthOk) {
        const plus = /** @type {HTMLButtonElement} */ (el('button', 'td-subtasks-btn'));
        plus.type = 'button'; plus.setAttribute('aria-label', 'Add sub-task here'); plus.append(icon(ICONS.plus));
        plus.addEventListener('click', addSub);
        bar.append(plus);
      }
      const fold = /** @type {HTMLButtonElement} */ (el('button', 'td-subtasks-btn'));
      fold.type = 'button'; fold.setAttribute('aria-expanded', String(!folded)); fold.setAttribute('aria-label', folded ? 'Show sub-tasks' : 'Hide sub-tasks');
      fold.append(icon(folded ? ICONS.chevronDown : MORE.chevronUp));   // (the reference's collapse chevron)
      fold.addEventListener('click', () => { folded = !folded; fill(c); });
      bar.append(fold);
      parts.push(bar);
    }
    if (lines.length && !folded) {
      const list = rowList(lines, { ...c.rows(), place: false, onOpen: k => { showing = k.id; draw(c); },
        onComplete: async (k, row) => {
          if (k.done) { if (await c.app.untick([k])) c.toast(REFUSED); return; }
          row.classList.add('is-done');
          const { refused } = await c.app.complete(k);
          if (refused) c.toast(REFUSED);
        } }, 'Sub-tasks');
      parts.push(list);
    }
    if (c.canWrite() && depthOk && !(folded && all.length)) {
      const add = /** @type {HTMLButtonElement} */ (el('button', 'td-add-sub'));
      add.type = 'button';
      add.append(icon(ICONS.plus, { class: 'td-add-icon' }), el('span', '', 'Add sub-task'));
      add.addEventListener('click', addSub);
      parts.push(add);
    }
    subs.replaceChildren(...parts);
    talk.fill(c, now.id);
  };
  refresh = fill;
  relayout = () => { layout(); fill(ctx); };
  layout();
  fill(ctx);
}
