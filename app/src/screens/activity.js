// The activity log and a project's comments, one lazy screen (views.js lazyModules "activity"), both in #edit-sheet;
// and Reporting (#reporting-page, from Browse): every project's activity by day, a kind filter and a chart button to
// Productivity in the bar, 50 at a time.
// Activity is worked out from what is saved (no log of its own): a task or project was added, a task was done, a
// comment was written. Project comments are the task comments' collection with the project's id in taskId.
import { icon } from '@core/ui';
import { MORE } from '../icons-more.js';
import { ICONS } from '../icons.js';
import { events, ofKind, byDay, lead, KINDS } from '../activity-log.js';
import { dayKey, addDays, shortDate, timeKey } from '../dates.js';
import { colorHex } from '../colors.js';
import { emptyNote } from '../ui/row.js';
import { screens } from '../shell.js';
import { el, sheetHead, pickOne } from './pick.js';
import { commentsSection, commentsOf, when } from './comments.js';

export { events };

/** @typedef {import('./views.js').Ctx} Ctx */
/** @typedef {import('../items.js').Task} Task */
/** @typedef {import('../items.js').Project} Project */
/** @typedef {import('../activity-log.js').Event} Event */

const d = () => /** @type {HTMLDialogElement} */ (document.getElementById('edit-sheet'));

/** what is on show: a draw function to run again when the data changes @type {((ctx: Ctx) => void) | null} */
let again = null;

/** the data changed: bring the open screen up to date @param {Ctx} ctx */
export function redraw(ctx) { if (again && d().open) again(ctx); }

/** @param {Event[]} list */
function listOf(list) {
  const ul = el('div', 'td-card td-activity');
  ul.setAttribute('role', 'list');
  if (!list.length) { ul.append(el('p', 'td-activity-empty', 'Nothing yet')); return ul; }
  for (const e of list) {
    const row = el('div', 'td-activity-row');
    row.setAttribute('role', 'listitem');
    row.append(icon(MORE[e.ic], { class: 'td-activity-icon' }), el('span', 'td-activity-text', e.text), el('time', 'td-activity-time', when(e.at)));
    ul.append(row);
  }
  return ul;
}

/** @param {HTMLElement[]} parts @param {string} title */
function show(title, parts) {
  const sheet = d(), body = /** @type {HTMLElement} */ (sheet.querySelector('[data-fill]'));
  body.replaceChildren(sheetHead(title, sheet), ...parts);
  if (!sheet.open) {
    sheet.showModal();
    sheet.addEventListener('close', () => { again = null; }, { once: true });
  }
}

/** the activity of a task (it and its comments, its sub-tasks) or a project (its tasks and comments)
 * @param {Ctx} ctx @param {{ task: Task } | { project: Project }} what */
export function openActivity(ctx, what) {
  const draw = (/** @type {Ctx} */ c) => {
    const { tasks, comments } = c.data();
    if ('task' in what) {
      const id = what.task.id, mine = tasks.filter(t => t.id === id || t.parentId === id);
      show('Activity', [listOf(events(mine, commentsOf(comments, id)))]);
    } else {
      const id = what.project.id, mine = tasks.filter(t => (t.projectId || 'inbox') === id);
      show(`Activity: ${what.project.name}`, [listOf(events(mine, commentsOf(comments, id).concat(mine.flatMap(t => commentsOf(comments, t.id)))))]);
    }
  };
  again = draw;
  draw(ctx);
}

/** a project's own comments, with the box to write in @param {Ctx} ctx @param {Project} p */
export function openProjectComments(ctx, p) {
  const talk = commentsSection();
  const draw = (/** @type {Ctx} */ c) => {
    talk.fill(c, p.id);
    const empty = !commentsOf(c.data().comments, p.id).length;
    const scroll = el('div', 'td-sheet-scroll');
    scroll.append(...(empty ? [el('p', 'td-activity-empty', 'No comments yet')] : []), talk.root);
    show(`Comments: ${p.name}`, [scroll, talk.bar]);
  };
  again = draw;
  draw(ctx);
}

// ---- Reporting

const PAGE = 50;
/** the kind on show and how many are shown (this visit) */
let kind = 'all', shown = PAGE;

