// The Search tab's matching: every word typed must be in the name (a task's description counts too), in any order,
// whatever the case and accents. Pure (no page), unit-tested.
import { isTask } from './tasks.js';
import { INBOX } from './items.js';
import { byOrder } from './order.js';
import { fold } from './query.js';

/** the words of a search, folded @param {string} text */
export const wordsOf = text => fold(String(text ?? '')).split(/\s+/).filter(Boolean);

/** whether every word is in the text @param {string[]} words @param {string} text */
export const hasAll = (words, text) => { const hay = fold(text); return words.every(w => hay.includes(w)); };

/**
 * What a search finds: open tasks, projects, labels and saved filters, each in its own order.
 * @param {string} text @param {import('./items.js').Data} data
 */
export function searchAll(text, data) {
  /** @template {{ name: string, order?: unknown }} T @param {T[]} list @returns {T[]} */
  const named = list => byOrder(list.filter(x => x && x.name && hasAll(words, x.name)));
  const words = wordsOf(text);
  if (!words.length) return { tasks: [], projects: [], labels: [], filters: [] };
  return {
    tasks: data.tasks.filter(t => isTask(t) && !t.done && hasAll(words, `${t.title}\n${t.description ?? ''}`))
      .sort((a, b) => Number(!hasAll(words, a.title)) - Number(!hasAll(words, b.title)) || (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)),
    projects: (named(data.projects.filter(p => p.id !== INBOX && !p.inbox))),
    labels: (named(data.labels)),
    filters: (named(data.filters)),
  };
}

/** the recent searches with this one first (at most 10, no repeats) @param {string[]} recent @param {string} text */
export const remember = (recent, text) => {
  const v = String(text ?? '').trim().slice(0, 200);
  return v ? [v, ...recent.filter(x => fold(x) !== fold(v))].slice(0, 10) : recent.slice(0, 10);
};

/** the places last opened with this one first (at most 6, no repeats): 'inbox', 'today', 'upcoming', 'filters' (Filters & Labels),
 * 'project:<id>', 'labels:<id>' or 'filters:<id>' @param {string[]} recent @param {string} place */
export const rememberPlace = (recent, place) => {
  const v = String(place ?? '').slice(0, 80);
  return v ? [v, ...recent.filter(x => x !== v)].slice(0, 6) : recent.slice(0, 6);
};
