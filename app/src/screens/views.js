// The lists: Today (the first screen), Inbox, Upcoming, Search and a project's page, drawn from every record as last
// heard (tasks.js says what goes where; ui/row.js draws a row). Only the page on screen is drawn at once; the others
// when they come up (or are asked to draw ahead for a swipe). The task sheet, quick add, Browse, the project sheet and
// Completed load the first time they are needed (lazyModules), then in idle moments after the first screen.
import { conflictSheet, refusedList, toaster, undoToast, loadState, confirmModal, lazyModules, glide, plural } from '@core/ui';
import { COLL, REFUSED, INBOX, itemText } from '../items.js';
import { projectView, todayView, upcomingView, isTask, placeText, projectCascade, projectOf, priorityOf } from '../tasks.js';
import { dayKey, dayTitle, dueLine } from '../dates.js';
import { colorHex } from '../colors.js';
import { $, sectionScreen } from '../dom.js';
import { rowList, addRow, groupHead, emptyNote } from '../ui/row.js';
import { openMenu } from '../ui/menu.js';
import { ICONS } from '../icons.js';
import { screens } from '../shell.js';
import { modules } from '../modules.js';

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
 * @property {(message: string) => unknown} toast
 * @property {{ show: (message: string, undo: () => unknown) => void }} undo
 * @property {(t: Task) => void} openTask
 * @property {(id: string) => void} openProject
 * @property {(o?: AddContext) => void} openQuickAdd
 * @property {(o?: { project?: import('../items.js').Project, parentId?: string }) => void} openProjectSheet
 * @property {(t: Task, row?: HTMLElement | null) => void} complete
 * @property {(p: import('../items.js').Project) => Promise<boolean>} removeProject  asks first; true once asked and said yes
 * @property {() => import('../ui/row.js').RowContext} rows
 * @property {() => import('../items.js').User | undefined} user
 * @property {ItemFiles | undefined} files
 */
/** @typedef {{ projectId?: string, sectionId?: string | null, parentId?: string | null, due?: import('../dates.js').Due | null }} AddContext */

const UPCOMING_STEP = 28;

