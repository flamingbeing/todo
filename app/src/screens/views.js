// The lists: Today (the first screen), Inbox, Upcoming, Search and a project's page, drawn from every record as last
// heard (tasks.js says what goes where; ui/row.js draws a row). Only the page on screen is drawn at once; the others
// when they come up (or are asked to draw ahead for a swipe). The task sheet, quick add, Browse, the project sheet and
// Completed load the first time they are needed (lazyModules), then in idle moments after the first screen; so do
// Filters & Labels, Search's results, a project's board, the Display sheet and Upcoming's week strip.
// Display's choices (grouping, order, what shows) are kept per list on this device (the option "display").
import { conflictSheet, refusedList, toaster, undoToast, loadState, lazyModules, glide, holdKeyboard, captured, icon, plural } from '@core/ui';
import { ICONS } from '../icons.js';
import { COLL, REFUSED, INBOX, itemText } from '../items.js';
import { projectView, todayView, isTask, placeText, projectOf, priorityOf, cleanDisplay, plainDisplay } from '../tasks.js';
import { dayKey, dayTitle, dueLine, minutesText } from '../dates.js';
import { colorHex } from '../colors.js';
import { $, sectionScreen } from '../dom.js';
import { rowList, addRow, groupHead, emptyNote } from '../ui/row.js';
import { screens } from '../shell.js';
import { modules } from '../modules.js';

// a task's link (#task=<id>, the sheet's "Copy link"): read before the tabs take the address over, opened once it is there
// (the address loses it at once, so the tabs start as on any load and a later Back does not open it again)
let linked = /^#task=([\w-]{1,64})$/.exec(location.hash)?.[1] ?? '';
let linkedProject = /^#project=([\w-]{1,64})$/.exec(location.hash)?.[1] ?? '';
if (linked || linkedProject) history.replaceState(history.state, '', location.pathname + location.search);

/** @typedef {import('../items.js').Task} Task */
/** @typedef {import('../items.js').Item} Item */
/** @typedef {import('../items.js').Data} Data */
/**
 * The tools slot (modules.js "listFilter"; the search recipe fills it): draws into the slot and narrows the tasks.
 * @typedef {(o: { slot: HTMLElement, redraw: () => void }) => { feed: (items: Item[]) => void, pick: (items: Item[]) => Item[] | null,
 *   passage?: (item: Item) => HTMLElement | null }} ListFilter
 */
/**
 * The tasks' files slot (modules.js "itemFiles"; the files recipe fills it).
 * @typedef {object} ItemFiles
 * @property {(byItem: Map<string, unknown[]>) => void} feed
 * @property {(itemId: string) => unknown[]} of
 * @property {(item: Item) => HTMLElement | null} thumbs
 * @property {(slot: HTMLElement, editing: () => Item | null) => () => void} mount
 * @typedef {(o: { app: any, toast: (message: string) => unknown }) => ItemFiles} ItemFilesSlot
 */
/**
 * What the lazy screens get from the lists (one object, made once).
 * @typedef {object} Ctx
 * @property {import('../items.js').ItemsApp} app
 * @property {() => Data} data
 * @property {() => boolean} canWrite
 * @property {(message: string, o?: { action?: { label: string, run: () => void } }) => unknown} toast
 * @property {{ show: (message: string, undo: () => unknown) => void }} undo
 * @property {(t: Task) => void} openTask
 * @property {(id: string) => void} openProject
 * @property {(o?: AddContext) => void} openQuickAdd
 * @property {(o?: { project?: import('../items.js').Project, parentId?: string }) => void} openProjectSheet
 * @property {(t: Task, row?: HTMLElement | null) => void} complete
 * @property {(p: import('../items.js').Project) => Promise<boolean>} removeProject  asks first; true once asked and said yes
 * @property {(o?: Partial<import('../ui/row.js').RowContext>) => import('../ui/row.js').RowContext} rows
 * @property {() => import('../items.js').User | undefined} user
 * @property {ItemFiles | undefined} files
 * @property {(kind: 'labels' | 'filters', id: string) => void} openPlace  a label's or a filter's page
 * @property {() => string} top  the screen on top
 * @property {(view: string) => import('../tasks.js').Display} display  a list's Display choices
 * @property {() => void} redraw
 * @property {{ menu: (s: import('../items.js').Section, b: HTMLElement) => void, field: (value: string, s: import('../items.js').Section | null, pid: string) => HTMLElement,
 *   naming: () => { projectId: string, sectionId: string, after?: string } | null, add: (pid: string) => void }} sections  a project's sections, named in place
 */
