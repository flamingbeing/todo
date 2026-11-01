// Completed (#completed-page, from Browse): the tasks done, newest first, under the day each was done. A tap on a
// task's box brings it back (not done); a tap on the row opens it.
import { icon } from '@core/ui';
import { ICONS } from '../icons.js';
import { REFUSED } from '../items.js';
import { placeText } from '../tasks.js';
import { completedView } from '../arrange.js';
import { dayKey, dayTitle, timeText } from '../dates.js';
import { groupHead, emptyNote } from '../ui/row.js';
import { el } from './pick.js';

/** @typedef {import('./views.js').Ctx} Ctx */

/** @param {Ctx} ctx @param {HTMLElement} host @param {HTMLElement} empty */
export function drawCompleted(ctx, host, empty) {
  const data = ctx.data(), today = dayKey(), groups = completedView(data.tasks);
  host.replaceChildren(...groups.map(({ key, tasks }) => {
    const g = el('section', 'td-group');
    const title = key ? dayTitle(key, today) : 'Earlier';
    const ul = el('ul', 'td-rows');
    ul.setAttribute('aria-label', title);
    ul.append(...tasks.map(t => {
      const li = el('li', 'td-row is-done');
      li.dataset.id = t.id;
      const box = /** @type {HTMLButtonElement} */ (el('button', 'td-check'));
      box.type = 'button';
      box.setAttribute('role', 'checkbox');
      box.setAttribute('aria-checked', 'true');
      box.setAttribute('aria-label', `Not done: ${t.title}`);
      box.disabled = !ctx.canWrite();
      box.append(icon(ICONS.check, { class: 'td-check-mark' }));
      box.addEventListener('click', async () => { if (await ctx.app.tick(t, false)) ctx.toast(REFUSED); });
      const main = /** @type {HTMLButtonElement} */ (el('button', 'td-row-main'));
      main.type = 'button';
      main.append(el('span', 'td-title', t.title));
      const at = typeof t.doneAt === 'number' ? new Date(t.doneAt) : null;
      const when = at ? timeText(`${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`) : '';
      const metaLine = el('span', 'td-meta');
      metaLine.append(el('span', 'td-place', [placeText(t, data.projects, data.sections), when].filter(Boolean).join(' · ')));
      main.append(metaLine);
      main.addEventListener('click', () => ctx.openTask(t));
      li.append(box, main);
      return li;
    }));
    g.append(groupHead(title), ul);
    return g;
  }));
  empty.replaceChildren(...(groups.length ? [] : [emptyNote('Nothing completed yet', 'Tasks you complete show here')]));
}
