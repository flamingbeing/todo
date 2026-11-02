// Project templates (Browse > Manage projects, loaded the first time one is used): save a project's sections and open tasks as a
// template (dates cleared), and make a new project from one. Templates belong to the person's space and sync through the write
// queue like any record; the pure half is templates.js.
import { icon, confirmModal, plural } from '@core/ui';
import { MORE } from '../icons-more.js';
import { ICONS } from '../icons.js';
import { INBOX, COLL, PROJECTS, SECTIONS, TEMPLATES } from '../items.js';
import { colorHex } from '../colors.js';
import { projectTree } from '../arrange.js';
import { templateOf, planFrom } from '../templates.js';
import { el, pickOne, sheetHead } from './pick.js';

/** @typedef {import('./views.js').Ctx} Ctx */
const BATCH = 20;
const newId = () => (crypto.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2)).replace(/-/g, '');
const counts = (/** @type {import('../templates.js').Template} */ t) => `${plural(t.tasks?.length ?? 0, 'task')}, ${plural(t.sections?.length ?? 0, 'section')}`;

/** the project picker, then the save @param {Ctx} ctx */
export function saveAsTemplate(ctx) {
  const data = ctx.data();
  const choices = projectTree(data.projects.map(p => ({ ...p, collapsed: false }))).filter(x => x.project.id !== INBOX).map(({ project, depth }) => ({
    label: project.name, icon: ICONS.hash, color: colorHex(project.color), depth,
    run: async () => {
      const tpl = templateOf(project, ctx.data());
      const reason = await ctx.app.writeRecord(TEMPLATES, { id: newId(), ...tpl, createdAt: Date.now() }, null);
      ctx.toast(reason || `Saved "${tpl.name}" as a template (${counts(tpl)})`);
    },
  }));
  if (!choices.length) { ctx.toast('No projects to save yet'); return; }
  pickOne('Save as template', choices);
}

/** the templates to start a project from; the trash button deletes one @param {Ctx} ctx */
export function newFromTemplate(ctx) {
  const d = /** @type {HTMLDialogElement} */ (document.getElementById('pick-sheet'));
  const body = /** @type {HTMLElement} */ (d.querySelector('[data-fill]'));
  const draw = () => {
    const list = (ctx.data().templates ?? []).filter(t => t && t.name).sort((a, b) => a.name.localeCompare(b.name));
    const ul = el('ul', 'td-card td-choices');
    ul.setAttribute('aria-label', 'Templates');
    ul.append(...list.map(t => {
      const li = el('li', 'td-template');
      const b = /** @type {HTMLButtonElement} */ (el('button', 'td-choice'));
      b.type = 'button';
      const i = icon(MORE.layoutTemplate, { class: 'td-choice-icon' });
      i.style.color = colorHex(t.color);
      b.append(i, el('span', 'td-choice-label', t.name), el('span', 'td-choice-side', counts(t)));
      b.addEventListener('click', () => { d.close(); void make(ctx, t); });
      const del = /** @type {HTMLButtonElement} */ (el('button', 'td-icon-btn td-template-del'));
      del.type = 'button';
      del.setAttribute('aria-label', `Delete template ${t.name}`);
      del.append(icon(MORE.trash2));
      del.addEventListener('click', async () => {
        if (!await confirmModal(`Delete the template "${t.name}"? Projects made from it stay.`, { title: 'Delete template', yes: 'Delete' })) return;
        const reason = await ctx.app.removeRec(TEMPLATES, t);
        if (reason) ctx.toast(reason);
        setTimeout(draw, 0);
      });
      li.append(b, del);
      return li;
    }));
    body.replaceChildren(sheetHead('New from template', d), list.length ? ul : el('p', 'td-browse-none', 'No templates yet. Save a project as a template first.'));
  };
  draw();
  if (!d.open) d.showModal();
}

/** writes the plan: the project, its sections, then its tasks, 20 at a time; then opens the project @param {Ctx} ctx @param {import('../templates.js').Template} tpl */
async function make(ctx, tpl) {
  const data = ctx.data();
  const plan = planFrom(tpl, { labels: data.labels, projects: data.projects }, { id: newId });
  /** @type {[string, Record<string, any>][]} */
  const writes = [[PROJECTS, plan.project], ...plan.sections.map(/** @returns {[string, any]} */ s => [SECTIONS, s]), ...plan.tasks.map(/** @returns {[string, any]} */ t => [COLL, t])];
  let failed = '';
  for (let i = 0; i < writes.length && !failed; i += BATCH) {
    const reasons = await Promise.all(writes.slice(i, i + BATCH).map(([coll, rec]) => ctx.app.writeRecord(coll, rec, null)));
    failed = reasons.find(Boolean) || '';
  }
  if (failed) { ctx.toast(failed); return; }
  ctx.toast(`Made "${plan.project.name}" (${plural(plan.tasks.length, 'task')})`);
  ctx.openProject(plan.project.id);
}
