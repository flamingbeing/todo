// The label picker (#pick-sheet): a search field over every label, a tick on each chosen one, and "Create label" for a
// name not there yet. The task sheet's Labels row, quick add's Labels chip and select mode's Labels use it; in select
// mode a label some of the tasks have shows a dash until it is tapped (then all, then none).
import { icon } from '@core/ui';
import { ICONS } from '../icons.js';
import { MORE } from '../icons-more.js';
import { REFUSED } from '../items.js';
import { labelsOf } from '../tasks.js';
import { colorHex } from '../colors.js';
import { byOrder } from '../order.js';
import { wordsOf, hasAll } from '../search.js';
import { el, sheetHead } from './pick.js';

/** @typedef {import('./views.js').Ctx} Ctx */
/** @typedef {import('../items.js').Task} Task */
/** @typedef {import('../items.js').Label} Label */
/** @typedef {'on' | 'off' | 'some'} Tick */

/** the search field the sheets use: a magnifier and the input @param {string} placeholder @param {string} label */
export function searchField(placeholder, label) {
  const box = el('label', 'td-search-box');
  const input = Object.assign(document.createElement('input'), { type: 'search', placeholder, autocomplete: 'off', enterKeyHint: 'search' });
  input.setAttribute('aria-label', label);
  box.append(icon(MORE.search), input);
  return { box, input };
}

/**
 * Opens the picker. @param {Ctx} ctx @param {Map<string, Tick>} ticks  the labels ticked now (by id)
 * @param {(ticks: Map<string, Tick>, made: Label[]) => unknown} done  on Done: every label's tick, and the labels made here
 */
export function pickLabels(ctx, ticks, done) {
  const d = /** @type {HTMLDialogElement} */ (document.getElementById('pick-sheet'));
  const body = /** @type {HTMLElement} */ (d.querySelector('[data-fill]'));
  /** labels made in this sheet (the list has them before the next draw brings them) @type {Label[]} */
  const made = [];
  const all = () => { const have = ctx.data().labels; return [...byOrder(have.filter(l => l && l.name)), ...made.filter(m => !have.some(l => l.id === m.id))]; };
  const head = sheetHead('Labels', d, () => { d.close(); void done(ticks, made); });
  const { box, input } = searchField('Type a label', 'Find or create a label');
  const field = el('div', 'td-search td-pick-search');
  field.append(box);
  const list = el('ul', 'td-card td-choices td-label-choices');
  list.setAttribute('aria-label', 'Labels');

  const draw = () => {
    const words = wordsOf(input.value), name = input.value.trim();
    const shown = all().filter(l => hasAll(words, l.name));
    const rows = shown.map(l => {
      const li = el('li', ''), b = /** @type {HTMLButtonElement} */ (el('button', 'td-choice'));
      b.type = 'button';
      b.setAttribute('role', 'checkbox');
      const tick = ticks.get(l.id) ?? 'off';
      b.setAttribute('aria-checked', tick === 'on' ? 'true' : tick === 'some' ? 'mixed' : 'false');
      b.dataset.id = l.id;
      const i = icon(ICONS.tag, { class: 'td-choice-icon' });
      i.style.color = colorHex(l.color);
      b.append(i, el('span', 'td-choice-label', l.name), el('span', 'td-tick', ''));
      b.addEventListener('click', () => { ticks.set(l.id, tick === 'on' ? 'off' : 'on'); draw(); /** @type {HTMLElement | null} */ (list.querySelector(`[data-id="${CSS.escape(l.id)}"]`))?.focus(); });
      li.append(b);
      return li;
    });
    if (name && !all().some(l => l.name.toLowerCase() === name.toLowerCase())) {
      const li = el('li', ''), b = /** @type {HTMLButtonElement} */ (el('button', 'td-choice td-create'));
      b.type = 'button';
      b.append(icon(ICONS.plus, { class: 'td-choice-icon' }), el('span', 'td-choice-label', `Create label “${name}”`));
      b.addEventListener('click', () => { void create(name); });
      li.append(b);
      rows.push(li);
    }
    if (!rows.length) rows.push(el('li', 'td-choice-none', 'No labels yet. Type a name to make one.'));
    list.replaceChildren(...rows);
  };
  const create = async (/** @type {string} */ name) => {
    if (!ctx.canWrite()) return;
    const r = await ctx.app.addLabel({ name });
    if (r.refused) { ctx.toast(r.refused.startsWith('A label') ? r.refused : REFUSED); return; }
    made.push({ id: r.id, name: name.trim(), color: 'charcoal', order: Infinity, favorite: false });
    ticks.set(r.id, 'on');
    input.value = '';
    draw();
    input.focus();
  };
  input.addEventListener('input', draw);
  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const name = input.value.trim();
    const hit = all().find(l => l.name.toLowerCase() === name.toLowerCase());
    if (hit) { ticks.set(hit.id, ticks.get(hit.id) === 'on' ? 'off' : 'on'); input.value = ''; draw(); }
    else if (name) void create(name);
  });
  body.replaceChildren(head, field, list);
  draw();
  if (!d.open) d.showModal();
  input.focus({ preventScroll: true });
}

/** a task's label ids as the picker's ticks @param {Task} t @param {Label[]} labels */
export const ticksOf = (t, labels) => new Map(labelsOf(t, labels).map(l => [l.id, /** @type {Tick} */ ('on')]));

/** the ids ticked on @param {Map<string, Tick>} ticks */
export const onIds = ticks => [...ticks].filter(([, v]) => v === 'on').map(([k]) => k);

/**
 * Labels for several tasks (select mode): each label on all of them, some, or none; Done adds those ticked on and
 * takes off those ticked off, and leaves the rest. One Undo puts them back.
 * @param {Ctx} ctx @param {Task[]} tasks @param {() => void} [after]
 */
export function labelTasks(ctx, tasks, after) {
  if (!tasks.length) return;
  const labels = ctx.data().labels;
  /** @type {Map<string, Tick>} */
  const ticks = new Map();
  for (const l of labels) {
    const n = tasks.filter(t => labelsOf(t, labels).some(x => x.id === l.id)).length;
    if (n) ticks.set(l.id, n === tasks.length ? 'on' : 'some');
  }
  const start = new Map(ticks);
  pickLabels(ctx, ticks, async now => {
    /** @type {[Task, string[]][]} */
    const was = [];
    for (const t of tasks) {
      const had = labelsOf(t, ctx.data().labels).map(l => l.id);
      const next = [...had.filter(id => now.get(id) !== 'off'), ...[...now].filter(([id, v]) => v === 'on' && !had.includes(id)).map(([id]) => id)];
      if (next.length === had.length && next.every((id, i) => id === had[i]) && (t.labels ?? []).length === had.length) continue;
      if (await ctx.app.editTask(t, { labels: next })) { ctx.toast(REFUSED); break; }
      was.push([t, t.labels ?? []]);
    }
    after?.();
    if (was.length && [...now].some(([id, v]) => start.get(id) !== v)) ctx.undo.show('Labels changed', async () => {
      for (const [t, before] of was) {
        const cur = ctx.data().tasks.find(x => x.id === t.id) ?? t;
        if (await ctx.app.editTask(cur, { labels: before })) { ctx.toast(REFUSED); return; }
      }
    });
  });
}
