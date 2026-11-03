// The activity log and a project's comments, one lazy screen (views.js lazyModules "activity"), both in #edit-sheet.
// Activity is worked out from what is saved (no log of its own): a task or project was added, a task was done, a
// comment was written. Project comments are the task comments' collection with the project's id in taskId.
import { icon } from '@core/ui';
import { MORE } from '../icons-more.js';
import { events } from '../activity-log.js';
import { el, sheetHead } from './pick.js';
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
