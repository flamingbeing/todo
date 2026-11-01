// The lists' tap menus, loaded the first time one opens (views.js lazyModules "menus"): the page's "…" (Display, then
// on a project Edit project, Add section and Delete project; on the Inbox Add section; on a label or filter Edit and
// Delete; Select tasks on every list), a section's "…" (Rename, Add task, Delete), and deleting a project (asked first).
// Kept out of views.js so the first screen loads less.
import { confirmModal, plural } from '@core/ui';
import { INBOX, REFUSED } from '../items.js';
import { isTask, projectCascade } from '../tasks.js';
import { openMenu } from '../ui/menu.js';
import { ICONS } from '../icons.js';
import { byOrder, orderBetween } from '../order.js';

/** @typedef {import('./views.js').Ctx} Ctx */
/** @typedef {import('../items.js').Project} Project */
/** @typedef {import('../items.js').Section} Section */
/**
 * What the page menu needs from the lists.
 * @typedef {{ pid: string, tree: boolean, view: string, place: { kind: 'labels' | 'filters', id: string } | null, host: string,
 *   newSection: (pid: string) => void, pop: () => void, display: (view: string, p: Project | null) => void,
 *   named: (run: (m: typeof import('./named-sheet.js')) => unknown) => void, select: (host: string) => void }} PageMenu
 */

/** the page's "…" @param {Ctx} ctx @param {HTMLElement} more @param {PageMenu} o */
export function pageMenu(ctx, more, o) {
  const data = ctx.data(), p = data.projects.find(x => x.id === o.pid), own = o.tree && o.pid !== INBOX && p ? p : null;
  const place = o.place, named = place ? /** @type {any[]} */ (data[place.kind]).find(x => x.id === place.id) : null, word = place?.kind === 'labels' ? 'label' : 'filter';
  openMenu(more, [
    { label: 'Display', icon: ICONS.slidersHorizontal, run: () => o.display(o.view, own) },
    null,
    ...(own ? [{ label: 'Edit project', icon: ICONS.pencil, run: () => ctx.openProjectSheet({ project: own }) }] : []),
    ...(o.tree ? [{ label: 'Add section', icon: ICONS.circlePlus, run: () => o.newSection(o.pid) }] : []),
    ...(named && place ? [{ label: `Edit ${word}`, icon: ICONS.pencil, run: () => o.named(m => m.openNamedSheet(ctx, place.kind, named)) }] : []),
    { label: 'Select tasks', icon: ICONS.squareCheck, run: () => o.select(o.host) },
    ...(own ? [null, { label: 'Delete project', icon: ICONS.trash2, danger: true, run: () => { void ctx.removeProject(own); } }] : []),
    ...(named && place ? [null, { label: `Delete ${word}`, icon: ICONS.trash2, danger: true, run: () => o.named(async m => { if (await m.removeNamed(ctx, place.kind, named)) o.pop(); }) }] : []),
  ], { label: 'List' });
}

/** a section's "…" @param {Ctx} ctx @param {Section} s @param {HTMLElement} b @param {(s: Section) => void} rename
 * @param {(pid: string, after: string, order: number) => void} addAfter  a new section's name field after this one, at that order */
export function sectionMenu(ctx, s, b, rename, addAfter) {
  // (the order halfway to the next section's, or past the last)
  const mine = byOrder(ctx.data().sections.filter(x => x.projectId === s.projectId)), next = mine[mine.findIndex(x => x.id === s.id) + 1];
  openMenu(b, [
    { label: 'Rename section', icon: ICONS.pencil, run: () => rename(s) },
    { label: 'Add task', icon: ICONS.plus, run: () => ctx.openQuickAdd({ projectId: s.projectId, sectionId: s.id }) },
    { label: 'Add section after', icon: ICONS.circlePlus, run: () => addAfter(s.projectId, s.id, orderBetween(s.order ?? 0, next?.order ?? null)) },
    null,
    { label: 'Delete section', icon: ICONS.trash2, danger: true, run: async () => {
      const n = ctx.data().tasks.filter(t => t.sectionId === s.id && isTask(t) && !t.done).length;
      if (!await confirmModal(`Delete “${s.name}”${n ? ` and its ${plural(n, 'task')}` : ''}?`, { title: 'Delete section', danger: true, yes: 'Delete' })) return;
      if (await ctx.app.removeSection(s, id => ctx.files?.of(id) ?? [])) ctx.toast(REFUSED);
    } },
  ], { label: s.name });
}

/** a project with its tasks and sub-projects, once asked -> true once said yes @param {Ctx} ctx @param {Project} p @param {() => void} leave  off its page first */
export async function removeProject(ctx, p, leave) {
  const data = ctx.data(), all = projectCascade(p.id, data.projects, data.sections, data.tasks);
  const n = all.tasks.filter(t => isTask(t) && !t.done).length, subs = all.projects.length - 1;
  const what = [n ? plural(n, 'task') : '', subs ? plural(subs, 'sub-project') : ''].filter(Boolean).join(' and ');
  if (!await confirmModal(`Delete “${p.name}”${what ? ` with its ${what}` : ''}?`, { title: 'Delete project', danger: true, yes: 'Delete' })) return false;
  leave();
  if (await ctx.app.removeProject(p, id => ctx.files?.of(id) ?? [])) ctx.toast(REFUSED);
  return true;
}
