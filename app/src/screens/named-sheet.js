// The label and filter sheets (#edit-sheet): a new one, or one's name, colour and favourite; a filter also has its
// query, with how many tasks it shows (or what is wrong with it, in red) as it is typed. A new one is made with Add;
// an existing one saves each change as it is made. Delete asks first; deleting a label leaves its tasks as they are.
import { icon, confirmModal, plural } from '@core/ui';
import { ICONS } from '../icons.js';
import { MORE } from '../icons-more.js';
import { REFUSED } from '../items.js';
import { COLORS, DEFAULT_COLOR, colorHex, colorName } from '../colors.js';
import { dayKey } from '../dates.js';
import { countQuery, errorText } from '../query.js';
import { parse } from '../parse.js';
import { el, sheetHead, pickOne } from './pick.js';

/** @typedef {import('./views.js').Ctx} Ctx */
/** @typedef {import('../items.js').Label} Label */
/** @typedef {import('../items.js').Filter} Filter */

const d = () => /** @type {HTMLDialogElement} */ (document.getElementById('edit-sheet'));

/** what a query reads its words against @param {Ctx} ctx @returns {import('../query.js').QueryContext} */
export const queryContext = ctx => {
  const data = ctx.data(), weekStart = Number(ctx.app.settings.get('weekStart') ?? 1);
  return { projects: data.projects, sections: data.sections, labels: data.labels, today: dayKey(), weekStart,
    parseDate: text => parse(`x ${text}`, { weekStart }).due?.date ?? null };
};

/** @param {import('app-ui/icons/lucide.js').IconNodes} ic @param {string} label */
function attr(ic, label) {
  const b = /** @type {HTMLButtonElement} */ (el('button', 'td-attr'));
  b.type = 'button';
  const i = icon(ic, { class: 'td-attr-icon' }), value = el('span', 'td-attr-value');
  b.append(i, el('span', 'td-attr-label', label), value, icon(ICONS.chevronRight, { class: 'td-attr-chevron' }));
  return { b, i, value };
}

/**
 * @param {Ctx} ctx @param {'labels' | 'filters'} kind @param {Label | Filter | null} [existing]
 * @param {(id: string) => void} [made]  after Add, with the new one's id
 */
