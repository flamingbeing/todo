// Moving tasks by hand. A row held still for half a second lifts (a little larger, a tick); moved, it follows the
// finger and a 2 px accent line with a dot shows where it will land; pulled 24 px sideways it goes one level in or out
// (four at most). On a project page it lands in that section, under the parent the line shows, between its neighbours
// (order.js placeInTree and placeAt); on Today and Upcoming it takes its place in the day (dayOrder, renumbered), and
// dropped on another day of Upcoming it moves to that day. Let go without moving, the row's menu opens (select.js).
// The + button dragged onto the list shows the same line, a grey x where it was (dropped there, nothing happens)
// and on a project page an "Add section" line below the last section: let go, quick add opens for that place, or
// a new section is named there. On a board (screens/board.js) a card tilts as it lifts and lands in the column under
// the finger, at the top level; near the board's side it scrolls to the next column. Only transforms and opacity
// move; the arbiter's 'drag' owns the touch while lifted.
import { claim, release, haptic, glide, icon } from '@core/ui';
import { ICONS } from '../icons.js';
import { REFUSED } from '../items.js';
import { placeInTree, placeAt, renumbered } from '../order.js';
import { dayKey } from '../dates.js';

/** @typedef {import('../items.js').Task} Task */
/** @typedef {import('../screens/views.js').Ctx} Ctx */
/** @typedef {import('../screens/views.js').AddContext} AddContext */
/**
 * The kind of list a host holds: 'tree' (a project's sections, or the Inbox) or 'days' (Today, Upcoming).
 * @typedef {{ kind: () => 'tree' | 'days' | null, projectId: () => string }} ListKind
 */
/**
 * A place between rows: the group (its section or day), the rows there without the moving ones, the index of the gap,
 * and where it is on screen.
 * @typedef {{ group: HTMLElement, sectionId: string | null, day: string | null, ids: string[], depths: number[], at: number, y: number,
 *   left: number, width: number, newSection?: boolean }} Gap
 */

const HOLD_MS = 500, SLOP = 10, INDENT = 24, MAX_DEPTH = 4;
const depthOf = (/** @type {HTMLElement} */ r) => Number(r.style.getPropertyValue('--depth')) || 0;

/**
 * The gaps of a list host's rows, leaving out the moving ones. @param {HTMLElement} host @param {Set<string>} skip
 * @param {boolean} [loose]  a project's page (its tasks outside the sections come first)
 * @returns {Gap[]}
 */
function gapsOf(host, skip, loose = false) {
  /** @type {Gap[]} */
  const gaps = [];
  const groups = /** @type {HTMLElement[]} */ ([...host.querySelectorAll(':scope > ul.td-rows, :scope > section.td-group')]);
  const board = host.classList.contains('td-board');
  // a project page with no tasks outside its sections: a place above the first one
  const first = groups[0];
  if (loose && first && !first.matches('ul')) {
    const b = first.getBoundingClientRect();
    gaps.push({ group: host, sectionId: null, day: null, ids: [], depths: [], at: 0, y: b.top, left: b.left, width: b.width });
  }
  for (const g of groups) {
    const sectionId = g.matches('section.td-section') ? String(g.dataset.id) : null, day = g.dataset.day ?? null;
    const rows = /** @type {HTMLElement[]} */ ([...g.querySelectorAll('.td-row')]).filter(r => !skip.has(String(r.dataset.id)));
    const box = (board ? g : g.matches('ul') ? g : g.querySelector('ul.td-rows') ?? g.querySelector('.td-group-head') ?? g).getBoundingClientRect();
    const ids = rows.map(r => String(r.dataset.id)), depths = rows.map(depthOf);
    const rects = rows.map(r => r.getBoundingClientRect());
    if (!rows.length) {
      // (a section folded away takes nothing; an empty one, under its name)
      if (g.matches('section.td-section') && !g.querySelector('.td-add-row')) continue;
      const y = board ? (g.querySelector('.td-col-head') ?? g).getBoundingClientRect().bottom + 4 : box.bottom;
      gaps.push({ group: g, sectionId, day, ids, depths, at: 0, y, left: box.left, width: box.width });
      continue;
    }
    for (let at = 0; at <= rows.length; at++) {
      const y = at === 0 ? rects[0].top : at === rows.length ? rects[at - 1].bottom : (rects[at - 1].bottom + rects[at].top) / 2;
      gaps.push({ group: g, sectionId, day, ids, depths, at, y, left: box.left, width: box.width });
    }
  }
  return gaps;
}
/** the gap nearest y (and, given x, in the column under it, or else the nearest column) @param {Gap[]} gaps @param {number} y @param {number} [x] */
const nearest = (gaps, y, x) => {
  if (x !== undefined) {
    const off = (/** @type {Gap} */ g) => (x < g.left ? g.left - x : x > g.left + g.width ? x - g.left - g.width : 0);
    const best = Math.min(...gaps.map(off));
    gaps = gaps.filter(g => off(g) === best);
  }
  return gaps.reduce((best, g) => (!best || Math.abs(g.y - y) < Math.abs(best.y - y) ? g : best), /** @type {Gap | null} */ (null));
};

