// The task sheet's Comments section, loaded with the sheet (task-sheet.js, itself lazy). A comment is plain text with the
// small markdown marks (markdown.js), up to 2000 characters, kept in its own collection (items.js COMMENTS) with the
// task's id. Everyone with a role reads them; members add; the author edits or deletes their own (the rules say the
// same). Every change saves through the write queue (app.writeRecord / app.removeRec). No attachments.
// The look follows the reference's iOS task view: "Comments 2" (the count in grey) with an expand button at the right,
// the latest comments (a 24 px round initial, the words at 56), an accent "Show all" while some are folded away, and a
// grey "Comment" pill docked at the sheet's bottom (no paperclip).
import { icon } from '@core/ui';
import { ICONS } from '../icons.js';
import { MORE } from '../icons-more.js';
import { COMMENTS, REFUSED } from '../items.js';
import { showMarks } from '../markdown.js';

/** @typedef {import('../items.js').Comment} Comment */
/** @typedef {import('./views.js').Ctx} Ctx */

/** the most a comment may hold (the rules' limit) */
export const MAX = 2000;

/** @param {string} tag @param {string} [cls] @param {string} [text] */
const el = (tag, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

/** a comment's text as it is saved: trimmed, up to MAX; '' when there is nothing @param {unknown} text */
export const cleanComment = text => String(text ?? '').trim().slice(0, MAX);

/** a task's comments, oldest first @param {Comment[] | undefined} all @param {string} taskId */
export const commentsOf = (all, taskId) => (all ?? []).filter(c => c.taskId === taskId).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

/** "2 Nov 14:05": day, short month, 24-hour clock, in the person's time zone (the English month, as the dates elsewhere) @param {number | undefined} at */
export const when = at => {
  if (!at) return '';
  const x = new Date(at), pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${x.getDate()} ${MONTHS[x.getMonth()]} ${pad(x.getHours())}:${pad(x.getMinutes())}`;
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The section for one open task sheet. fill(ctx, taskId) draws (again) whenever the data changes; what is being typed
 * (a new comment or an edit) stays.
 * @returns {{ root: HTMLElement, bar: HTMLElement, fill: (ctx: Ctx, taskId: string) => void }}
 */
export function commentsSection() {
  const root = el('section', 'td-comments');
  /** the comment being edited, if any */
  let editing = '';
  /** @type {HTMLTextAreaElement | null} */
  let draft = null;
  /** what fill last drew, for a redraw of this section alone (an edit opened or closed) @type {{ ctx: Ctx, taskId: string } | null} */
  let last = null;
  const again = () => { if (last) api.fill(last.ctx, last.taskId); };
  const list = el('div', 'td-comment-list');
  list.setAttribute('role', 'list');
  /** the latest few show; Show all (or the expand button) shows every one, for as long as the sheet is open */
  const LATEST = 2;
  let all = false;
  const head = el('div', 'td-subtasks-head td-comments-head');
  const title = el('h3', 'td-subtasks-title');
  const expand = /** @type {HTMLButtonElement} */ (el('button', 'td-subtasks-btn'));
  expand.type = 'button'; expand.append(icon(MORE.chevronsUpDown));
  expand.addEventListener('click', () => { all = !all; again(); });
  head.append(title, expand);
  const showAll = /** @type {HTMLButtonElement} */ (el('button', 'td-comments-all', 'Show all'));
  showAll.type = 'button';
  showAll.addEventListener('click', () => { all = true; again(); });
  root.append(head, list, showAll);
  /** the box to write in, kept at the sheet's bottom edge by the sheet (task-sheet.js) */
  const bar = el('div', 'td-comment-bar');

  /** @param {Ctx} ctx */
  const form = ctx => {
    const f = /** @type {HTMLFormElement} */ (el('form', 'td-add-comment'));
    const box = /** @type {HTMLTextAreaElement} */ (el('textarea'));
    box.rows = 1; box.maxLength = MAX; box.placeholder = 'Comment'; box.setAttribute('aria-label', 'Add a comment');
    if (draft) box.value = draft.value;
    draft = box;
    const send = /** @type {HTMLButtonElement} */ (el('button', 'td-round td-comment-send'));
    send.type = 'submit'; send.setAttribute('aria-label', 'Send comment'); send.append(icon(MORE.arrowUp));
    // (typed: the send button; no attachments, so no paperclip)
    const grow = () => { box.style.height = 'auto'; box.style.height = `${Math.min(box.scrollHeight, 160)}px`; const on = !!cleanComment(box.value); send.disabled = !on; send.hidden = !on; };
    box.addEventListener('input', grow);
    f.append(box, send);
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const text = cleanComment(box.value);
      if (!text || !last) return;
      const u = ctx.user();
      box.value = ''; grow();
      const rec = { id: crypto.randomUUID().replace(/-/g, ''), taskId: last?.taskId ?? '', text, uid: u?.uid ?? '', ...(u?.name || u?.email ? { name: u.name || u.email } : {}), createdAt: Date.now() };
      if (await ctx.app.writeRecord(COMMENTS, rec, null)) ctx.toast(REFUSED);
    });
    // Enter sends on a keyboard; Shift+Enter is a new line
    box.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(hover: hover)').matches) { e.preventDefault(); f.requestSubmit(); } });
    requestAnimationFrame(grow);
    return f;
  };

  /** @param {Ctx} ctx @param {Comment} c */
  const item = (ctx, c) => {
    const mine = !!c.uid && c.uid === ctx.user()?.uid;
    const li = el('div', 'td-comment');
    li.setAttribute('role', 'listitem');
    li.dataset.id = c.id;
    const head = el('div', 'td-comment-head');
    const by = c.name || (mine ? 'You' : 'Someone');
    // (a round initial for the person: no photos are kept)
    const face = el('span', 'td-comment-face', by.trim().slice(0, 1).toUpperCase());
    face.setAttribute('aria-hidden', 'true');
    head.append(el('span', 'td-comment-by', by), el('time', 'td-comment-time', when(c.createdAt)));
    li.append(face, head);
    if (editing === c.id) {
      const box = /** @type {HTMLTextAreaElement} */ (el('textarea', 'td-comment-edit'));
      const prev = /** @type {HTMLTextAreaElement | null} */ (list.querySelector('.td-comment-edit'));   // (a change arriving keeps the typing)
      box.maxLength = MAX; box.value = prev?.value ?? c.text; box.setAttribute('aria-label', 'Edit comment');
      const row = el('div', 'td-comment-actions');
      const cancel = /** @type {HTMLButtonElement} */ (el('button', 'td-comment-btn', 'Cancel'));
      const save = /** @type {HTMLButtonElement} */ (el('button', 'td-comment-btn is-primary', 'Save'));
      cancel.type = save.type = 'button';
      cancel.addEventListener('click', () => { editing = ''; again(); });
      save.addEventListener('click', async () => {
        const text = cleanComment(box.value);
        if (!text) return;
        editing = '';
        const now = ctx.data().comments?.find(x => x.id === c.id) ?? c;
        if (text !== now.text && await ctx.app.writeRecord(COMMENTS, { ...now, text }, now)) ctx.toast(REFUSED);
        again();
      });
      row.append(cancel, save);
      li.append(box, row);
      if (!prev) requestAnimationFrame(() => { box.focus(); box.setSelectionRange(box.value.length, box.value.length); });
      return li;
    }
    const body = el('div', 'td-comment-text', c.text);
    showMarks(body, c.text);
    li.append(body);
    if (mine && ctx.canWrite()) {
      const act = el('div', 'td-comment-icons');
      const mk = (/** @type {import('app-ui/icons/lucide.js').IconNodes} */ ic, /** @type {string} */ label, /** @type {() => void} */ run) => {
        const b = /** @type {HTMLButtonElement} */ (el('button', 'td-comment-icon'));
        b.type = 'button'; b.setAttribute('aria-label', label); b.append(icon(ic)); b.addEventListener('click', run);
        return b;
      };
      act.append(
        mk(MORE.pencil, 'Edit comment', () => { editing = c.id; again(); }),
        mk(MORE.trash2, 'Delete comment', async () => { if (await ctx.app.removeRec(COMMENTS, c)) ctx.toast(REFUSED); }));
      li.append(act);
    }
    return li;
  };

  /** @type {{ root: HTMLElement, bar: HTMLElement, fill: (ctx: Ctx, taskId: string) => void }} */
  const api = { root, bar, fill(ctx, taskId) {
    if (last?.taskId !== taskId) all = false;
    last = { ctx, taskId };
    const every = commentsOf(ctx.data().comments, taskId);
    title.replaceChildren('Comments', ...(every.length ? [' ', el('span', 'td-subtasks-count', String(every.length))] : []));
    head.hidden = !every.length;
    const folds = every.length > LATEST;
    expand.hidden = !folds;
    expand.setAttribute('aria-expanded', String(all));
    expand.setAttribute('aria-label', all ? 'Show the latest comments' : 'Show all comments');
    // (the one being edited stays in view)
    const shown = all || !folds ? every : every.filter((c, i) => i >= every.length - LATEST || c.id === editing);
    showAll.hidden = all || !folds;
    // what is being typed stays: the form is kept while it has focus or text
    const keep = bar.querySelector('.td-add-comment');
    list.replaceChildren(...shown.map(c => item(ctx, c)));
    if (!ctx.canWrite()) { keep?.remove(); draft = null; return; }
    if (!keep) bar.append(form(ctx));
  } };
  return api;
}
