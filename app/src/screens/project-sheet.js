// The project sheet (#project-sheet): a new project, or one's name, colour, parent and favourite. A new one is made with
// Add; an existing one saves each change as it is made. Delete (an existing one) asks first and takes its sub-projects,
// sections and tasks with it.
import { icon } from '@core/ui';
import { ICONS } from '../icons.js';
import { INBOX, REFUSED } from '../items.js';
import { projectTree, projectCascade } from '../tasks.js';
import { COLORS, DEFAULT_COLOR, colorHex, colorName } from '../colors.js';
import { el, sheetHead, pickOne } from './pick.js';

/** @typedef {import('./views.js').Ctx} Ctx */
/** @typedef {import('../items.js').Project} Project */

const d = () => /** @type {HTMLDialogElement} */ (document.getElementById('project-sheet'));

/** a row of the sheet: icon, label, value, chevron @param {import('app-ui/icons/lucide.js').IconNodes} ic @param {string} label */
function attr(ic, label) {
  const b = /** @type {HTMLButtonElement} */ (el('button', 'td-attr'));
  b.type = 'button';
  const i = icon(ic, { class: 'td-attr-icon' });
  const value = el('span', 'td-attr-value');
  b.append(i, el('span', 'td-attr-label', label), value, icon(ICONS.chevronRight, { class: 'td-attr-chevron' }));
  return { b, i, value };
}

/** @param {Ctx} ctx @param {{ project?: Project, parentId?: string }} [o] */
export function openProjectSheet(ctx, o = {}) {
  const sheet = d(), body = /** @type {HTMLElement} */ (sheet.querySelector('[data-fill]'));
  const existing = o.project ?? null;
  const draft = { name: existing?.name ?? '', color: existing?.color ?? DEFAULT_COLOR, parentId: existing?.parentId ?? o.parentId ?? null,
    favorite: !!existing?.favorite };
  const now = () => (existing ? ctx.data().projects.find(p => p.id === existing.id) ?? existing : null);
  const keep = async (/** @type {Partial<Project>} */ patch) => {
    const p = now();
    if (p && await ctx.app.editProject(p, patch)) ctx.toast(REFUSED);
  };

  const create = async () => {
    const r = await ctx.app.addProject({ ...draft, name: name.value });
    if (r.refused) { ctx.toast(r.refused === 'A project needs a name' ? r.refused : REFUSED); return; }
    sheet.close();
    ctx.openProject(r.id);
  };
  const head = sheetHead(existing ? 'Edit project' : 'Add project', sheet, existing ? null : () => { void create(); });
  const doneBtn = /** @type {HTMLButtonElement | null} */ (head.querySelector('.td-sheet-done'));
  if (doneBtn) doneBtn.textContent = 'Add';

  const card = el('div', 'td-card td-project-card');
  const name = Object.assign(document.createElement('input'), { className: 'td-project-name', value: draft.name, placeholder: 'Name', maxLength: 120 });
  name.setAttribute('aria-label', 'Project name');
  const ready = () => { if (doneBtn) doneBtn.disabled = !name.value.trim(); };
  name.addEventListener('input', ready);
  name.addEventListener('change', () => { if (existing && name.value.trim()) void keep({ name: name.value }); });
  name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (existing) name.blur(); else void create(); } });
  card.append(name);

  const rows = el('div', 'td-card td-attrs');
  const color = attr(ICONS.hash, 'Colour'), parent = attr(ICONS.listTree, 'Parent project');
  const drawRows = () => {
    color.i.style.color = colorHex(draft.color);
    color.value.textContent = colorName(draft.color);
    const p = ctx.data().projects.find(x => x.id === draft.parentId);
    parent.value.textContent = p?.name ?? 'None';
  };
  color.b.addEventListener('click', () => pickOne('Colour', COLORS.map(([key, label, hex]) => ({
    label, icon: ICONS.hash, color: hex, checked: draft.color === key,
    run: () => { draft.color = key; drawRows(); if (existing) void keep({ color: key }); } }))));
  parent.b.addEventListener('click', () => {
    // not itself or anything under it
    const below = existing ? new Set(projectCascade(existing.id, ctx.data().projects, [], []).projects.map(p => p.id)) : new Set();
    const choose = (/** @type {string | null} */ id) => { draft.parentId = id; drawRows(); if (existing) void keep({ parentId: id }); };
    pickOne('Parent project', [
      { label: 'None', icon: ICONS.ban, checked: !draft.parentId, run: () => choose(null) },
      ...projectTree(ctx.data().projects.map(p => ({ ...p, collapsed: false }))).filter(({ project: p }) => !below.has(p.id))
        .map(({ project: p, depth }) => ({ label: p.name, icon: ICONS.hash, color: colorHex(p.color), depth, checked: draft.parentId === p.id, run: () => choose(p.id) })),
    ]);
  });

  // favourite: a switch
  const fav = el('label', 'td-attr td-switch-row');
  const box = Object.assign(document.createElement('input'), { type: 'checkbox', className: 'ui-switch', checked: draft.favorite });
  fav.append(icon(ICONS.heart, { class: 'td-attr-icon' }), el('span', 'td-attr-label', 'Favorite'), box);
  box.addEventListener('change', () => { draft.favorite = box.checked; if (existing) void keep({ favorite: box.checked }); });
  rows.append(color.b, parent.b, fav);

  const parts = [head, card, rows];
  if (existing && existing.id !== INBOX) {
    const del = /** @type {HTMLButtonElement} */ (el('button', 'td-card td-danger-row'));
    del.type = 'button';
    del.append(icon(ICONS.trash2), el('span', '', 'Delete project'));
    del.addEventListener('click', async () => { const p = now(); if (p && await ctx.removeProject(p)) sheet.close(); });
    parts.push(del);
  }
  body.replaceChildren(...parts);
  drawRows(); ready();
  if (!sheet.open) sheet.showModal();
  if (!existing) name.focus();
}