/** the drop line: a clip the width of the list, and the line with its dot that moves in it */
function dropLine() {
  const clip = document.createElement('div');
  clip.className = 'td-drop-clip';
  const line = document.createElement('div');
  line.className = 'td-drop-line';
  clip.append(line);
  document.body.append(clip);
  const r = document.documentElement.getBoundingClientRect();
  clip.style.width = `${r.width}px`;
  return {
    /** @param {Gap | null} g @param {number} depth */
    show(g, depth) {
      if (!g) { line.style.opacity = '0'; return; }
      line.style.opacity = '1';
      line.style.width = `${Math.max(40, g.width - 16 - depth * INDENT)}px`;
      line.style.transform = `translate(${g.left + 16 + depth * INDENT}px, ${g.y - 1}px)`;
    },
    remove: () => clip.remove(),
  };
}

/** a glide's last frame let go, and the inline styles with it @param {HTMLElement[]} els */
const letGo = els => { for (const e of els) { for (const a of e.getAnimations()) a.cancel(); e.style.transform = ''; e.style.opacity = ''; } };

/** the tasks for a gap's rows, in order @param {Ctx} ctx @param {string[]} ids */
const tasksFor = (ctx, ids) => { const by = new Map(ctx.data().tasks.map(t => [t.id, t])); return ids.map(id => by.get(id)).filter(t => !!t); };

/**
 * Hold-to-move on a list host's rows.
 * @param {HTMLElement} host @param {Ctx} ctx @param {ListKind & { can: () => boolean, menu: (t: Task, row: HTMLElement) => void }} o
 * @returns {() => void} stop
 */
