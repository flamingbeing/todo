// Moving tasks by hand. A row held still for half a second lifts (a little larger, a tick); moved, it follows the
// finger and a 2 px line with a dot shows where it will land; pulled 24 px sideways it goes one level in or out
// (four at most; only in a list with no grouping or sorting). On a project page it lands in that section, under the
// parent the line shows, between its neighbours (order.js placeInTree and placeAt); on Today and Upcoming it takes its
// place in the day (dayOrder, renumbered), and dropped on another day of Upcoming it moves to that day. In a list
// grouped by Display (date, priority, label, project) it may go to another group, which sets that value (group-drop.js),
// with Undo. A sorted list keeps its order: moved after the hold, a toast says so and offers manual order. On Today a
// place at the foot postpones a task to tomorrow. Near the top or foot of the list (a board's sides too) the list
// scrolls by itself (edge-scroll.js). Let go without moving, the row's menu opens (select.js).
// The + button dragged onto the list grows, shows the same line and a grey x where it was (dropped there, nothing
// happens), and on a project page an "Add section" line below the last section: let go, quick add opens for that
// place, or a new section is named there. On a board (screens/board.js) a card tilts as it lifts and lands in the
// column under the finger; near the board's side it scrolls to the next column. Only transforms and opacity move
// (and the list's own scroll); the arbiter's 'drag' owns the touch while lifted.
import { claim, release, haptic, glide, icon } from '@core/ui';
import { MORE } from '../icons-more.js';
import { REFUSED } from '../items.js';
import { placeInTree, placeAt, renumbered } from '../order.js';
import { dayKey } from '../dates.js';
import { cleanDisplay, plainDisplay, ownOrder, OWN_ORDER } from '../tasks.js';
import { groupMove, slotIn, postponed, sortedNote, addFor } from '../group-drop.js';
import { edgeScroll, scrollerOf, shownSpan } from './edge-scroll.js';

/** @typedef {import('../items.js').Task} Task */
/** @typedef {import('../screens/views.js').Ctx} Ctx */
/** @typedef {import('../screens/views.js').AddContext} AddContext */
/**
 * The kind of list a host holds: 'tree' (a project's sections, or the Inbox), 'days' (Today, Upcoming) or 'own' (a
 * filter's or label's page: its smart order, never dragged; a row is still held for its menu); a host grouped by
 * Display says so itself (data-grouped: the grouping), and is 'groups'.
 * @typedef {{ kind: () => 'tree' | 'days' | 'own' | null, projectId: () => string }} ListKind
 */
/**
 * A place between rows: the group (its section, day or Display group), the rows there without the moving ones, the
 * index of the gap, and where it is on screen.
 * @typedef {{ group: HTMLElement, sectionId: string | null, day: string | null, gkey?: string, ids: string[], depths: number[], at: number, y: number,
 *   left: number, width: number, newSection?: boolean }} Gap
 */

const HOLD_MS = 500, SLOP = 10, INDENT = 24, MAX_DEPTH = 4, BOARD_EDGE = 40;
const depthOf = (/** @type {HTMLElement} */ r) => Number(r.style.getPropertyValue('--depth')) || 0;
/** a host's kind now @param {HTMLElement} host @param {ListKind} o @returns {'tree' | 'days' | 'own' | 'groups' | null} */
const kindOf = (host, o) => (host.dataset.grouped ? 'groups' : o.kind());
/** sorted by Display (a calendar's own order is not: data-sorted="cal") @param {HTMLElement} host */
const sortedHost = host => host.hasAttribute('data-sorted') && host.dataset.sorted !== 'cal';

/**
 * The gaps of a list host's rows, leaving out the moving ones. @param {HTMLElement} host @param {Set<string>} skip
 * @param {boolean} [loose]  a project's page (its tasks outside the sections come first)
 * @param {string} [from]  in a grouped list, the group the row comes from (Overdue takes only its own)
 * @returns {Gap[]}
 */