/** @param {import('../items.js').ItemsApp} app */
export function views(app) {
  let canWrite = false;
  /** @type {Data} */
  let data = { tasks: [], projects: [], sections: [], labels: [], filters: [] };
  /** @type {import('../items.js').User | undefined} */
  let user;
  let changed = new Set();
  let drawnDay = dayKey();
  let upcomingDays = UPCOMING_STEP;
  /** the project the project page shows */
  let projectId = INBOX;
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
    add: () => import('./add-sheet.js'),
    browse: () => import('./browse.js'),
    projectSheet: () => import('./project-sheet.js'),
    completed: () => import('./completed.js'),
  });

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
    removeProject: p => removeProject(p),
    rows: () => rowCtx({}),
  };

  /** @param {Partial<import('../ui/row.js').RowContext>} o @returns {import('../ui/row.js').RowContext} */
  const rowCtx = o => ({ today: dayKey(), data, canWrite, changed, onOpen: ctx.openTask, onComplete: (t, row) => complete(t, row),
    onFold: t => { void app.editTask(t, { collapsed: !t.collapsed }).then(r => r && toast(REFUSED)); }, ...o });

  /** done: the box fills, the row fades out, then the save and the undo toast @param {Task} t @param {HTMLElement | null} [row] */
  const complete = async (t, row) => {
    if (!canWrite) return;
    if (row) {
      await new Promise(r => setTimeout(r, 150));
      const g = glide([[row, x => ({ opacity: String(1 - x), transform: `translateX(${x * 12}px)` })]], 0, 1);
      await g.done;
    }
    const { refused, ticked } = await app.complete(t);
    if (refused) { toast(REFUSED); redraw(); return; }
    undo.show('Task completed', async () => { if (await app.untick(ticked)) toast(REFUSED); });
  };

  // ---- where the person is: the tab page, and the screen pushed over it
  const host = /** @type {HTMLElement} */ (document.querySelector('.ui-screens'));
  let tabPage = 'today-page';
  /** @type {string} */
  let top = 'today-page';
  host.addEventListener('ui-tab', e => { tabPage = /** @type {CustomEvent} */ (e).detail.page.id; top = tabPage; onScreen(); });
  host.addEventListener('ui-screen', e => { top = /** @type {CustomEvent} */ (e).detail.top.id; onScreen(); });
  for (const id of ['inbox-page', 'upcoming-page', 'search-page', 'browse-page', 'today-page']) $(id).addEventListener('draw-ahead', () => paint(id));

  /** what a new task starts with on the page shown @returns {AddContext} */
  const addContext = () => top === 'project-page' ? { projectId }
    : top === 'today-page' || top === 'upcoming-page' ? { projectId: INBOX, due: { date: dayKey() } } : { projectId: INBOX };
  const fab = $('fab'), more = $('more-btn');
  fab.addEventListener('click', () => ctx.openQuickAdd());
  more.addEventListener('click', () => pageMenu());
  const onScreen = () => {
    const lists = ['inbox-page', 'today-page', 'upcoming-page', 'project-page'];
    fab.hidden = !canWrite || !lists.includes(top);
    more.hidden = !canWrite || !(top === 'inbox-page' || top === 'project-page');
    paint(top);
  };

  // ---- the page's "…": Edit project, Add section, Delete project (the Inbox: Add section only)
  const pageMenu = () => {
    const pid = top === 'project-page' ? projectId : INBOX, p = data.projects.find(x => x.id === pid);
    openMenu(more, [
      ...(pid !== INBOX && p ? [{ label: 'Edit project', icon: ICONS.pencil, run: () => ctx.openProjectSheet({ project: p }) }] : []),
      { label: 'Add section', icon: ICONS.circlePlus, run: () => newSection(pid) },
      ...(pid !== INBOX && p ? [null, { label: 'Delete project', icon: ICONS.trash2, danger: true, run: () => { void removeProject(p); } }] : []),
    ], { label: 'Project' });
  };
  /** @param {import('../items.js').Project} p */
  const removeProject = async p => {
    const all = projectCascade(p.id, data.projects, data.sections, data.tasks);
    const n = all.tasks.filter(t => isTask(t) && !t.done).length, subs = all.projects.length - 1;
    const what = [n ? plural(n, 'task') : '', subs ? plural(subs, 'sub-project') : ''].filter(Boolean).join(' and ');
    if (!await confirmModal(`Delete “${p.name}”${what ? ` with its ${what}` : ''}?`, { title: 'Delete project', danger: true, yes: 'Delete' })) return false;
    if (top === 'project-page' && projectId === p.id) screens()?.pop();
    if (await app.removeProject(p)) toast(REFUSED);
    return true;
  };

  // ---- sections: the inline name field (a new section at the end, or a rename in place)
  /** @type {{ projectId: string, sectionId: string } | null} */
  let naming = null;
  /** @param {string} pid */
  const newSection = pid => { naming = { projectId: pid, sectionId: '' }; fresh.clear(); paint(top); focusNaming(); };
  const focusNaming = () => requestAnimationFrame(() => /** @type {HTMLInputElement | null} */ (document.querySelector(`#${top} .td-name-field input`))?.focus());
  /** @param {string} value @param {import('../items.js').Section | null} section @param {string} pid */
  const nameField = (value, section, pid) => {
    const form = document.createElement('form'), input = document.createElement('input');
    form.className = 'td-name-field';
    input.value = value; input.maxLength = 120; input.placeholder = 'Name this section';
    input.setAttribute('aria-label', section ? `New name for ${section.name}` : 'Name of the new section');
    let done = false;
    const finish = async (/** @type {boolean} */ save) => {
      if (done) return;
      done = true; naming = null;
      const name = input.value.trim();
      if (save && name) {
        const r = section ? await app.renameSection(section, name) : (await app.addSection(pid, name)).refused;
        if (r) toast(REFUSED);
      }
      fresh.clear(); paint(top);
    };
    form.addEventListener('submit', e => { e.preventDefault(); void finish(true); });
    input.addEventListener('blur', () => { void finish(true); });
    input.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); void finish(false); } });
    form.append(input);
    return form;
  };
  /** @param {import('../items.js').Section} s @param {HTMLElement} b */
  const sectionMenu = (s, b) => openMenu(b, [
    { label: 'Rename section', icon: ICONS.pencil, run: () => { naming = { projectId: s.projectId, sectionId: s.id }; fresh.clear(); paint(top); focusNaming(); } },
    { label: 'Add task', icon: ICONS.plus, run: () => ctx.openQuickAdd({ projectId: s.projectId, sectionId: s.id }) },
    null,
    { label: 'Delete section', icon: ICONS.trash2, danger: true, run: async () => {
      const n = data.tasks.filter(t => t.sectionId === s.id && isTask(t) && !t.done).length;
      if (!await confirmModal(`Delete “${s.name}”${n ? ` and its ${plural(n, 'task')}` : ''}?`, { title: 'Delete section', danger: true, yes: 'Delete' })) return;
      if (await app.removeSection(s)) toast(REFUSED);
    } },
  ], { label: s.name });

  /** a project's page (the Inbox too) into host @param {HTMLElement} into @param {string} pid @param {HTMLElement} empty */
  const projectList = (into, pid, empty) => {
    const v = projectView(filtered(), data.sections, pid), c = rowCtx({});
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
    }
    if (naming && !naming.sectionId && naming.projectId === pid) parts.push(nameField('', null, pid));
    else if (canWrite) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'td-add-section'; b.textContent = 'Add section';
      b.addEventListener('click', () => newSection(pid));
      parts.push(b);
    }
    into.replaceChildren(...parts);
    const none = !v.loose.length && v.sections.every(x => !x.lines.length);
    empty.replaceChildren(...(none && !v.sections.length && canWrite ? [emptyNote('Nothing here yet', 'Tap + to add a task')] : []));
  };

  /** the tasks the search recipe's filter leaves (all of them without it) */
  const filtered = () => /** @type {Task[]} */ (filter?.pick(data.tasks) ?? data.tasks);

  const paintToday = () => {
    const today = drawnDay = dayKey(), v = todayView(filtered(), today);
    const parts = [];
    if (v.overdue.length) {
      const g = document.createElement('section'); g.className = 'td-group';
      g.append(groupHead('Overdue'), rowList(v.overdue, rowCtx({ place: true }), 'Overdue'));
      parts.push(g);
    }
    if (v.today.length || v.overdue.length) {
      const g = document.createElement('section'); g.className = 'td-group';
      g.append(groupHead(dayTitle(today, today)), rowList(v.today, rowCtx({ place: true, own: today }), 'Today'));
      parts.push(g);
    }
    $('today').replaceChildren(...parts);
    $('today-empty').replaceChildren(...(!v.today.length && !v.overdue.length && canWrite ? [emptyNote('All clear for today', 'Tap + to add a task for today')] : []));
    shownToday = [...v.overdue, ...v.today].map(l => l.task);
  };
  /** @type {Task[]} */
  let shownToday = [];

  const paintUpcoming = () => {
    const today = dayKey(), v = upcomingView(filtered(), today, upcomingDays), parts = [];
    if (v.overdue.length) {
      const g = document.createElement('section'); g.className = 'td-group';
      g.append(groupHead('Overdue'), rowList(v.overdue, rowCtx({ place: true }), 'Overdue'));
      parts.push(g);
    }
    for (const day of v.days) {
      const g = document.createElement('section'); g.className = 'td-group td-day'; g.dataset.day = day.key;
      const title = dayTitle(day.key, today);
      g.append(groupHead(title));
      if (day.lines.length) g.append(rowList(day.lines, rowCtx({ place: true, own: day.key }), title));
      if (canWrite) g.append(addRow('Add task', () => ctx.openQuickAdd({ projectId: INBOX, due: { date: day.key } })));
      parts.push(g);
    }
    $('upcoming').replaceChildren(...parts);
    // near the end of the days drawn: draw more
    const last = /** @type {HTMLElement | undefined} */ (parts.at(-3) ?? parts.at(-1));
    if (last && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => {
        if (es.some(x => x.isIntersecting)) { io.disconnect(); upcomingDays += UPCOMING_STEP; paintUpcoming(); }
      });
      io.observe(last);
    }
  };

  const paintSearch = () => {
    const words = /** @type {HTMLInputElement} */ ($('search-text')).value.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) { $('search').replaceChildren(); return; }
    const hits = data.tasks.filter(t => isTask(t) && !t.done && words.every(w => `${t.title} ${t.description ?? ''}`.toLowerCase().includes(w)));
    const lines = hits.map(task => ({ task, depth: 0, kids: 0, doneKids: 0 }));
    $('search').replaceChildren(lines.length ? rowList(lines, rowCtx({ place: true }), 'Results') : emptyNote('No matches', 'Try other words'));
  };
  $('search-text').addEventListener('input', () => { fresh.delete('search-page'); paint('search-page'); });

  const paintProject = () => {
    const p = data.projects.find(x => x.id === projectId);
    $('project-title').textContent = projectId === INBOX ? 'Inbox' : p?.name ?? 'Project';
    const bar = document.querySelector('.ui-bar-title');
    if (top === 'project-page' && bar) bar.textContent = $('project-title').textContent;
    $('project-page').style.setProperty('--td-project', colorHex(p?.color));
    projectList($('project'), projectId, $('project-empty'));
  };

  /** draws a page if the data changed since it was last drawn @param {string} id */
  const paint = id => {
    if (fresh.has(id)) return;
    fresh.add(id);
    if (id === 'today-page') paintToday();
    else if (id === 'inbox-page') projectList($('inbox'), INBOX, $('inbox-empty'));
    else if (id === 'upcoming-page') paintUpcoming();
    else if (id === 'search-page') paintSearch();
    else if (id === 'project-page') paintProject();
    else if (id === 'browse-page') void lazy.withMod('browse', m => m.drawBrowse(ctx, $('browse')));
    else if (id === 'completed-page') void lazy.withMod('completed', m => m.drawCompleted(ctx, $('completed'), $('completed-empty')));
    else fresh.delete(id);
  };
  const redraw = () => {
    fresh.clear();
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
  const screen = sectionScreen('list-view', s => {
    const could = canWrite;
    canWrite = s.role === 'admin' || s.role === 'member';
    user = s.user;
    if (canWrite !== could) redraw();
    onScreen();
  });
  return {
    ...screen,
    hide() { screen.hide(); fab.hidden = true; more.hidden = true; },
    /** @param {Data} next @param {Set<string>} ids  tasks changed elsewhere since the last draw */
    draw(next, ids) {
      data = next; changed = ids;
      filter?.feed(data.tasks);
      loading.done();
      redraw();
      // the quick add and the task sheet straight after the first draw (the main ways in, and may be used offline), then the rest
      if (!warmed) { warmed = true; lazy.need('add').then(() => lazy.need('sheet')).catch(() => {}); lazy.warmUp(); }
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