export function dragRows(host, ctx, o) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @type {{ id: number, x0: number, y0: number, row: HTMLElement, lifted: boolean, moved: boolean, kids: HTMLElement[], line?: ReturnType<typeof dropLine>,
   *   gaps?: Gap[], gap?: Gap | null, depth: number, dx: number, base: number, sx?: number } | null} */
  let p = null;
  const cancelHold = () => { clearTimeout(timer); timer = undefined; };

  const down = (/** @type {PointerEvent} */ e) => {
    if (p || !e.isPrimary || e.button > 0 || !o.can() || !o.kind()) return;
    const t = /** @type {Element} */ (e.target);
    const row = /** @type {HTMLElement | null} */ (t.closest('.td-row'));
    if (!row || !host.contains(row) || t.closest('.td-check, .td-fold') || row.classList.contains('is-done') || row.classList.contains('is-complete')) return;
    p = { id: e.pointerId, x0: e.clientX, y0: e.clientY, row, lifted: false, moved: false, kids: [], depth: depthOf(row), dx: 0, base: depthOf(row) };
    // (the list is not drawn again while a finger may be lifting a row: views.js waits for this to go)
    host.dataset.holding = '';
    timer = setTimeout(lift, HOLD_MS);
  };
  const lift = () => {
    timer = undefined;
    if (!p || row().classList.contains('is-swiping') || !claim('drag')) { p = null; delete host.dataset.holding; return; }
    const r = row();
    p.lifted = true;
    // its subtasks (the rows after it, deeper) go with it, faded
    for (let n = r.nextElementSibling; n instanceof HTMLElement && depthOf(n) > p.base; n = n.nextElementSibling) p.kids.push(n);
    for (const k of p.kids) k.style.opacity = '0.35';
    r.classList.add('is-lifted');
    r.style.transform = 'scale(1.03)';
    haptic('long');
  };
  const row = () => /** @type {HTMLElement} */ (p?.row);

  /** the week strip's day under the finger @type {HTMLElement | null} */
  let lit = null;
  const move = (/** @type {PointerEvent} */ e) => {
    if (!p || e.pointerId !== p.id) return;
    const dx = e.clientX - p.x0, dy = e.clientY - p.y0;
    if (!p.lifted) { if (Math.hypot(dx, dy) > SLOP) { cancelHold(); p = null; delete host.dataset.holding; } return; }
    if (!p.moved && Math.hypot(dx, dy) <= SLOP) return;
    const board = host.classList.contains('td-board');
    if (!p.moved) {
      p.moved = true;
      p.line = dropLine();
      p.sx = host.scrollLeft;
      if (board) host.style.scrollSnapType = 'none';
    }
    const skip = new Set([String(row().dataset.id), ...p.kids.map(k => String(k.dataset.id))]);
    if (board || !p.gaps) p.gaps = gapsOf(host, skip, o.kind() === 'tree' && !board);
    const sx = board ? host.scrollLeft - (p.sx ?? 0) : 0;
    row().style.transform = `translate(${dx + sx}px, ${dy}px) scale(1.03)${board ? ' rotate(2deg)' : ''}`;
    for (const k of p.kids) k.style.transform = `translate(${dx}px, ${dy}px)`;
    if (board) edgeScroll(e.clientX);
    const r = row().getBoundingClientRect();
    const g = nearest(/** @type {Gap[]} */ (p.gaps), r.top + r.height / 2, board ? e.clientX : undefined);
    const depth = o.kind() === 'tree' && g && !board ? treeDepth(g, p.base + Math.round(dx / INDENT)) : 0;
    if (g !== p.gap || depth !== p.depth) haptic('tick');
    p.gap = g; p.depth = depth; p.dx = dx;
    p.line?.show(g, depth);
    if (o.kind() === 'days') {
      const cell = /** @type {HTMLElement | undefined} */ (document.elementsFromPoint(e.clientX, e.clientY).find(n => n instanceof HTMLElement && n.dataset.dropDay)) ?? null;
      if (cell !== lit) { lit?.classList.remove('is-drop'); lit = cell; lit?.classList.add('is-drop'); if (cell) haptic('tick'); }
    }
  };
  /** the depth a gap allows near the one wanted @param {Gap} g @param {number} want */
  const treeDepth = (g, want) => {
    const lines = tasksFor(ctx, g.ids).map((task, i) => ({ task, depth: g.depths[i] }));
    try { return placeInTree(lines, g.at, want, height(), MAX_DEPTH).depth; } catch { return 0; }
  };
  const height = () => { const q = p; return q ? Math.max(0, ...q.kids.map(k => depthOf(k) - q.base)) : 0; };
  /** near a board's side, it scrolls a step that way each frame while the finger stays there @param {number} x */
  let edge = 0, edgeX = 0;
  const edgeScroll = (/** @type {number} */ x) => {
    edgeX = x;
    if (edge) return;
    const step = () => {
      const b = host.getBoundingClientRect(), by = edgeX < b.left + 40 ? -8 : edgeX > b.right - 40 ? 8 : 0;
      if (!p?.moved || !by) { edge = 0; return; }
      host.scrollLeft += by;
      edge = requestAnimationFrame(step);
    };
    edge = requestAnimationFrame(step);
  };

  const up = async (/** @type {PointerEvent} */ e) => {
    if (!p || e.pointerId !== p.id) return;
    cancelHold();
    const was = p;
    p = null;
    delete host.dataset.holding;
    if (!was.lifted) return;
    // the click that follows the let-go is the drag's, not the row's
    const eat = (/** @type {MouseEvent} */ c) => { c.preventDefault(); c.stopPropagation(); };
    host.addEventListener('click', eat, { capture: true, once: true });
    setTimeout(() => host.removeEventListener('click', eat, true), 400);
    release('drag');
    cancelAnimationFrame(edge); edge = 0;
    host.style.scrollSnapType = '';
    const r = was.row;
    was.line?.remove();
    const task = ctx.data().tasks.find(t => t.id === r.dataset.id);
    const settle = () => {
      r.classList.remove('is-lifted');
      void glide([[r, k => ({ transform: `scale(${1 + 0.03 * k})` })], ...was.kids.map(n => /** @type {[HTMLElement, (k: number) => Keyframe]} */ (
        [n, k => ({ opacity: String(1 - 0.65 * k) })]))], 1, 0).done.then(() => letGo([r, ...was.kids]));
    };
    if (!task || e.type === 'pointercancel') { settle(); return; }
    if (!was.moved) { settle(); o.menu(task, r); return; }
    const g = was.gap;
    // (where it was: nothing to save)
    r.style.transform = ''; r.classList.remove('is-lifted');
    for (const k of was.kids) { k.style.transform = ''; k.style.opacity = ''; }
    // let go on a day of the week strip (Upcoming): that day; a list in Display's own order keeps its order
    const cell = /** @type {HTMLElement | undefined} */ (document.elementsFromPoint(e.clientX, e.clientY).find(n => n instanceof HTMLElement && n.dataset.dropDay));
    lit?.classList.remove('is-drop'); lit = null;
    if (cell) {
      const date = String(cell.dataset.dropDay);
      if (task.due?.date !== date && await ctx.app.editTask(task, { due: { ...(task.due ?? {}), date } })) ctx.toast(REFUSED);
      return;
    }
    if (!g || host.hasAttribute('data-sorted')) return;
    const refused = o.kind() === 'tree' ? await dropInTree(ctx, task, g, was.depth, Math.max(0, ...was.kids.map(k => depthOf(k) - was.base)), o.projectId())
      : await dropInDay(ctx, task, g);
    if (refused) ctx.toast(REFUSED);
  };
  const touchMove = (/** @type {TouchEvent} */ e) => { if (p?.lifted && e.cancelable) e.preventDefault(); };
  const menu = (/** @type {MouseEvent} */ e) => {
    const r = /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest('.td-row'));
    if (!r || !host.contains(r)) return;
    e.preventDefault();
    // a right click (or a long press the browser reads as one) opens the menu; a hold already lifting waits for its let-go
    if (p) return;
    const task = ctx.data().tasks.find(t => t.id === r.dataset.id);
    if (task && o.can()) o.menu(task, r);
  };
  host.addEventListener('pointerdown', down, { passive: true });
  addEventListener('pointermove', move, { passive: true });
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
  host.addEventListener('touchmove', touchMove, { passive: false });
  host.addEventListener('contextmenu', menu);
  return () => {
    host.removeEventListener('pointerdown', down);
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', up);
    host.removeEventListener('touchmove', touchMove);
    host.removeEventListener('contextmenu', menu);
  };
}

