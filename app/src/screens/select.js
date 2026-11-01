// What a held task row offers, and select mode. A row held and let go without moving opens its menu: Select task,
// Schedule, Priority, Move to and Delete. Select task (or "Select tasks" in a page's "…") starts select mode on that
// page: a tap ticks a row on or off (its background goes grey), the top bar reads Cancel, "N selected" and Select all,
// and a glass bar at the bottom (in the tab bar's place) sets a Date, a project (Move), a Priority, or under "…"
// duplicates, completes or deletes them (the last two with Undo). Esc or Cancel ends it, as does each action.
// (The kit's select mode is for one list; a page here has a list per section or day, and a hold here lifts a row for a
// drag, so this one is the app's own.)
import { confirmModal, plural, haptic, icon } from '@core/ui';
import { ICONS } from '../icons.js';
import { REFUSED } from '../items.js';
import { isTask, priorityOf, projectOf } from '../tasks.js';
import { descendants } from '../tree.js';
import { dayKey } from '../dates.js';
import { openMenu } from '../ui/menu.js';
import { el, pickPlace } from './pick.js';
import { pickDate } from './scheduler.js';

/** @typedef {import('./views.js').Ctx} Ctx */
/** @typedef {import('../items.js').Task} Task */
const PRIORITY_COLOR = ['', 'var(--td-p1)', 'var(--td-p2)', 'var(--td-p3)', 'var(--td-text-2)'];

/** the tasks for these ids, as they are now @param {Ctx} ctx @param {Iterable<string>} ids */
const tasksOf = (ctx, ids) => { const all = ctx.data().tasks, want = new Set(ids); return all.filter(t => want.has(t.id)); };

/**
 * Deletes tasks (and their subtasks), asking first when there are several or any has subtasks; Undo puts them back.
 * @param {Ctx} ctx @param {Task[]} tasks @returns {Promise<boolean>} false when not asked through, or refused
 */
export async function deleteTasks(ctx, tasks) {
  if (!tasks.length) return false;
  const all = ctx.data().tasks;
  // (a subtask of another one deleted goes with it)
  const top = tasks.filter(t => !tasks.some(o => o.id !== t.id && descendants(o.id, all).some(d => d.id === t.id)));
  const gone = top.flatMap(t => [t, ...descendants(t.id, all)]);
  const subs = gone.length - top.length;
  if (top.length > 1 || subs) {
    const what = top.length > 1 ? plural(top.length, 'task') : `“${top[0].title}”`;
    if (!await confirmModal(`Delete ${what}${subs ? ` and ${subs === 1 ? 'a subtask' : `${subs} subtasks`}` : ''}?`,
      { title: top.length > 1 ? 'Delete tasks' : 'Delete task', danger: true, yes: 'Delete' })) return false;
  }
  for (const t of top) if (await ctx.app.remove(t, ctx.files?.of(t.id) ?? [])) { ctx.toast(REFUSED); return false; }
  ctx.undo.show(top.length > 1 ? `${plural(top.length, 'task')} deleted` : 'Task deleted', async () => {
    for (const g of gone) if (await ctx.app.put(g)) { ctx.toast(REFUSED); return; }
  });
  return true;
}

/** A new date for tasks (the scheduler; a repeat set there goes to each) @param {Ctx} ctx @param {Task[]} tasks @param {() => void} [after] */
export function scheduleTasks(ctx, tasks, after) {
  if (!tasks.length) return;
  pickDate(tasks.length === 1 ? tasks[0].due : null, async due => {
    for (const t of tasks) if (await ctx.app.editTask(t, { due: due ? { ...due } : null })) { ctx.toast(REFUSED); break; }
    after?.();
  }, { data: ctx.data() });
}

/** A priority for tasks, from a menu at anchor @param {Ctx} ctx @param {HTMLElement} anchor @param {Task[]} tasks @param {() => void} [after] */
function priorityMenu(ctx, anchor, tasks, after) {
  const now = new Set(tasks.map(priorityOf));
  openMenu(anchor, /** @type {(1 | 2 | 3 | 4)[]} */ ([1, 2, 3, 4]).map(p => ({ label: `Priority ${p}`, icon: ICONS.flag, color: PRIORITY_COLOR[p], checked: now.size === 1 && now.has(p),
    run: async () => {
      for (const t of tasks) if (priorityOf(t) !== p && await ctx.app.editTask(t, { priority: p })) { ctx.toast(REFUSED); break; }
      after?.();
    } })), { label: 'Priority' });
}