/** a bar button that shows only while Reporting is on top (views.js hides [data-page] ones on other screens)
 * @param {Ctx} ctx @param {string} id @param {string} label @param {import('app-ui/icons/lucide.js').IconNodes} ic @param {() => void} run */
function barButton(ctx, id, label, ic, run) {
  let b = /** @type {HTMLButtonElement | null} */ (document.getElementById(id));
  if (!b) {
    b = /** @type {HTMLButtonElement} */ (el('button', 'td-bar-btn'));
    b.type = 'button';
    b.id = id;
    b.dataset.page = 'reporting-page';
    b.setAttribute('aria-label', label);
    b.append(icon(ic));
    document.querySelector('.ui-bar-end')?.prepend(b);
  }
  b.onclick = run;
  b.hidden = ctx.top() !== 'reporting-page';
  return b;
}

/** @param {Ctx} ctx @param {HTMLElement} host */
export function drawReporting(ctx, host) {
  const data = ctx.data(), today = dayKey(), me = String(ctx.user()?.name ?? '').trim().split('@')[0];
  const redraw = () => drawReporting(ctx, host);
  const filter = barButton(ctx, 'reporting-filter', 'Show', MORE.funnel, () => pickOne('Show', KINDS.map(([k, label]) => ({ label, checked: k === kind, run: () => { kind = k; shown = PAGE; redraw(); } }))));
  filter.classList.toggle('is-on', kind !== 'all');
  barButton(ctx, 'reporting-chart', 'Productivity', MORE.chartColumn, () => screens()?.push('#productivity-page'));
  const all = ofKind(events(data.tasks, data.comments ?? []), kind);
  if (!all.length) {
    const e = emptyNote(kind === 'all' ? 'No activity yet' : 'Nothing of this kind yet', kind === 'all' ? 'What you add and complete shows here, day by day.' : 'Pick All in the filter to see everything.', 'activity');
    e.classList.add('td-empty-page');
    host.replaceChildren(e);
    return;
  }
  const projects = new Map(data.projects.map(p => [p.id, p]));
  const yesterday = addDays(today, -1);
  /** @type {HTMLElement[]} */
  const parts = [];
  for (const { day, events: list } of byDay(all.slice(0, shown))) {
    const sec = el('section', 'td-rep-day');
    const h = el('h2', 'td-rep-h', `${shortDate(day, today)}${day === today ? ' · Today' : day === yesterday ? ' · Yesterday' : ''}`);
    h.id = `rep-${day}`;
    sec.setAttribute('aria-labelledby', h.id);
    const card = el('ul', 'td-card td-rep-card');
    for (const e of list) {
      const li = el('li', 'td-rep-row');
      li.dataset.kind = e.kind ?? '';
      const face = el('span', 'td-avatar td-rep-face', (me || 'Y').charAt(0).toUpperCase());
      face.setAttribute('aria-hidden', 'true');
      if (e.kind === 'completed') { const b = el('span', 'td-rep-badge'); b.append(icon(ICONS.check)); face.append(b); }
      const words = el('div', 'td-rep-words');
      const line = el('p', 'td-rep-text', `${lead(e)} `);
      line.append(el('strong', '', e.title ?? ''));
      words.append(line, el('time', 'td-rep-time', timeKey(new Date(e.at))));
      const p = projects.get(e.projectId ?? '');
      const where = el('span', 'td-rep-where');
      if (p) {
        const inbox = p.id === 'inbox' || p.inbox;
        const ic = icon(inbox ? ICONS.inbox : ICONS.hash, { class: 'td-rep-where-icon' });
        if (!inbox) ic.style.color = colorHex(p.color);
        where.append(el('span', 'td-rep-where-name', inbox ? 'Inbox' : p.name), ic);
      } else if (e.projectId === 'inbox') where.append(el('span', 'td-rep-where-name', 'Inbox'), icon(ICONS.inbox, { class: 'td-rep-where-icon' }));
      li.append(face, words, where);
      card.append(li);
    }
    sec.append(h, card);
    parts.push(sec);
  }
  if (all.length > shown) {
    const more = /** @type {HTMLButtonElement} */ (el('button', 'td-link td-rep-more', 'Show more'));
    more.type = 'button';
    more.addEventListener('click', () => { shown += PAGE; redraw(); });
    parts.push(more);
  }
  host.replaceChildren(...parts);
}