/** a task let go in a project's list @param {Ctx} ctx @param {Task} task @param {Gap} g @param {number} depth
 * @param {number} height @param {string} projectId @returns {Promise<string>} */
async function dropInTree(ctx, task, g, depth, height, projectId) {
  const lines = tasksFor(ctx, g.ids).map((t, i) => ({ task: t, depth: g.depths[i] }));
  const r = placeInTree(lines, g.at, depth, height, MAX_DEPTH);
  const same = (task.sectionId ?? null) === g.sectionId && (task.parentId ?? null) === r.parentId;
  const { order, renumber } = placeAt(/** @type {Task[]} */ (r.siblings), r.index);
  // (the same place among the same neighbours: nothing to save)
  if (same) {
    const sib = /** @type {Task[]} */ (r.siblings), before = sib[r.index - 1], after = sib[r.index];
    if ((!before || before.order < task.order) && (!after || after.order > task.order)) return '';
  }
  return ctx.app.placeTask(task, { projectId, sectionId: g.sectionId, parentId: r.parentId, order }, renumber);
}

/** a task let go in a day's list (Today, Upcoming) @param {Ctx} ctx @param {Task} task @param {Gap} g @returns {Promise<string>} */
async function dropInDay(ctx, task, g) {
  const list = /** @type {Task[]} */ (tasksFor(ctx, g.ids));
  list.splice(g.at, 0, task);
  const date = g.day && task.due?.date !== g.day ? g.day : undefined;
  const all = renumbered(list.map((t, i) => ({ ...t, dayOrder: typeof t.dayOrder === 'number' ? t.dayOrder : -1 - i })), 'dayOrder');
  const others = all.filter(x => x.item.id !== task.id);
  const own = list.indexOf(task) + 1;
  if (!date && !others.length && task.dayOrder === own) return '';
  return ctx.app.placeTask(task, { dayOrder: own, ...(date ? { date } : {}) }, others, 'dayOrder');
}

/**
 * Dragging the + button onto the list. @param {HTMLElement} fab @param {Ctx} ctx
 * @param {ListKind & { host: () => HTMLElement | null, add: (o: AddContext) => void, newSection: (projectId: string) => void }} o
 * @returns {() => void} stop
 */
