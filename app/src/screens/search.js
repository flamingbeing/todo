// Search's results (#search, under the field of the Search page pushed over Browse): with nothing typed, Recently visited (the last
// few places opened on this device: Inbox, Today, Upcoming, a project, Filters & Labels, a label or filter; one card of rows,
// a tap goes there) and the last searches (a tap runs one again; Clear forgets them); else what has every word typed, in four groups: tasks,
// projects, labels and saved filters. A search is kept as recent once it is left (Enter, or a result opened).
import { icon } from '@core/ui';
import { ICONS } from '../icons.js';
import { MORE } from '../icons-more.js';
import { colorHex } from '../colors.js';
import { searchAll, remember } from '../search.js';
import { rowList, emptyNote } from '../ui/row.js';
import { el } from './pick.js';
import { screens, showPage } from '../shell.js';
import { underBar } from '../ui/stick.js';

/** @typedef {import('./views.js').Ctx} Ctx */

const wired = new WeakSet();

/** @param {Ctx} ctx @param {HTMLInputElement} input @param {HTMLElement} host */
export function drawSearch(ctx, input, host) {
  const settings = ctx.app.settings;
  const recent = () => /** @type {string[]} */ (settings.get('recentSearches') ?? []);
  const keep = () => { const v = input.value.trim(); if (v) settings.set('recentSearches', remember(recent(), v)); };
  const box = /** @type {HTMLElement | null} */ (input.closest('.td-search'));
  if (box) underBar(box);
  if (!wired.has(input)) {
    wired.add(input);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); keep(); input.blur(); } });
  }
  const text = input.value.trim();
  if (!text) {
    const list = recent(), places = visited(ctx), parts = [];
    if (places.length) {
      const ul = el('ul', 'td-card td-results');
      ul.setAttribute('aria-label', 'Recently visited');
      ul.append(...places.map(p => item(p.ic, p.name, p.color, p.run)));
      parts.push(el('h2', 'td-search-h', 'Recently visited'), ul);
    }
    if (!list.length) { host.replaceChildren(...parts); return; }
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
    host.replaceChildren(...parts, head, ul);
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

/** the places last opened, as rows: each with its icon, name and what a tap does (a place since deleted is left out)
 * @param {Ctx} ctx @returns {{ ic: import('app-ui/icons/lucide.js').IconNodes, name: string, color: string, run: () => void }[]} */
function visited(ctx) {
  const data = ctx.data(), keys = /** @type {string[]} */ (ctx.app.settings.get('recentPlaces') ?? []);
  const tab = (/** @type {import('app-ui/icons/lucide.js').IconNodes} */ ic, /** @type {string} */ name, /** @type {string} */ id) => ({ ic, name, color: '', run: () => showPage(`${id}-page`) });
  return keys.flatMap(k => {
    const [kind, id = ''] = k.split(':');
    if (k === 'inbox') return [tab(ICONS.inbox, 'Inbox', 'inbox')];
    if (k === 'today') return [tab(MORE.sun, 'Today', 'today')];
    if (k === 'upcoming') return [tab(ICONS.calendar, 'Upcoming', 'upcoming')];
    if (k === 'filters') return [{ ic: MORE.layoutGrid, name: 'Filters & Labels', color: '', run: () => screens()?.push('#filters-page', { motion: 'fade' }) }];
    if (kind === 'project') { const p = data.projects.find(x => x.id === id); return p ? [{ ic: ICONS.hash, name: p.name, color: colorHex(p.color), run: () => ctx.openProject(id) }] : []; }
    if (kind === 'labels' || kind === 'filters') {
      const x = (kind === 'labels' ? data.labels : data.filters).find((/** @type {{ id: string }} */ y) => y.id === id);
      return x ? [{ ic: kind === 'labels' ? ICONS.tag : MORE.droplet, name: /** @type {any} */ (x).name, color: colorHex(/** @type {any} */ (x).color), run: () => ctx.openPlace(kind, id) }] : [];
    }
    return [];
  });
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
