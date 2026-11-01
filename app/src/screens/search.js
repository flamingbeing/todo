// Search's results (#search, under the field at the top of the Search tab): with nothing typed, the last searches on
// this device (a tap runs one again; Clear forgets them); else what has every word typed, in four groups: tasks,
// projects, labels and saved filters. A search is kept as recent once it is left (Enter, or a result opened).
import { icon } from '@core/ui';
import { ICONS } from '../icons.js';
import { MORE } from '../icons-more.js';
import { colorHex } from '../colors.js';
import { searchAll, remember } from '../search.js';
import { rowList, emptyNote } from '../ui/row.js';
import { el } from './pick.js';

/** @typedef {import('./views.js').Ctx} Ctx */

const wired = new WeakSet();

/** @param {Ctx} ctx @param {HTMLInputElement} input @param {HTMLElement} host */
export function drawSearch(ctx, input, host) {
  const settings = ctx.app.settings;
  const recent = () => /** @type {string[]} */ (settings.get('recentSearches') ?? []);
  const keep = () => { const v = input.value.trim(); if (v) settings.set('recentSearches', remember(recent(), v)); };
  if (!wired.has(input)) {
    wired.add(input);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); keep(); input.blur(); } });
  }
  const text = input.value.trim();
  if (!text) {
    const list = recent();
    if (!list.length) { host.replaceChildren(); return; }
    const head = el('div', 'td-search-head');
    const clear = /** @type {HTMLButtonElement} */ (el('button', 'td-text-btn', 'Clear'));
    clear.type = 'button';
    clear.setAttribute('aria-label', 'Clear recent searches');
    clear.addEventListener('click', () => { settings.set('recentSearches', []); drawSearch(ctx, input, host); });
    head.append(el('h2', 'td-search-h', 'Recent searches'), clear);
    const ul = el('ul', 'td-card td-results');
    ul.setAttribute('aria-label', 'Recent searches');
    ul.append(...list.map(q => item(MORE.history, q, '', () => {
      input.value = q;
      input.dispatchEvent(new Event('input'));
    })));
    host.replaceChildren(head, ul);
    return;
  }
  const data = ctx.data(), hits = searchAll(text, data);
  /** @type {HTMLElement[]} */
  const parts = [];
  const group = (/** @type {string} */ title, /** @type {HTMLElement} */ body) => {
    const sec = el('section', 'td-group td-result-group');
    sec.append(el('h2', 'td-search-h', title), body);
    parts.push(sec);
  };
  if (hits.tasks.length) {
    const c = ctx.rows({ place: true });
    group('Tasks', rowList(hits.tasks.map(task => ({ task, depth: 0, kids: 0, doneKids: 0 })), { ...c, onOpen: t => { keep(); c.onOpen(t); } }, 'Tasks'));
  }
  const named = (/** @type {string} */ title, /** @type {{ id: string, name: string, color?: string }[]} */ list, /** @type {import('app-ui/icons/lucide.js').IconNodes} */ ic,
    /** @type {(id: string) => void} */ run) => {
    if (!list.length) return;
    const ul = el('ul', 'td-card td-results');
    ul.setAttribute('aria-label', title);
    ul.append(...list.map(x => item(ic, x.name, colorHex(x.color), () => { keep(); run(x.id); })));
    group(title, ul);
  };
  named('Projects', hits.projects, ICONS.hash, id => ctx.openProject(id));
  named('Labels', hits.labels, ICONS.tag, id => ctx.openPlace('labels', id));
  named('Filters', hits.filters, MORE.droplet, id => ctx.openPlace('filters', id));
  host.replaceChildren(...(parts.length ? parts : [emptyNote('No matches', 'Try other words')]));
}

/** a result row: its icon, its name @param {import('app-ui/icons/lucide.js').IconNodes} ic @param {string} label
 * @param {string} color @param {() => void} run */
function item(ic, label, color, run) {
  const li = el('li', ''), b = /** @type {HTMLButtonElement} */ (el('button', 'td-result'));
  b.type = 'button';
  const i = icon(ic, { class: 'td-result-icon' });
  if (color) i.style.color = color;
  b.append(i, el('span', 'td-result-label', label));
  b.addEventListener('click', run);
  li.append(b);
  return li;
}