export function dragFab(fab, ctx, o) {
  /** @type {{ id: number, x0: number, y0: number, live: boolean, cancel?: HTMLElement, line?: ReturnType<typeof dropLine>, gaps?: Gap[],
   *   gap?: Gap | null, over?: boolean, divider?: HTMLElement | null, host?: HTMLElement } | null} */
  let p = null;
  const down = (/** @type {PointerEvent} */ e) => {
    if (p || !e.isPrimary || e.button > 0 || !ctx.canWrite() || !o.kind() || !o.host()) return;
    p = { id: e.pointerId, x0: e.clientX, y0: e.clientY, live: false };
  };
  const start = () => {
    if (!p) return;
    const host = /** @type {HTMLElement} */ (o.host());
    if (!claim('drag')) { p = null; return; }
    p.live = true; p.host = host;
    try { fab.setPointerCapture(p.id); } catch { /* gone */ }
    // the grey x where the button was
    const r = fab.getBoundingClientRect();
    const x = document.createElement('div');
    x.className = 'td-fab-cancel';
    x.setAttribute('aria-hidden', 'true');
    x.append(icon(ICONS.x));
    x.style.transform = `translate(${r.left + r.width / 2 - 22}px, ${r.top + r.height / 2 - 22}px)`;
    document.body.append(x);
    p.cancel = x;
    // a project's page: "Add section" under its last section
    if (o.kind() === 'tree') {
      const d = document.createElement('div');
      d.className = 'td-drop-section';
      d.append(document.createElement('span'), Object.assign(document.createElement('span'), { textContent: 'Add section' }), document.createElement('span'));
      const add = host.querySelector(':scope > .td-add-section');
      if (add) add.before(d); else host.append(d);
      p.divider = d;
    }
    fab.classList.add('is-dragging');
    p.line = dropLine();
    p.gaps = gapsOf(host, new Set(), o.kind() === 'tree');
    if (p.divider) { const b = p.divider.getBoundingClientRect(); p.gaps.push({ group: p.divider, sectionId: null, day: null, ids: [], depths: [], at: 0, y: b.top + b.height / 2, left: b.left, width: b.width, newSection: true }); }
    haptic('long');
  };
  const move = (/** @type {PointerEvent} */ e) => {
    if (!p || e.pointerId !== p.id) return;
    const dx = e.clientX - p.x0, dy = e.clientY - p.y0;
    if (!p.live) { if (Math.hypot(dx, dy) > SLOP) start(); if (!p?.live) return; }
    fab.style.transform = `translate(${dx}px, ${dy}px)`;
    const c = /** @type {HTMLElement} */ (p.cancel).getBoundingClientRect();
    const over = Math.hypot(e.clientX - (c.left + c.width / 2), e.clientY - (c.top + c.height / 2)) < 36;
    const g = over ? null : nearest(/** @type {Gap[]} */ (p.gaps), e.clientY);
    if (over !== p.over || g !== p.gap) haptic('tick');
    p.over = over; p.gap = g;
    /** @type {HTMLElement} */ (p.cancel).classList.toggle('is-over', over);
    p.divider?.classList.toggle('is-over', !!g?.newSection);
    p.line?.show(g?.newSection ? null : g ?? null, 0);
  };
  const up = (/** @type {PointerEvent} */ e) => {
    if (!p || e.pointerId !== p.id) return;
    const was = p;
    p = null;
    if (!was.live) return;
    release('drag');
    const eat = (/** @type {MouseEvent} */ c) => { c.preventDefault(); c.stopImmediatePropagation(); };
    fab.addEventListener('click', eat, { capture: true, once: true });
    setTimeout(() => fab.removeEventListener('click', eat, true), 400);
    was.cancel?.remove(); was.line?.remove(); was.divider?.remove();
    fab.classList.remove('is-dragging');
    const m = /^translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(fab.style.transform);
    const from = m ? [+m[1], +m[2]] : [0, 0];
    void glide([[fab, k => ({ transform: `translate(${from[0] * k}px, ${from[1] * k}px)` })]], 1, 0).done.then(() => letGo([fab]));
    const g = was.gap;
    if (e.type === 'pointercancel' || was.over || !g) return;
    const pid = o.projectId();
    if (g.newSection) { o.newSection(pid); return; }
    if (o.kind() === 'tree') {
      const lines = tasksFor(ctx, g.ids).map((t, i) => ({ task: t, depth: g.depths[i] }));
      const r = placeInTree(lines, g.at, g.at > 0 ? g.depths[g.at - 1] ?? 0 : 0, 0, MAX_DEPTH);
      const { order } = placeAt(/** @type {Task[]} */ (r.siblings), r.index);
      o.add({ projectId: pid, sectionId: g.sectionId, parentId: r.parentId, order });
    } else o.add({ projectId: pid, due: { date: g.day ?? dayKey() } });
  };
  fab.addEventListener('pointerdown', down, { passive: true });
  addEventListener('pointermove', move, { passive: true });
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
  fab.style.touchAction = 'none';
  return () => {
    fab.removeEventListener('pointerdown', down);
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', up);
  };
}