/** @typedef {{ projectId?: string, sectionId?: string | null, parentId?: string | null, due?: import('../dates.js').Due | null, deadline?: string | null, order?: number, duration?: number, priority?: number, labels?: string[] }} AddContext */

/** @param {import('../items.js').ItemsApp} app */
export function views(app) {
  let canWrite = false;
  /** @type {Data} */
  let data = { tasks: [], projects: [], sections: [], labels: [], filters: [] };
  /** @type {import('../items.js').User | undefined} */
  let user;
  let changed = new Set(), held = false;
  let drawnDay = dayKey();
  /** the project the project page shows */
  let projectId = INBOX;
  /** the label or filter the place page shows @type {{ kind: 'labels' | 'filters', id: string }} */
  let place = { kind: 'labels', id: '' };
  /** pages drawn since the data last changed */
  const fresh = new Set();
  const toasts = toaster($('toasts'), { bottom: 'calc(max(var(--ui-tabbar-room, 0px), env(safe-area-inset-bottom, 0px)) + 12px)' });
  const toast = toasts.show;
  const undo = undoToast(toasts);
  const filter = modules.listFilter?.({ slot: $('list-tools'), redraw: () => redraw() });
  const files = modules.itemFiles?.({ app, toast });
  $('today-state').replaceChildren();
  const loading = loadState($('today-state'));
  if (!$('today').children.length) loading.loading();
  conflictSheet($('conflict-sheet'), { sync: app.sync, text: itemText });
  refusedList($('refused-list'), { sync: app.sync, kind: COLL, text: itemText });

  const lazy = lazyModules({
    sheet: () => import('./task-sheet.js'),
    add: () => import('./quick-add.js'),
    browse: () => import('./browse.js'),
    projectSheet: () => import('./project-sheet.js'),
    completed: () => import('./completed.js'),
    gestures: () => import('../ui/row-gestures.js'),
    filters: () => import('./filters.js'),
    named: () => import('./named-sheet.js'),
    search: () => import('./search.js'),
    board: () => import('./board.js'),
    display: () => import('./display.js'),
    strip: () => import('../ui/week-strip.js'),
    select: () => import('./select.js'),
    menus: () => import('./page-menu.js'),
    calendar: () => import('./calendar.js'),
    marks: () => import('../markdown.js'),
  });
  /** a list's Display choices on this device @param {string} view */
  const disp = view => cleanDisplay(/** @type {any} */ (app.settings.get('display'))?.[view], view);
  app.settings.watch('display', () => redraw());
  for (const k of ['weekStart', 'dailyGoal', 'weeklyGoal']) app.settings.watch(k, () => redraw());

  /** @type {Ctx} */
  const ctx = {
    app, data: () => data, canWrite: () => canWrite, toast, undo, files, user: () => user,
    openTask: t => { void lazy.withMod('sheet', m => m.openTask(ctx, t)); },
    openQuickAdd: o => { if (canWrite) void lazy.withMod('add', m => m.openQuickAdd(ctx, o ?? addContext())); },
    openProjectSheet: o => { if (canWrite) void lazy.withMod('projectSheet', m => m.openProjectSheet(ctx, o)); },
    openProject: id => {
      projectId = id;
      paintProject();
      screens()?.push('#project-page');
    },
    complete: (t, row) => complete(t, row),
    removeProject: p => lazy.need('menus').then(m => m.removeProject(ctx, p, () => { if (top === 'project-page' && projectId === p.id) screens()?.pop(); })),
    rows: o => rowCtx(o ?? {}),
    openPlace: (kind, id) => { place = { kind, id }; fresh.delete('place-page'); paint('place-page'); if (top !== 'place-page') screens()?.push('#place-page'); },
    top: () => top, display: disp, redraw: () => redraw(),
    sections: { menu: (s, b) => sectionMenu(s, b), field: (v, s, pid) => nameField(v, s, pid), naming: () => naming, add: pid => newSection(pid) },
  };

  /** @param {Partial<import('../ui/row.js').RowContext>} o @returns {import('../ui/row.js').RowContext} */
  const rowCtx = o => ({ today: dayKey(), data, canWrite, changed, onOpen: ctx.openTask, onComplete: (t, row) => (t.done ? void app.untick([t]).then(r => r && toast(REFUSED)) : complete(t, row)),
    onFold: t => { void app.editTask(t, { collapsed: !t.collapsed }).then(r => r && toast(REFUSED)); },
    marks: (span, text) => { void lazy.withMod('marks', m => m.showMarks(span, text, { links: false })); }, ...o });

  /** done: the box fills, the row fades out, then the save and the undo toast @param {Task} t @param {HTMLElement | null} [row] */
  // A repeating task stays open and moves to its next date (recur.js, loaded then); past its last one it is done.
  const complete = async (t, row) => {
    if (!canWrite) return;
    let next = /** @type {string | null} */ (null);
    if (t.due?.rrule) {
      try {
        const { nextDay, dateLibs } = await import('../recur.js'), today = dayKey();
        next = nextDay(t.due, { done: today, today }, (await dateLibs()).RRule);
      } catch { /* offline before the library was kept: done for good is wrong, so leave it */ toast('Could not work out the next date'); redraw(); return; }
    }
    if (row) {
      await new Promise(r => setTimeout(r, 150));
      if (!next) await glide([[row, x => ({ opacity: String(1 - x), transform: `translateX(${x * 12}px)` })]], 0, 1).done;
    }
    const { refused, ticked, moved, reopened } = await app.complete(t, { next });
    if (refused) { toast(REFUSED); redraw(); return; }
    if (moved) undo.show('Task completed', async () => { if (await app.unmove(t, moved, reopened)) toast(REFUSED); });
    else undo.show('Task completed', async () => { if (await app.untick(ticked)) toast(REFUSED); });
  };

  // ---- where the person is: the tab page, and the screen pushed over it
  const host = /** @type {HTMLElement} */ (document.querySelector('.ui-screens'));
  let tabPage = 'today-page';
  /** @type {string} */
  let top = 'today-page';
  host.addEventListener('ui-tab', e => {
    tabPage = /** @type {CustomEvent} */ (e).detail.page.id; top = tabPage; onScreen();
    if (top === 'search-page') /** @type {HTMLInputElement} */ ($('search-text')).focus({ preventScroll: true });
  });
  host.addEventListener('ui-screen', e => { top = /** @type {CustomEvent} */ (e).detail.top.id; onScreen(); });
  for (const id of ['inbox-page', 'upcoming-page', 'search-page', 'browse-page', 'today-page']) $(id).addEventListener('draw-ahead', () => paint(id));

  /** what a new task starts with on the page shown @returns {AddContext} */
  const addContext = () => top === 'project-page' ? { projectId }
    : top === 'today-page' ? { projectId: INBOX, due: { date: dayKey() } }
    : top === 'upcoming-page' ? { projectId: INBOX, due: { date: upcomingDay() } } : { projectId: INBOX };
  /** Upcoming's day in sight: the week strip's pick, which follows the scroll (today when none, or a day gone by) */
  const upcomingDay = () => {
    const today = dayKey(), pick = /** @type {HTMLElement | null} */ ($('upcoming-strip').querySelector('[data-day][aria-pressed="true"]'))?.dataset.day;
    return pick && pick > today ? pick : today;
  };
  const fab = $('fab'), more = $('more-btn');
  fab.addEventListener('click', () => { if (canWrite) { const hold = holdKeyboard(); void lazy.withMod('add', m => m.openQuickAdd(ctx, addContext(), hold)); } });
  more.addEventListener('click', () => pageMenu());
  const lists = ['inbox-page', 'today-page', 'upcoming-page', 'project-page'];
  /** the bar's second line under the screen's name ("3 tasks": the open ones the list holds; nothing when none or not a list) */
  const subtitle = () => {
    const bar = document.querySelector('.ui-bar-title');
    if (!bar) return;
    const today = dayKey(), open = data.tasks.filter(t => isTask(t) && !t.done);
    const n = top === 'inbox-page' ? open.filter(t => projectOf(t) === INBOX).length
      : top === 'today-page' ? open.filter(t => t.due?.date && t.due.date <= today).length
      : top === 'project-page' ? open.filter(t => projectOf(t) === projectId).length : 0;
    if (n > 0) /** @type {HTMLElement} */ (bar).dataset.sub = plural(n, 'task'); else delete /** @type {HTMLElement} */ (bar).dataset.sub;
  };
  const display = $('display-btn');
  display.addEventListener('click', () => {
    const own = top === 'project-page' && projectId !== INBOX ? data.projects.find(x => x.id === projectId) ?? null : null;
    void lazy.withMod('display', d => d.openDisplay(ctx, viewOf(), own));
  });
  const onScreen = () => {
    fab.hidden = !canWrite || !lists.includes(top);
    more.hidden = !canWrite || ![...lists, 'place-page'].includes(top);
    display.hidden = more.hidden;
    $('section-done').hidden = top !== 'section-page';
    subtitle();
    $('browse-top').hidden = top !== 'browse-page';
    paint(top);
  };

  // ---- the page's "…": Display, then (a project) Edit project, Add section, Delete project (the Inbox: Add section),
  // (a label or filter) Edit and Delete; Select tasks on every list
  /** the list on top, as Display keeps it */
  const viewOf = () => top === 'place-page' ? `${place.kind}:${place.id}` : top === 'project-page' && projectId !== INBOX ? `project:${projectId}` : top.slice(0, -5);
  const pageMenu = () => {
    const tree = top === 'inbox-page' || top === 'project-page';
    void lazy.withMod('menus', m => m.pageMenu(ctx, more, { pid: top === 'project-page' ? projectId : INBOX, tree, view: viewOf(), place: top === 'place-page' ? place : null,
      host: top.slice(0, -5), newSection, pop: () => screens()?.pop(), select: h => { void lazy.withMod('gestures', g => g.select(ctx, h)); },
      display: (v, p) => { void lazy.withMod('display', d => d.openDisplay(ctx, v, p)); }, named: run => { void lazy.withMod('named', run); } }));
  };

  // ---- sections: the inline name field (a new section at the end, or a rename in place)
  /** (after, order: a new section after that one, at that order; else at the end)
   * @type {{ projectId: string, sectionId: string, after?: string, order?: number } | null} */
  let naming = null;
  /** @param {string} pid @param {string} [after] @param {number} [order] */
  const newSection = (pid, after, order) => {
    if (after === undefined && order === undefined) { openSectionPage(pid); return; }
    naming = { projectId: pid, sectionId: '', after, order }; fresh.clear(); paint(top); focusNaming();
  };
  // a new section at the end of a list: its own screen (a name and the tick), as the page menu's Add section opens it
  const sectionName = /** @type {HTMLInputElement} */ ($('section-name')), sectionDone = /** @type {HTMLButtonElement} */ ($('section-done'));
  let sectionFor = INBOX;
  /** @param {string} pid */
  const openSectionPage = pid => {
    sectionFor = pid; sectionName.value = ''; sectionDone.disabled = true;
    screens()?.push('#section-page');
    setTimeout(() => sectionName.focus(), 120);
  };
  const saveSection = async () => {
    const name = sectionName.value.trim();
    if (!name || !canWrite) return;
    sectionDone.disabled = true;
    const r = (await app.addSection(sectionFor, name)).refused;
    if (r) toast(REFUSED);
    fresh.clear(); screens()?.pop();
  };
  sectionName.addEventListener('input', () => { sectionDone.disabled = !sectionName.value.trim(); });
  $('section-form').addEventListener('submit', e => { e.preventDefault(); void saveSection(); });
  sectionDone.addEventListener('click', () => { void saveSection(); });
  const focusNaming = () => requestAnimationFrame(() => /** @type {HTMLInputElement | null} */ (document.querySelector(`#${top} .td-name-field input`))?.focus());
  // (the page is drawn again on every change, synced ones too: the open field is the same element each time, so what
  // was typed stays; the browser blurs a focused element it takes out, so that blur is not the person leaving it)
  /** @type {{ for: object | null, form: HTMLFormElement, moving: boolean } | null} */
  let shown = null;
  /** @param {string} value @param {import('../items.js').Section | null} section @param {string} pid */
  const nameField = (value, section, pid) => {
    if (shown && naming && shown.for === naming) {
      const was = shown, input = /** @type {HTMLInputElement} */ (was.form.elements[0]);
      was.moving = document.activeElement === input;
      queueMicrotask(() => { was.moving = false; });
      return was.form;
    }
    const form = document.createElement('form'), input = document.createElement('input');
    const me = shown = { for: naming, form, moving: false };
    form.className = 'td-name-field';
    input.value = value; input.maxLength = 120; input.placeholder = 'Name this section';
    input.setAttribute('aria-label', section ? `New name for ${section.name}` : 'Name of the new section');
    let done = false;
    const at = naming?.order;
    const finish = async (/** @type {boolean} */ save) => {
      if (done) return;
      done = true; naming = null;
      if (shown === me) shown = null;
      const name = input.value.trim();
      if (save && name) {
        const r = section ? await app.renameSection(section, name) : (await app.addSection(pid, name, at)).refused;
        if (r) toast(REFUSED);
      }
      fresh.clear(); paint(top);
    };
    form.addEventListener('submit', e => { e.preventDefault(); void finish(true); });
    input.addEventListener('blur', () => {
      if (!me.moving) { void finish(true); return; }
      // (moved by a redraw: focus it again where the caret was)
      const [a, b] = [input.selectionStart, input.selectionEnd];
      queueMicrotask(() => { if (input.isConnected && !done) { input.focus({ preventScroll: true }); input.setSelectionRange(a, b); } });
    });
    input.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); void finish(false); } });
    form.append(input);
    return form;
  };
  /** @param {import('../items.js').Section} s @param {HTMLElement} b */
  const sectionMenu = (s, b) => { void lazy.withMod('menus', m => m.sectionMenu(ctx, s, b, x => { naming = { projectId: x.projectId, sectionId: x.id }; fresh.clear(); paint(top); focusNaming(); }, newSection)); };

  /** whether a list is in its calendar layout (Display) @param {string} view */
  const inCal = view => disp(view).layout === 'calendar';
  /** a list in its calendar layout (calendar.js draws it) @param {string} view @param {HTMLElement} into @param {HTMLElement | null} empty @param {Task[]} tasks @param {AddContext} start */
  const drawCal = (view, into, empty, tasks, start) => {
    into.classList.remove('td-board'); into.removeAttribute('data-swipe-own'); into.dataset.sorted = 'cal'; delete into.dataset.grouped;
    void lazy.withMod('calendar', m => m.drawCalendar(ctx, { view, into, empty, tasks, d: disp(view), start, resched }));
  };
  /** a list as a board of Display's groups (board.js) @param {HTMLElement} host @param {HTMLElement | null} below @param {Task[]} tasks
   * @param {import('../tasks.js').Display} d @param {string} group @param {AddContext} base @param {string} title */
  const groupBoard = (host, below, tasks, d, group, base, title) => { void lazy.withMod('board', m => m.drawGroupBoard(ctx, { host, below, tasks, d, group, base, title })); };

  /** a project's page (the Inbox too) into host @param {HTMLElement} into @param {string} pid @param {HTMLElement} empty */
  const projectList = (into, pid, empty) => {
    const view = pid === INBOX ? 'inbox' : `project:${pid}`;
    if (inCal(view)) { drawCal(view, into, empty, filtered().filter(t => projectOf(t) === pid), { projectId: pid }); return; }
    const p = data.projects.find(x => x.id === pid), d = disp(view), today = dayKey();
    const board = d.layout === 'board' || pid !== INBOX && p?.view === 'board';
    into.classList.toggle('td-board', board);
    into.toggleAttribute('data-swipe-own', board);
    into.toggleAttribute('data-sorted', d.sort !== 'manual');
    if (board) { void lazy.withMod('board', m => m.drawBoard(ctx, pid, into, empty, d)); return; }
    if (d.group !== 'none') { groups(into, empty, filtered().filter(t => projectOf(t) === pid), d, rowCtx({ place: d.group === 'project' }), { projectId: pid }, ['Nothing here yet', 'Tap + to add a task']); return; }
    delete into.dataset.grouped;
    // (a sort or a filter: its maths comes with board.js, the page is drawn again once it has)
    const plain = plainDisplay(d, 'inbox'), m = lazy.loaded('board');
    if (!plain && !m) { void lazy.need('board').then(() => projectList(into, pid, empty)); return; }
    const v = projectView(filtered(), data.sections, pid, plain ? undefined : m?.arranged(d, data.labels, today)), c = rowCtx({});
    const parts = [];
    if (v.loose.length) parts.push(rowList(v.loose, c, 'Tasks'));
    for (const { section: s, lines } of v.sections) {
      const sec = document.createElement('section');
      sec.className = 'td-group td-section';
      sec.dataset.id = s.id;
      const head = naming?.sectionId === s.id ? nameField(s.name, s, pid)
        : groupHead(s.name, { collapsed: !!s.collapsed, label: s.name, onFold: canWrite ? () => { void app.foldSection(s, !s.collapsed); } : undefined,
          onMore: canWrite ? b => sectionMenu(s, b) : undefined });
      sec.append(head);
      if (!s.collapsed) {
        if (lines.length) sec.append(rowList(lines, c, s.name));
        if (canWrite) sec.append(addRow('Add task', () => ctx.openQuickAdd({ projectId: pid, sectionId: s.id })));
      }
      parts.push(sec);
      if (naming && !naming.sectionId && naming.after === s.id) parts.push(nameField('', null, pid));
    }
    if (naming && !naming.sectionId && !naming.after && naming.projectId === pid) parts.push(nameField('', null, pid));
    into.replaceChildren(...parts);
    const none = !v.loose.length && v.sections.every(x => !x.lines.length);
    empty.replaceChildren(...(none && !v.sections.length && canWrite ? [pid === INBOX ? emptyNote('Nothing waiting', 'Jot things down as they come to mind, then sort them when you have a moment.', 'inbox') : emptyNote('Nothing here yet', 'Tap + to add a task')] : []));
  };

  /** a flat list in Display's groups (board.js draws them); none: the empty note's words when no task shows
   * @param {HTMLElement} into @param {HTMLElement} empty @param {Task[]} tasks @param {import('../tasks.js').Display} d
   * @param {import('../ui/row.js').RowContext} c @param {AddContext} base @param {[string, string, ('inbox' | 'day')?]} none */
  const groups = (into, empty, tasks, d, c, base, none) => {
    into.dataset.grouped = d.group;
    void lazy.withMod('board', m => { empty.replaceChildren(...(!m.drawGroups(ctx, { into, tasks, d, c, base, resched }) && canWrite ? [emptyNote(none[0], none[1], none[2])] : [])); });
  };
  /** Overdue's Reschedule: every task in it to one day @param {HTMLElement} sec @param {Task[]} tasks */
  const resched = (sec, tasks) => {
    if (!canWrite) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'td-text-btn td-resched'; b.textContent = 'Reschedule';
    b.addEventListener('click', () => { void lazy.withMod('select', m => m.rescheduleTasks(ctx, tasks)); });
    sec.querySelector('.td-group-head')?.append(b);
  };

  /** the tasks the search recipe's filter leaves (all of them without it) */
  const filtered = () => /** @type {Task[]} */ (filter?.pick(data.tasks) ?? data.tasks);

  const paintToday = () => {
    const today = drawnDay = dayKey(), d = disp('today');
    // under the title: how many tasks are open for today (overdue too) and, when some have one, their planned time
    const open = filtered().filter(t => isTask(t) && !t.done && !!t.due?.date && t.due.date <= today), mins = open.reduce((n, t) => n + (t.duration || 0), 0);
    $('today-sum').replaceChildren(...(open.length ? [icon(ICONS.circleCheck), [plural(open.length, 'task'), mins && minutesText(mins)].filter(Boolean).join(' · ')] : []));
    if (inCal('today')) { shownToday = []; drawCal('today', $('today'), $('today-empty'), filtered().filter(t => !!t.due?.date), { projectId: INBOX }); return; }
    const host = $('today'), base = { projectId: INBOX, due: { date: today } }, ts = filtered().filter(t => { const k = t.due?.date; return !!k && (t.done ? k === today : k <= today); });
    host.toggleAttribute('data-sorted', d.sort !== 'manual');
    if (d.layout === 'board') { groupBoard(host, $('today-empty'), ts, d, d.group, base, 'Today'); return; }
    host.classList.remove('td-board'); host.removeAttribute('data-swipe-own');
    if (!plainDisplay(d, 'today')) { groups(host, $('today-empty'), ts, d, rowCtx({ place: true }), base, ['A clear day', 'Tasks due today collect here. Tap + to add one.', 'day']); return; }
    delete host.dataset.grouped;
    const v = todayView(filtered(), today);
    const parts = [];
    if (v.overdue.length) {
      const g = document.createElement('section'); g.className = 'td-group';
      g.append(groupHead('Overdue'), rowList(v.overdue, rowCtx({ place: true }), 'Overdue'));
      resched(g, v.overdue.map(l => l.task));
      parts.push(g);
    }
    if (v.today.length || v.overdue.length) {
      const g = document.createElement('section'); g.className = 'td-group';
      g.dataset.day = today;
      g.append(groupHead(dayTitle(today, today)), rowList(v.today, rowCtx({ place: true, own: today }), 'Today'));
      parts.push(g);
    }
    host.replaceChildren(...parts);
    $('today-empty').replaceChildren(...(!v.today.length && !v.overdue.length && canWrite ? [emptyNote('A clear day', 'Tasks due today collect here. Tap + to add one.', 'day')] : []));
    shownToday = [...v.overdue, ...v.today].map(l => l.task);
  };
  /** @type {Task[]} */
  let shownToday = [];

  // (by day from today, as a list's Agenda: week-strip.js)
  const paintUpcoming = () => {
    const d = disp('upcoming'), cal = $('upcoming-strip').hidden = inCal('upcoming') || d.layout === 'board', ts = filtered().filter(t => !!t.due?.date);
    // (a board: a column a day)
    if (cal) { if (d.layout === 'board') groupBoard($('upcoming'), null, ts.filter(t => !t.done), d, 'date', { projectId: INBOX }, ''); else drawCal('upcoming', $('upcoming'), null, ts, { projectId: INBOX }); return; }
    void lazy.withMod('strip', m => m.drawDays(ctx, { list: $('upcoming'), strip: $('upcoming-strip'), tasks: filtered(), d, place: true, projectId: INBOX, resched }));
  };

  const paintSearch = () => { void lazy.withMod('search', m => m.drawSearch(ctx, /** @type {HTMLInputElement} */ ($('search-text')), $('search'))); };
  $('search-text').addEventListener('input', () => { fresh.delete('search-page'); paint('search-page'); });

  const paintProject = () => {
    const p = data.projects.find(x => x.id === projectId);
    $('project-title').textContent = projectId === INBOX ? 'Inbox' : p?.name ?? 'Project';
    const bar = document.querySelector('.ui-bar-title');
    if (top === 'project-page' && bar) bar.textContent = $('project-title').textContent;
    $('project-page').style.setProperty('--td-project', colorHex(p?.color));
    projectList($('project'), projectId, $('project-empty'));
  };

  // (a sort or a grouping not the list's own: a line over the list says so, with Reset; display.js)
  /** @param {string} view @param {string} host */
  const applied = (view, host) => {
    const d = disp(view), h = $(host);
    if (d.sort !== 'manual' || d.group !== cleanDisplay({}, view).group) void lazy.withMod('display', m => m.appliedLine(ctx, view, h));
    else h.parentElement?.querySelector(`:scope > .td-applied[data-for="${host}"]`)?.remove();
  };
  /** draws a page if the data changed since it was last drawn @param {string} id */
  const paint = id => {
    if (fresh.has(id)) return;
    fresh.add(id);
    if (id === 'today-page' || id === 'inbox-page' || id === 'upcoming-page') applied(id.slice(0, -5), id.slice(0, -5));
    else if (id === 'project-page') applied(projectId === INBOX ? 'inbox' : `project:${projectId}`, 'project');
    if (id === 'today-page') paintToday();
    else if (id === 'inbox-page') projectList($('inbox'), INBOX, $('inbox-empty'));
    else if (id === 'upcoming-page') paintUpcoming();
    else if (id === 'search-page') paintSearch();
    else if (id === 'project-page') paintProject();
    else if (id === 'browse-page') void lazy.withMod('browse', m => m.drawBrowse(ctx, $('browse')));
    else if (id === 'filters-page') void lazy.withMod('filters', m => m.drawFiltersLabels(ctx, $('filters')));
    else if (id === 'place-page') {
      const v = `${place.kind}:${place.id}`;
      void lazy.withMod('filters', m => m.drawPlace(ctx, place, $('place'), $('place-empty'), disp(v), inCal(v) ? ts => drawCal(v, $('place'), $('place-empty'), ts, { projectId: INBOX }) : undefined));
    }
    else if (id === 'completed-page') void lazy.withMod('completed', m => m.drawCompleted(ctx, $('completed'), $('completed-empty')));
    else if (id === 'productivity-page') void lazy.withMod('completed', m => m.drawProductivity(ctx, $('productivity')));
    else fresh.delete(id);
  };
  const redraw = () => {
    fresh.clear();
    subtitle();
    paint('today-page');
    if (top !== 'today-page') paint(top);
    if (tabPage !== top) paint(tabPage);
    for (const s of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.ui-screen.is-beside'))) paint(s.id);
    void lazy.loaded('sheet')?.redraw(ctx);
    changed = new Set();
  };

  // the day number on the Today tab, and a new day after midnight
  const dayNumber = () => { for (const n of document.querySelectorAll('[data-today-num]')) n.textContent = String(new Date().getDate()); };
  dayNumber();
  const newDay = () => { if (dayKey() !== drawnDay) { dayNumber(); redraw(); } };
  document.addEventListener('visibilitychange', newDay);
  setInterval(newDay, 60_000);

  let warmed = false;
  // (once signed in and the task is there: the copy kept from before sign-in may draw it while the sign-in shows)
  const openLinked = () => {
    const want = linked && user && data.tasks.find(t => t.id === linked);
    if (want) { linked = ''; ctx.openTask(want); }
    else if (linkedProject && user && data.projects.length) {
      const id = linkedProject; linkedProject = '';
      const goal = id === INBOX ? document.getElementById('inbox-page') : null;
      if (goal) document.querySelector('.ui-tabbar [data-tab-id="inbox"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      else if (data.projects.some(p => p.id === id)) ctx.openProject(id);
    }
  };
  const screen = sectionScreen('list-view', s => {
    const could = canWrite;
    canWrite = s.role === 'admin' || s.role === 'member';
    user = s.user;
    if (canWrite !== could) redraw();
    onScreen();
    openLinked();
  });
  return {
    ...screen,
    hide() { screen.hide(); fab.hidden = true; more.hidden = true; },
    /** @param {Data} next @param {Set<string>} ids  tasks changed elsewhere since the last draw */
    draw(next, ids) {
      data = next; changed = new Set([...changed, ...ids]);
      filter?.feed(data.tasks);
      loading.done();
      // (not while a finger holds, drags or swipes a row: drawn again, the row would leave it; once it is let go)
      const now = () => { held = captured() === 'drag' || !!document.querySelector('[data-holding], .td-row.is-swiping'); if (held) setTimeout(now, 150); else redraw(); };
      if (!held) now();
      openLinked();
      // the quick add and the task sheet straight after the first draw (the main ways in, and may be used offline), then the rest
      if (!warmed) {
        warmed = true;
        lazy.need('add').then(() => lazy.need('sheet')).then(() => { if (window.starter) window.starter.warm = true; }).catch(() => {});   // (warm: for the tests)
        // the rows' swipes, holds and drags, and the + button's drag (each list host is wired once)
        lazy.need('gestures').then(m => m.wire(ctx, { hosts: { today: 'days', upcoming: 'days', inbox: 'tree', project: 'tree', search: null, place: null },
          top: () => (lists.includes(top) ? top.slice(0, -5) : ''), projectId: () => projectId, add: ctx.openQuickAdd, newSection, view: viewOf })).catch(() => {});
        lazy.warmUp();
      }
    },
    /** @returns {import('../hint.js').Row[]} what Today shows (the next start paints it first) */
    shown: () => shownToday.map(t => {
      const line = dueLine(t.due, drawnDay, { own: drawnDay }), pid = projectOf(t);
      return { id: t.id, title: t.title, priority: priorityOf(t), date: line?.text, tone: line?.tone, place: placeText(t, data.projects, data.sections),
        color: pid === INBOX ? undefined : colorHex(data.projects.find(p => p.id === pid)?.color) };
    }),
    /** @param {Map<string, unknown[]>} by */
    drawFiles(by) { files?.feed(by); redraw(); },
    ctx,
  };
}