/** Another project or section for tasks @param {Ctx} ctx @param {Task[]} tasks @param {() => void} [after] */
function moveTasks(ctx, tasks, after) {
  if (!tasks.length) return;
  const first = tasks[0];
  pickPlace(ctx.data(), { projectId: projectOf(first), sectionId: tasks.length === 1 ? first.sectionId : undefined }, async to => {
    for (const t of tasks) if (await ctx.app.moveTask(t, { ...to, parentId: null })) { ctx.toast(REFUSED); break; }
    after?.();
  });
}

/** Completes tasks (a repeating one moves to its next date); one Undo for them all @param {Ctx} ctx @param {Task[]} tasks */
async function completeTasks(ctx, tasks) {
  /** @type {Task[]} */
  const ticked = [];
  /** @type {[Task, import('../dates.js').Due][]} */
  const moved = [];
  const repeats = tasks.some(t => t.due?.rrule);
  const lib = repeats ? await Promise.all([import('../recur.js'), import('../recur.js').then(m => m.dateLibs())]).catch(() => null) : null;
  const today = dayKey();
  for (const t of tasks) {
    let next = null;
    if (t.due?.rrule && lib) { try { next = lib[0].nextDay(t.due, { done: today, today }, lib[1].RRule); } catch { next = null; } }
    const r = await ctx.app.complete(t, { next });
    if (r.refused) { ctx.toast(REFUSED); break; }
    ticked.push(...r.ticked);
    if (r.moved) moved.push([t, r.moved]);
  }
  const n = tasks.length;
  ctx.undo.show(n > 1 ? `${plural(n, 'task')} completed` : 'Task completed', async () => {
    if (ticked.length && await ctx.app.untick(ticked)) { ctx.toast(REFUSED); return; }
    for (const [t, due] of moved) {
      const now = ctx.data().tasks.find(x => x.id === t.id) ?? t;
      if (await ctx.app.editTask(now, { due })) { ctx.toast(REFUSED); return; }
    }
  });
}

/**
 * A held row's menu. @param {Ctx} ctx @param {Task} task @param {HTMLElement} row @param {HTMLElement} host  the list it is in
 */
export function holdMenu(ctx, task, row, host) {
  if (!ctx.canWrite()) return;
  haptic('long');
  const anchor = /** @type {HTMLElement} */ (row.querySelector('.td-row-main') ?? row);
  openMenu(anchor, [
    { label: 'Select task', icon: ICONS.squareCheck, run: () => startSelect(ctx, host, [task.id]) },
    { label: 'Schedule', icon: ICONS.calendar, run: () => scheduleTasks(ctx, [task]) },
    { label: 'Priority', icon: ICONS.flag, run: () => priorityMenu(ctx, anchor, [task]) },
    { label: 'Move to', icon: ICONS.hash, run: () => moveTasks(ctx, [task]) },
    null,
    { label: 'Delete', icon: ICONS.trash2, danger: true, run: () => { void deleteTasks(ctx, [task]); } },
  ], { label: task.title });
}

// ---- select mode
/** @type {{ host: HTMLElement, ids: Set<string>, stop: () => void } | null} */
let on = null;
/** select mode is on (a row's tap ticks it, swipes and holds stand down) */
export const selecting = () => !!on;
/** ends select mode */
export const endSelect = () => on?.stop();

/**
 * Starts select mode on a page's list. @param {Ctx} ctx @param {HTMLElement} host @param {string[]} [ids] ticked to start
 */
