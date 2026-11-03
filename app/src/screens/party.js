// Settings > Productivity "Goal celebrations" (option goalParty, this device): when a completion meets the daily goal,
// a short burst of the app's colours over the page (the undo toast says so too). Movement is opacity and transform only.
// Loaded the first time a goal is met (views.js lazyModules "party").
import { dayKey } from '../dates.js';

const COLOURS = ['#dc4c3e', '#f2a33a', '#3d9e5f', '#2f7fd8', '#8b5cf6'];

/** the tasks done today @param {{ done?: boolean, doneAt?: unknown }[]} tasks */
export const doneToday = tasks => { const today = dayKey(); return tasks.filter(t => t.done && typeof t.doneAt === 'number' && dayKey(new Date(t.doneAt)) === today).length; };

/** whether this completion just met the daily goal (goal 0: none) @param {number} before @param {number} after @param {number} goal */
export const metNow = (before, after, goal) => goal > 0 && before < goal && after >= goal;

/** the burst */
export function cheer() {
  const box = document.createElement('div');
  box.className = 'td-party';
  box.setAttribute('aria-hidden', 'true');
  const n = 18;
  for (let i = 0; i < n; i++) {
    const bit = document.createElement('span');
    bit.className = 'td-party-bit';
    bit.style.background = COLOURS[i % COLOURS.length];
    const a = (i / n) * Math.PI * 2, r = 90 + (i % 3) * 30;
    bit.animate([{ transform: 'translate(0, 0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * r}px, ${Math.sin(a) * r}px) scale(.4)`, opacity: 0 }],
      { duration: 900, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
    box.append(bit);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 1000);
}