function gapsOf(host, skip, loose = false, from = '') {
  /** @type {Gap[]} */
  const gaps = [];
  const grouped = host.dataset.grouped;
  const groups = /** @type {HTMLElement[]} */ ([...host.querySelectorAll(grouped ? '[data-gkey]' : ':scope > ul.td-rows, :scope > section.td-group')]);
  const board = host.classList.contains('td-board');
  // a project page with no tasks outside its sections: a place above the first one
  const first = groups[0];
  if (!grouped && loose && first && !first.matches('ul')) {
    const b = first.getBoundingClientRect();
    gaps.push({ group: host, sectionId: null, day: null, ids: [], depths: [], at: 0, y: b.top, left: b.left, width: b.width });
  }
  for (const g of groups) {
    const gkey = grouped ? String(g.dataset.gkey) : undefined;
    if (grouped === 'date' && gkey === '0' && from !== '0') continue;
    const sectionId = g.matches('section.td-section') ? String(g.dataset.id) : null, day = g.dataset.day ?? null;
    const rows = /** @type {HTMLElement[]} */ ([...g.querySelectorAll('.td-row')]).filter(r => !skip.has(String(r.dataset.id)));
    const box = (board ? g : g.matches('ul') ? g : g.querySelector('ul.td-rows') ?? g.querySelector('.td-group-head') ?? g).getBoundingClientRect();
    const ids = rows.map(r => String(r.dataset.id)), depths = rows.map(depthOf);
    const rects = rows.map(r => r.getBoundingClientRect());
    if (!rows.length) {
      // (a section folded away takes nothing; an empty one, under its name)
      if (g.matches('section.td-section') && !g.querySelector('.td-add-row')) continue;
      const y = board ? (g.querySelector('.td-col-head') ?? g).getBoundingClientRect().bottom + 4 : box.bottom;
      gaps.push({ group: g, sectionId, day, gkey, ids, depths, at: 0, y, left: box.left, width: box.width });
      continue;
    }
    for (let at = 0; at <= rows.length; at++) {
      const y = at === 0 ? rects[0].top : at === rows.length ? rects[at - 1].bottom : (rects[at - 1].bottom + rects[at].top) / 2;
      gaps.push({ group: g, sectionId, day, gkey, ids, depths, at, y, left: box.left, width: box.width });
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

/** the drop line: a clip the width of the list, and the line with its dot (at its left end) that moves in it */
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

/** Today's postpone place at the foot of the list while a row is dragged: let go there, the task moves to tomorrow */
function postponeZone() {
  const z = document.createElement('div');
  z.className = 'td-postpone';
  z.setAttribute('aria-hidden', 'true');
  const words = document.createElement('span');
  words.append('Let go here to move it to ', Object.assign(document.createElement('b'), { textContent: 'Tomorrow' }));
  z.append(icon(MORE.redo2, { class: 'td-postpone-icon' }), words);
  document.body.append(z);
  // (fades in: opacity only)
  requestAnimationFrame(() => z.classList.add('is-on'));
  return z;
}

/** a glide's last frame let go, and the inline styles with it @param {HTMLElement[]} els */
const letGo = els => { for (const e of els) { for (const a of e.getAnimations()) a.cancel(); e.style.transform = ''; e.style.opacity = ''; } };

/** the tasks for a gap's rows, in order @param {Ctx} ctx @param {string[]} ids */
const tasksFor = (ctx, ids) => { const by = new Map(ctx.data().tasks.map(t => [t.id, t])); return ids.map(id => by.get(id)).filter(t => !!t); };
/** the lines placeInTree reads: each task with its depth and how many subtasks it has @param {Ctx} ctx @param {Gap} g */
const treeLines = (ctx, g) => {
  const kids = new Map();
  for (const t of ctx.data().tasks) if (t.parentId) kids.set(t.parentId, (kids.get(t.parentId) ?? 0) + 1);
  return tasksFor(ctx, g.ids).map((task, i) => ({ task, depth: g.depths[i], kids: kids.get(task.id) ?? 0 }));
};

/**
 * Hold-to-move on a list host's rows.
 * @param {HTMLElement} host @param {Ctx} ctx
 * @param {ListKind & { can: () => boolean, menu: (t: Task, row: HTMLElement) => void, view: () => string }} o  view: the list's Display key
 * @returns {() => void} stop
 */
export function dragRows(host, ctx, o) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @type {{ id: number, x0: number, y0: number, fx: number, fy: number, row: HTMLElement, lifted: boolean, moved: boolean, kids: HTMLElement[],
   *   line?: ReturnType<typeof dropLine>, gaps?: Gap[], gap?: Gap | null, depth: number, base: number, sx: number, sy: number,
   *   from: string, i0: number, zone?: HTMLElement, over?: boolean } | null} */
  let p = null;
  const cancelHold = () => { clearTimeout(timer); timer = undefined; };
  const board = () => host.classList.contains('td-board');
  const sc = () => scrollerOf(host);
  const top = (/** @type {Element} */ x) => (x === document.scrollingElement || x === document.documentElement ? scrollY : x.scrollTop);

  let busy = false;
  const down = (/** @type {PointerEvent} */ e) => {
    if (p || busy || !e.isPrimary || e.button > 0 || !o.can() || !kindOf(host, o)) return;
    const t = /** @type {Element} */ (e.target);
    const row = /** @type {HTMLElement | null} */ (t.closest('.td-row'));
    if (!row || !host.contains(row) || t.closest('.td-check, .td-fold') || row.classList.contains('is-done') || row.classList.contains('is-complete')) return;
    const own = /** @type {HTMLElement | null} */ (row.closest('[data-gkey]'));
    p = { id: e.pointerId, x0: e.clientX, y0: e.clientY, fx: e.clientX, fy: e.clientY, row, lifted: false, moved: false, kids: [], depth: depthOf(row),
      base: depthOf(row), sx: 0, sy: 0, from: own?.dataset.gkey ?? '', i0: own ? [...own.querySelectorAll('.td-row')].indexOf(row) : -1 };
    // (the list is not drawn again while a finger may be lifting a row: views.js waits for this to go)
    host.dataset.holding = '';
    timer = setTimeout(lift, HOLD_MS);
  };
  const lift = () => {
    timer = undefined;
    if (!p || row().classList.contains('is-swiping') || !claim('drag')) { p = null; delete host.dataset.holding; return; }
    const r = row();
    p.lifted = true;
    // its subtasks (the rows after it, deeper) go with it, faded; in Display's groups each task is a row of its own
    if (kindOf(host, o) !== 'groups') for (let n = r.nextElementSibling; n instanceof HTMLElement && depthOf(n) > p.base; n = n.nextElementSibling) p.kids.push(n);
    for (const k of p.kids) k.style.opacity = '0.35';
    r.classList.add('is-lifted');
    r.style.transform = `scale(${LIFT})`;
    haptic('long');
  };
  const row = () => /** @type {HTMLElement} */ (p?.row);

  // the list scrolls near its top and foot (above Today's postpone place when it shows, and not while over it); a board
  // near its sides too
  const vert = edgeScroll({ el: sc, span: () => shownSpan(sc(), p?.zone ? p.zone.getBoundingClientRect().top - 8 : undefined),
    at: () => p?.fy ?? 0, on: () => !!p?.moved && !p.over, moved: () => { if (p) { unslide(); p.gaps = undefined; } follow(); } });
  const side = edgeScroll({ el: () => host, axis: 'x', zone: BOARD_EDGE, span: () => { const b = host.getBoundingClientRect(); return [b.left, b.right]; },
    at: () => p?.fx ?? 0, on: () => !!p?.moved && board(), moved: () => follow() });

  /** neighbours that have slid out of the way: one row height, 150 ms (app.css .is-sliding) @type {Map<HTMLElement, number>} */
  const slid = new Map();
  /** the rows between the lifted one's place and the gap slide one row's height; the rest are back */
  const slide = (/** @type {NonNullable<typeof p>} */ q, /** @type {Gap | null} */ g) => {
    /** @type {Map<HTMLElement, number>} */
    const want = new Map();
    const og = q.gaps?.find(x => x.group.contains(q.row))?.group;
    if (g && og) {
      const moving = new Set([q.row, ...q.kids]);
      const h = [q.row, ...q.kids].reduce((n, r) => n + r.offsetHeight, 0);
      const rows = /** @type {HTMLElement[]} */ ([...og.querySelectorAll('.td-row')]).filter(r => !moving.has(r));
      const o = rows.filter(r => q.row.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_PRECEDING).length;
      if (g.group === og) {
        if (g.at > o) rows.slice(o, g.at).forEach(r => want.set(r, -h));
        else rows.slice(g.at, o).forEach(r => want.set(r, h));
      } else {
        rows.slice(o).forEach(r => want.set(r, -h));
        const tr = /** @type {HTMLElement[]} */ ([...g.group.querySelectorAll('.td-row')]).filter(r => !moving.has(r));
        tr.slice(g.at).forEach(r => want.set(r, h));
      }
    }
    for (const [r] of slid) if (!want.has(r)) { r.style.transform = ''; slid.delete(r); r.classList.remove('is-sliding'); }
    for (const [r, y] of want) { if (slid.get(r) === y) continue; r.classList.add('is-sliding'); r.style.transform = `translateY(${y}px)`; slid.set(r, y); }
  };
  /** every neighbour back at once (before the places are measured again, and at the let-go) */
  const unslide = () => { for (const [r] of slid) { r.classList.remove('is-sliding'); r.style.transform = ''; } slid.clear(); };

  /** the week strip's day under the finger @type {HTMLElement | null} */
  let lit = null;
  /** the row where the finger is, and the place it would land */
  const follow = () => {
    const q = p;
    if (!q?.moved) return;
    const dx = q.fx - q.x0, dy = q.fy - q.y0, b = board(), kind = kindOf(host, o);
    const skip = new Set([String(row().dataset.id), ...q.kids.map(k => String(k.dataset.id))]);
    if (b || !q.gaps) q.gaps = gapsOf(host, skip, kind === 'tree' && !b, q.from);
    const sx = b ? host.scrollLeft - q.sx : 0, sy = top(sc()) - q.sy;
    row().style.transform = `translate(${dx + sx}px, ${dy + sy}px) scale(${LIFT})${b ? ' rotate(2deg)' : ''}`;
    for (const k of q.kids) k.style.transform = `translate(${dx}px, ${dy + sy}px)`;
    // over Today's postpone place: no line
    const z = q.zone?.getBoundingClientRect();
    const over = !!z && q.fy >= z.top && q.fy <= z.bottom && q.fx >= z.left && q.fx <= z.right;
    if (over !== !!q.over) { q.zone?.classList.toggle('is-over', over); haptic('tick'); }
    q.over = over;
    const r = row().getBoundingClientRect();
    const g = over ? null : nearest(/** @type {Gap[]} */ (q.gaps), r.top + r.height / 2, b ? q.fx : undefined);
    const depth = kind === 'tree' && g && !b ? treeDepth(g, q.base + Math.round(dx / INDENT)) : 0;
    if (g !== q.gap || depth !== q.depth) haptic('tick');
    q.gap = g; q.depth = depth;
    q.line?.show(g, depth);
    // Today/Upcoming (days): rows stay put, only the line overlays (the reference does not shift them)
    if (!b && kind !== 'days') slide(q, g);
    if (kind === 'days') {
      const cell = /** @type {HTMLElement | undefined} */ (document.elementsFromPoint(q.fx, q.fy).find(n => n instanceof HTMLElement && n.dataset.dropDay)) ?? null;
      if (cell !== lit) { lit?.classList.remove('is-drop'); lit = cell; lit?.classList.add('is-drop'); if (cell) haptic('tick'); }
    }
  };
  const move = (/** @type {PointerEvent} */ e) => {
    if (!p || e.pointerId !== p.id) return;
    const dx = e.clientX - p.x0, dy = e.clientY - p.y0;
    if (!p.lifted) { if (Math.hypot(dx, dy) > SLOP) { cancelHold(); p = null; delete host.dataset.holding; } return; }
    if (!p.moved && Math.hypot(dx, dy) <= SLOP) return;
    p.fx = e.clientX; p.fy = e.clientY;
    if (!p.moved) {
      // a sorted list keeps Display's order: say so, and offer the hand-made one
      if (sortedHost(host)) { sorted(); return; }
      // a filter's or a label's page keeps its smart order (no hand-made one): say so
      if (kindOf(host, o) === 'own' || (!host.dataset.grouped && ownOrder(o.view()))) { sorted(OWN_ORDER); return; }
      p.moved = true;
      p.line = dropLine();
      p.sx = host.scrollLeft;
      p.sy = top(sc());
      if (board()) host.style.scrollSnapType = 'none';
      if (host.id === 'today' && kindOf(host, o) === 'days' && !board()) p.zone = postponeZone();
    }
    follow();
    vert.poke();
    side.poke();
  };
  /** the drag stood down in a sorted list: the row settles, a toast offers manual order (note: a list with no manual
   * order, said without the offer) @param {string} [note] */
  const sorted = note => {
    const was = /** @type {NonNullable<typeof p>} */ (p);
    p = null;
    delete host.dataset.holding;
    release('drag');
    settleRow(was.row, was.kids);
    if (note) { ctx.toast(note); return; }
    const view = o.view(), d = ctx.display(view);
    ctx.toast(sortedNote(d.sort), { action: { label: 'Manual order', run: () => {
      const s = ctx.app.settings, all = { .../** @type {Record<string, unknown>} */ (s.get('display') ?? {}) }, next = cleanDisplay({ ...ctx.display(view), sort: 'manual' }, view);
      if (plainDisplay(next, view)) delete all[view]; else all[view] = next;
      s.set('display', all);
    } } });
  };
  /** the depth a gap allows near the one wanted @param {Gap} g @param {number} want */
  const treeDepth = (g, want) => {
    const lines = treeLines(ctx, g);
    try { return placeInTree(lines, g.at, want, height(), MAX_DEPTH).depth; } catch { return 0; }
  };
  const height = () => { const q = p; return q ? Math.max(0, ...q.kids.map(k => depthOf(k) - q.base)) : 0; };

  const up = async (/** @type {PointerEvent} */ e) => {
    if (!p || e.pointerId !== p.id) return;
    cancelHold();
    const was = p;
    p = null;
    if (!was.lifted) { delete host.dataset.holding; return; }
    // the click that follows the let-go is the drag's, not the row's
    const eat = (/** @type {MouseEvent} */ c) => { c.preventDefault(); c.stopPropagation(); };
    host.addEventListener('click', eat, { capture: true, once: true });
    setTimeout(() => host.removeEventListener('click', eat, true), 400);
    release('drag');
    vert.stop(); side.stop();
    host.style.scrollSnapType = '';
    const r = was.row;
    was.zone?.remove();
    unslide();
    // days lists: the card glides the last stretch to the line (200 ms ease-out), then the line cuts and the edit applies
    if (was.moved && was.gap && !was.over && e.type !== 'pointercancel' && kindOf(host, o) === 'days' && !host.hasAttribute('data-sorted')
      && !document.elementsFromPoint(e.clientX, e.clientY).some(n => n instanceof HTMLElement && n.dataset.dropDay)
      && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(r.style.transform);
      if (m) {
        const delta = was.gap.y - r.getBoundingClientRect().top;
        // (busy until the glide ends: no new press on a row still moving; the drop highlight goes out at once)
        busy = true;
        lit?.classList.remove('is-drop'); lit = null;
        const glides = [r, ...was.kids].flatMap(n => {
          const from = n.style.transform, t = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(from);
          if (!t) return [];
          const to = from.replace(t[0], `translate(${t[1]}px, ${Number(t[2]) + delta}px)`);
          return [n.animate([{ transform: from }, { transform: to }], { duration: 200, easing: 'cubic-bezier(0,0,.2,1)', fill: 'forwards' })];
        });
        try { await Promise.all(glides.map(a => a.finished)); } catch { /* cancelled */ }
        for (const n of [r, ...was.kids]) for (const a of n.getAnimations()) a.cancel();
        busy = false;
      }
    }
    delete host.dataset.holding;
    was.line?.remove();
    const task = ctx.data().tasks.find(t => t.id === r.dataset.id);
    if (!task || e.type === 'pointercancel') { settleRow(r, was.kids); return; }
    if (!was.moved) { settleRow(r, was.kids); o.menu(task, r); return; }
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
    if (was.over) { await postpone(ctx, task); return; }
    if (!g || host.hasAttribute('data-sorted')) return;
    const kind = kindOf(host, o);
    const refused = kind === 'groups' ? await dropInGroup(ctx, task, String(host.dataset.grouped), was.from, was.i0, g, host.hasAttribute('data-by-day'))
      : kind === 'tree' ? await dropInTree(ctx, task, g, was.depth, Math.max(0, ...was.kids.map(k => depthOf(k) - was.base)), o.projectId())
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

// how much a lifted row grows: 3 %, a list's row as a board's card, with the lift shadow (app.css .is-lifted)
const LIFT = 1.03;

/** a lifted row back to its size, its subtasks unfaded @param {HTMLElement} r @param {HTMLElement[]} kids */
function settleRow(r, kids) {
  const g = LIFT - 1;
  r.classList.remove('is-lifted');
  void glide([[r, k => ({ transform: `scale(${1 + g * k})` })], ...kids.map(n => /** @type {[HTMLElement, (k: number) => Keyframe]} */ (
    [n, k => ({ opacity: String(1 - 0.65 * k) })]))], 1, 0).done.then(() => letGo([r, ...kids]));
}

/** Today's postpone place: tomorrow, time and repeat kept, with Undo @param {Ctx} ctx @param {Task} task */
async function postpone(ctx, task) {
  const due = task.due ?? null;
  if (await ctx.app.editTask(task, { due: postponed(task, dayKey()) })) { ctx.toast(REFUSED); return; }
  ctx.undo.show('Moved to Tomorrow', async () => {
    const now = ctx.data().tasks.find(x => x.id === task.id) ?? task;
    if (await ctx.app.editTask(now, { due })) ctx.toast(REFUSED);
  });
}

/**
 * A task let go in a list grouped by Display: the group's value (group-drop.js), its place there by hand-made order,
 * one save (its subtasks follow a new project), and Undo naming the new group.
 * @param {Ctx} ctx @param {Task} task @param {string} group @param {string} from @param {number} i0  where it was in its group
 * @param {Gap} g @param {boolean} byDay  a day's list (Today): its place is the day's order
 * @returns {Promise<string>}
 */
async function dropInGroup(ctx, task, group, from, i0, g, byDay) {
  const data = ctx.data(), to = String(g.gkey);
  const m = groupMove(task, group, from, to, { labels: data.labels, projects: data.projects, today: dayKey(), byDay });
  if (!m || (from === to && g.at === i0)) return '';
  const { value, renumber } = slotIn(/** @type {Task[]} */ (tasksFor(ctx, g.ids)), g.at, task, m.key);
  const refused = await ctx.app.placeTask(task, { ...m.place, ...(m.key === 'order' ? { order: value } : { dayOrder: value }), fields: m.fields }, renumber, m.key);
  if (refused || from === to) return refused;
  const { projectId, sectionId, parentId, ...fields } = m.was;
  ctx.undo.show(`Moved to ${m.title}`, async () => {
    const now = ctx.data().tasks.find(x => x.id === task.id) ?? task;
    const back = m.key === 'order' ? { order: task.order } : typeof task.dayOrder === 'number' ? { dayOrder: task.dayOrder } : {};
    if (await ctx.app.placeTask(now, { projectId, sectionId, parentId, ...back, fields })) ctx.toast(REFUSED);
  });
  return '';
}

/** a task let go in a project's list @param {Ctx} ctx @param {Task} task @param {Gap} g @param {number} depth
 * @param {number} height @param {string} projectId @returns {Promise<string>} */
async function dropInTree(ctx, task, g, depth, height, projectId) {
  const lines = treeLines(ctx, g);
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
  /** @type {{ id: number, x0: number, y0: number, fx: number, fy: number, live: boolean, cancel?: HTMLElement, line?: ReturnType<typeof dropLine>, gaps?: Gap[],
   *   gap?: Gap | null, over?: boolean, divider?: HTMLElement | null, addBtn?: HTMLElement | null, host?: HTMLElement } | null} */
  let p = null;
  // the + grows from 56 to 96 px while it is dragged
  const GROW = 96 / 56;
  const down = (/** @type {PointerEvent} */ e) => {
    if (p || !e.isPrimary || e.button > 0 || !ctx.canWrite() || !o.kind() || !o.host()) return;
    p = { id: e.pointerId, x0: e.clientX, y0: e.clientY, fx: e.clientX, fy: e.clientY, live: false };
  };
  /** the places to let go, measured now (again after the list scrolls) */
  const measure = () => {
    if (!p?.host) return;
    const host = p.host;
    p.gaps = gapsOf(host, new Set(), !host.dataset.grouped && o.kind() === 'tree');
    if (p.divider) { const b = p.divider.getBoundingClientRect(); p.gaps.push({ group: p.divider, sectionId: null, day: null, ids: [], depths: [], at: 0, y: b.top + b.height / 2, left: b.left, width: b.width, newSection: true }); }
  };
  const start = () => {
    if (!p) return;
    const host = /** @type {HTMLElement} */ (o.host());
    if (!claim('drag')) { p = null; return; }
    p.live = true; p.host = host;
    try { fab.setPointerCapture(p.id); } catch { /* gone */ }
    // the grey x where the button was (let go on it: nothing happens)
    const r = fab.getBoundingClientRect();
    const x = document.createElement('div');
    x.className = 'td-fab-cancel';
    x.setAttribute('aria-hidden', 'true');
    x.append(icon(MORE.x));
    x.style.transform = `translate(${r.left + r.width / 2 - 20}px, ${r.top + r.height / 2 - 20}px)`;
    document.body.append(x);
    p.cancel = x;
    // a project's page: "Add section" under its last section
    if (o.kind() === 'tree' && !host.dataset.grouped) {
      const d = document.createElement('div');
      d.className = 'td-drop-section';
      d.append(document.createElement('span'), Object.assign(document.createElement('span'), { textContent: 'Add section' }), document.createElement('span'));
      // (in the place of the list's own "Add section", hidden till let-go: one, not two)
      const add = /** @type {HTMLElement | null} */ (host.querySelector(':scope > .td-add-section'));
      if (add) { add.before(d); add.style.display = 'none'; } else host.append(d);
      p.divider = d; p.addBtn = add;
    }
    fab.classList.add('is-dragging');
    p.line = dropLine();
    measure();
    haptic('long');
  };
  const sc = () => scrollerOf(/** @type {HTMLElement} */ (p?.host ?? fab));
  const place = () => {
    const q = p;
    if (!q?.live) return;
    const c = /** @type {HTMLElement} */ (q.cancel).getBoundingClientRect();
    const over = Math.hypot(q.fx - (c.left + c.width / 2), q.fy - (c.top + c.height / 2)) < 36;
    const g = over ? null : nearest(/** @type {Gap[]} */ (q.gaps), q.fy);
    if (over !== q.over || g !== q.gap) haptic('tick');
    q.over = over; q.gap = g;
    /** @type {HTMLElement} */ (q.cancel).classList.toggle('is-over', over);
    q.divider?.classList.toggle('is-over', !!g?.newSection);
    q.line?.show(g?.newSection ? null : g ?? null, 0);
  };
  const scroll = edgeScroll({ el: sc, span: () => shownSpan(sc()), at: () => p?.fy ?? 0, on: () => !!p?.live, moved: () => { measure(); place(); } });
  const move = (/** @type {PointerEvent} */ e) => {
    if (!p || e.pointerId !== p.id) return;
    const dx = e.clientX - p.x0, dy = e.clientY - p.y0;
    if (!p.live) { if (Math.hypot(dx, dy) > SLOP) start(); if (!p?.live) return; }
    p.fx = e.clientX; p.fy = e.clientY;
    fab.style.transform = `translate(${dx}px, ${dy}px) scale(${GROW})`;
    place();
    scroll.poke();
  };
  const up = (/** @type {PointerEvent} */ e) => {
    if (!p || e.pointerId !== p.id) return;
    const was = p;
    p = null;
    if (!was.live) return;
    release('drag');
    scroll.stop();
    const eat = (/** @type {MouseEvent} */ c) => { c.preventDefault(); c.stopImmediatePropagation(); };
    fab.addEventListener('click', eat, { capture: true, once: true });
    setTimeout(() => fab.removeEventListener('click', eat, true), 400);
    was.cancel?.remove(); was.line?.remove(); was.divider?.remove();
    if (was.addBtn) was.addBtn.style.display = '';
    fab.classList.remove('is-dragging');
    const m = /^translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(fab.style.transform);
    const from = m ? [+m[1], +m[2]] : [0, 0];
    void glide([[fab, k => ({ transform: `translate(${from[0] * k}px, ${from[1] * k}px) scale(${1 + (GROW - 1) * k})` })]], 1, 0).done.then(() => letGo([fab]));
    const g = was.gap;
    if (e.type === 'pointercancel' || was.over || !g) return;
    const pid = o.projectId(), host = /** @type {HTMLElement} */ (was.host);
    if (g.newSection) { o.newSection(pid); return; }
    if (host.dataset.grouped && g.gkey !== undefined) {
      // a list grouped by Display: quick add starts with that group's value
      const data = ctx.data(), base = o.kind() === 'tree' ? { projectId: pid } : { projectId: pid, due: { date: dayKey() } };
      const a = addFor(host.dataset.grouped, g.gkey, { labels: data.labels }, base);
      if (a) o.add(a);
      return;
    }
    if (o.kind() === 'tree') {
      const lines = treeLines(ctx, g);
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
    scroll.stop();
    fab.removeEventListener('pointerdown', down);
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', up);
  };
}