export function startSelect(ctx, host, ids = []) {
  on?.stop();
  const picked = new Set(ids);
  const html = document.documentElement;
  const rowsOf = () => /** @type {HTMLElement[]} */ ([...host.querySelectorAll('.td-row')]);
  const shownIds = () => rowsOf().map(r => String(r.dataset.id));

  // the top: Cancel, "N selected", Select all
  const top = el('div', 'td-select-top');
  top.setAttribute('role', 'toolbar');
  top.setAttribute('aria-label', 'Selected tasks');
  const cancel = button('Cancel', 'td-text-btn');
  const count = el('p', 'td-select-count');
  count.setAttribute('aria-live', 'polite');
  const all = button('Select all', 'td-text-btn');
  top.append(cancel, count, all);

  // the bar at the bottom: Date, Move, Priority, "…"
  const bar = el('div', 'ui-action-bar td-select-bar');
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Actions for the selected tasks');
  const date = button('Date', 'td-select-act', ICONS.calendar), move = button('Move', 'td-select-act', ICONS.hash);
  const prio = button('Priority', 'td-select-act', ICONS.flag), more = button('More actions', 'td-select-act td-select-more', ICONS.ellipsis, true);
  more.setAttribute('aria-haspopup', 'menu');
  bar.append(date, move, prio, more);
  document.body.append(top, bar);

  const chosen = () => tasksOf(ctx, picked).filter(t => isTask(t) && !t.done);
  const draw = () => {
    for (const id of [...picked]) if (!ctx.data().tasks.some(t => t.id === id && !t.done)) picked.delete(id);
    for (const r of rowsOf()) {
      const yes = picked.has(String(r.dataset.id));
      r.classList.toggle('is-selected', yes);
      r.querySelector('.td-row-main')?.setAttribute('aria-pressed', String(yes));
    }
    const n = picked.size;
    count.textContent = `${n} selected`;
    all.textContent = n && shownIds().every(id => picked.has(id)) ? 'Deselect all' : 'Select all';
    for (const b of [date, move, prio, more]) b.disabled = !n;
  };
  // the rows are drawn again on each change: tick them again
  const watch = new MutationObserver(() => draw());
  watch.observe(host, { childList: true, subtree: true });

  /** @param {MouseEvent} e */
  const tap = e => {
    const r = /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest('.td-row'));
    if (!r || !host.contains(r) || /** @type {Element} */ (e.target).closest('.td-fold')) return;
    e.preventDefault(); e.stopPropagation();
    const id = String(r.dataset.id);
    if (picked.has(id)) picked.delete(id); else picked.add(id);
    haptic('tick');
    draw();
  };
  host.addEventListener('click', tap, true);
  const key = (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape' && !document.querySelector('dialog[open], .td-menu-layer')) { e.preventDefault(); stop(); } };
  document.addEventListener('keydown', key);

  const stop = () => {
    if (on?.host !== host) return;
    on = null;
    watch.disconnect();
    host.removeEventListener('click', tap, true);
    document.removeEventListener('keydown', key);
    host.classList.remove('is-selecting');
    html.classList.remove('td-selecting');
    for (const r of rowsOf()) { r.classList.remove('is-selected'); r.querySelector('.td-row-main')?.removeAttribute('aria-pressed'); }
    top.remove(); bar.remove();
  };
  on = { host, ids: picked, stop };
  cancel.addEventListener('click', stop);
  all.addEventListener('click', () => {
    const ids = shownIds();
    if (ids.every(id => picked.has(id))) picked.clear(); else for (const id of ids) picked.add(id);
    draw();
  });
  date.addEventListener('click', () => scheduleTasks(ctx, chosen(), stop));
  move.addEventListener('click', () => moveTasks(ctx, chosen(), stop));
  prio.addEventListener('click', () => priorityMenu(ctx, prio, chosen(), stop));
  more.addEventListener('click', () => {
    const list = chosen(), n = list.length;
    openMenu(more, [
      { label: `Duplicate ${n}`, icon: ICONS.copy, run: async () => {
        for (const t of list) if (await ctx.app.duplicateTask(t)) { ctx.toast(REFUSED); break; }
        stop();
      } },
      { label: `Complete ${n}`, icon: ICONS.circleCheck, run: () => { stop(); void completeTasks(ctx, list); } },
      null,
      { label: `Delete ${n}`, icon: ICONS.trash2, danger: true, run: async () => { if (await deleteTasks(ctx, list)) stop(); } },
    ], { label: 'More actions' });
  });

  host.classList.add('is-selecting');
  html.classList.add('td-selecting');
  draw();
  (picked.size ? all : cancel).focus({ preventScroll: true });
}

/** a text button, or an icon over its label (bare: the label is its name only) @param {string} label @param {string} cls
 * @param {import('app-ui/icons/lucide.js').IconNodes} [ic] @param {boolean} [bare] */
function button(label, cls, ic, bare = false) {
  const b = /** @type {HTMLButtonElement} */ (el('button', cls));
  b.type = 'button';
  if (!ic) b.textContent = label;
  else if (bare) { b.setAttribute('aria-label', label); b.append(icon(ic, { class: 'td-select-icon' })); }
  else b.append(icon(ic, { class: 'td-select-icon' }), el('span', 'td-select-act-label', label));
  return b;
}