export function openNamedSheet(ctx, kind, existing = null, made) {
  const sheet = d(), body = /** @type {HTMLElement} */ (sheet.querySelector('[data-fill]'));
  const isFilter = kind === 'filters', word = isFilter ? 'filter' : 'label', mark = isFilter ? MORE.droplet : ICONS.tag;
  const draft = { name: existing?.name ?? '', color: existing?.color ?? DEFAULT_COLOR, favorite: !!existing?.favorite,
    query: /** @type {Filter | null} */ (existing)?.query ?? '' };
  const now = () => (existing ? /** @type {(Label | Filter)[]} */ (ctx.data()[kind]).find(x => x.id === existing.id) ?? existing : null);
  const keep = async (/** @type {Partial<Filter>} */ patch) => {
    const x = now();
    if (!x || !ctx.canWrite()) return;
    const r = isFilter ? await ctx.app.editFilter(/** @type {Filter} */ (x), patch) : await ctx.app.editLabel(/** @type {Label} */ (x), patch);
    if (r) ctx.toast(REFUSED);
  };
  const create = async () => {
    const fields = { ...draft, name: name.value };
    if (!fields.name.trim()) return;
    const r = isFilter ? await ctx.app.addFilter({ ...fields, query: query?.value ?? '' }) : await ctx.app.addLabel(fields);
    if (r.refused) { ctx.toast(r.refused.startsWith('A label') ? r.refused : REFUSED); return; }
    sheet.close();
    made?.(r.id);
  };
  const head = sheetHead(existing ? `Edit ${word}` : `Add ${word}`, sheet, existing ? null : () => { void create(); });
  const doneBtn = /** @type {HTMLButtonElement | null} */ (head.querySelector('.td-sheet-done'));
  if (doneBtn) doneBtn.textContent = 'Add';

  const card = el('div', 'td-card td-project-card');
  const name = Object.assign(document.createElement('input'), { className: 'td-project-name', value: draft.name, placeholder: `${isFilter ? 'Filter' : 'Label'} name`, maxLength: isFilter ? 120 : 60 });
  name.setAttribute('aria-label', `${isFilter ? 'Filter' : 'Label'} name`);
  name.readOnly = !ctx.canWrite();
  const ready = () => { if (doneBtn) doneBtn.disabled = !name.value.trim(); };
  name.addEventListener('input', ready);
  name.addEventListener('change', () => { if (existing && name.value.trim()) void keep({ name: name.value.trim() }); });
  name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (existing) name.blur(); else void create(); } });
  card.append(name);

  /** @type {HTMLTextAreaElement | null} */
  let query = null;
  const parts = [head, card];
  if (isFilter) {
    const qcard = el('div', 'td-card td-query-card');
    query = Object.assign(document.createElement('textarea'), { className: 'td-query', value: draft.query, rows: 3, maxLength: 1000,
      placeholder: 'Query, like today & p1' });
    query.setAttribute('aria-label', 'Query');
    query.setAttribute('aria-describedby', 'edit-sheet-count');
    query.spellcheck = false;
    query.readOnly = !ctx.canWrite();
    const count = el('p', 'td-query-count');
    count.id = 'edit-sheet-count';
    count.setAttribute('aria-live', 'polite');
    const q = /** @type {HTMLTextAreaElement} */ (query);
    const live = () => {
      if (!q.value.trim()) { count.textContent = ''; count.classList.remove('is-error'); return; }
      const r = countQuery(q.value, ctx.data().tasks, queryContext(ctx));
      count.textContent = r.error ? errorText(r.error) : plural(r.count, 'task');
      count.classList.toggle('is-error', !!r.error);
    };
    q.addEventListener('input', live);
    q.addEventListener('change', () => { if (existing) void keep({ query: q.value.trim() }); });
    qcard.append(q);
    parts.push(qcard, count);
    live();
  }

  const rows = el('div', 'td-card td-attrs');
  const color = attr(mark, 'Colour');
  const drawRows = () => { color.i.style.color = colorHex(draft.color); color.value.textContent = colorName(draft.color); };
  color.b.disabled = !ctx.canWrite();
  color.b.addEventListener('click', () => pickOne('Colour', COLORS.map(([key, label, hex]) => ({
    label, icon: mark, color: hex, checked: draft.color === key,
    run: () => { draft.color = key; drawRows(); if (existing) void keep({ color: key }); } }))));
  const fav = el('label', 'td-attr td-switch-row');
  const box = Object.assign(document.createElement('input'), { type: 'checkbox', className: 'ui-switch', checked: draft.favorite });
  box.disabled = !ctx.canWrite();
  fav.append(icon(MORE.heart, { class: 'td-attr-icon' }), el('span', 'td-attr-label', 'Favorite'), box);
  box.addEventListener('change', () => { draft.favorite = box.checked; if (existing) void keep({ favorite: box.checked }); });
  rows.append(color.b, fav);
  parts.push(rows);

  if (existing && ctx.canWrite()) {
    const del = /** @type {HTMLButtonElement} */ (el('button', 'td-card td-danger-row'));
    del.type = 'button';
    del.append(icon(MORE.trash2), el('span', '', `Delete ${word}`));
    del.addEventListener('click', async () => {
      const x = now();
      if (!x || !await removeNamed(ctx, kind, x)) return;
      sheet.close();
    });
    parts.push(del);
  }
  body.replaceChildren(...parts);
  drawRows(); ready();
  if (!sheet.open) sheet.showModal();
  if (!existing) name.focus();
}

/** asks, then deletes a label (its tasks keep the rest) or a filter -> true once deleted @param {Ctx} ctx
 * @param {'labels' | 'filters'} kind @param {Label | Filter} x */
export async function removeNamed(ctx, kind, x) {
  const word = kind === 'filters' ? 'filter' : 'label';
  if (!await confirmModal(`Delete “${x.name}”?${kind === 'labels' ? ' Its tasks stay; they just lose this label.' : ''}`, { title: `Delete ${word}`, danger: true, yes: 'Delete' })) return false;
  const r = kind === 'filters' ? await ctx.app.removeFilter(/** @type {Filter} */ (x)) : await ctx.app.removeLabel(/** @type {Label} */ (x));
  if (r) { ctx.toast(REFUSED); return false; }
  return true;
}
