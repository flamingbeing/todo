// Productivity (#productivity-page, from Reporting's chart button): Daily and Weekly tabs; a ring of the goal (today's or
// this week's finished tasks against the goal set in Settings > Productivity, this device), the streak, a link to every
// completed task, and the last 7 days (or 4 weeks) as bars split by project colour. Counts only, no points. Numbers come
// from stats.js.
import { icon, plural } from '@core/ui';
import { MORE } from '../icons-more.js';
import { dayKey, weekdayName, shortDate } from '../dates.js';
import { productivity, cleanGoal, bars } from '../stats.js';
import { colorHex } from '../colors.js';
import { emptyNote } from '../ui/row.js';
import { screens, openSettingsPage } from '../shell.js';
import { el } from './pick.js';

/** @typedef {import('./views.js').Ctx} Ctx */
const NS = 'http://www.w3.org/2000/svg';
/** @param {string} tag @param {Record<string, string | number>} attrs */
const sv = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); return e; };

/** the tab on show (this visit; Daily first) */
let weekly = false;

/** the goal ring: 96 px, a 6 px stroke, the part done in the accent over a hairline track, "3/5" and "tasks" inside
 * @param {number} n @param {number} goal @param {string} label */
export function ring(n, goal, label) {
  const R = 45, C = 2 * Math.PI * R, part = goal ? Math.min(1, n / goal) : (n ? 1 : 0);
  const box = el('div', 'td-ring');
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', goal ? `${label}: ${n} of ${goal} tasks` : `${label}: ${plural(n, 'task')}`);
  const svg = sv('svg', { viewBox: '0 0 96 96', width: 96, height: 96, 'aria-hidden': 'true' });
  svg.append(sv('circle', { cx: 48, cy: 48, r: R, class: 'td-ring-track' }),
    sv('circle', { cx: 48, cy: 48, r: R, class: 'td-ring-fill', 'stroke-dasharray': `${(C * part).toFixed(2)} ${C.toFixed(2)}`, transform: 'rotate(-90 48 48)' }));
  const mid = el('div', 'td-ring-text');
  mid.setAttribute('aria-hidden', 'true');
  mid.append(el('span', 'td-ring-n', goal ? `${n}/${goal}` : String(n)), el('span', 'td-ring-cap', n === 1 && !goal ? 'task' : 'tasks'));
  box.append(svg, mid);
  return box;
}

/** the bars, oldest first, left to right: one column each (the count over it, the day or week under it, today's bold), a
 * 24 px track (empty on a day with nothing done) filled from the bottom and split by project; a dashed line at the goal
 * (heights are plain CSS heights, nothing moves)
 * @param {import('../stats.js').Bar[]} list @param {number} goal @param {(pid: string) => { name: string, color: string }} proj
 * @param {string} today @param {boolean} wk  weeks (labels are the weeks' first days) */
export function barRows(list, goal, proj, today, wk) {
  const max = Math.max(1, goal, ...list.map(b => b.n));
  const box = el('div', `td-bars${wk ? ' is-weekly' : ''}`);
  box.setAttribute('role', 'list');
  if (goal) { const g = el('div', 'td-bars-goal'); g.style.setProperty('--at', String(goal / max)); g.setAttribute('aria-hidden', 'true'); box.append(g); }
  for (const b of list) {
    const r = el('div', `td-bars-row${b.today ? ' is-today' : ''}${b.off ? ' is-off' : ''}`);
    r.setAttribute('role', 'listitem');
    r.dataset.key = b.key;
    const word = wk ? `Week of ${shortDate(b.key, today)}` : b.key === today ? 'Today' : weekdayName(b.key);
    r.setAttribute('aria-label', `${word}: ${plural(b.n, 'task')}${b.parts.length > 1 ? ` (${b.parts.map(p => `${proj(p.pid).name} ${p.n}`).join(', ')})` : ''}${b.off ? ', day off' : ''}`);
    const n = el('b', 'td-bars-n', b.n ? String(b.n) : '');
    n.setAttribute('aria-hidden', 'true');
    const track = el('div', 'td-bars-track');
    const fill = el('div', 'td-bars-fill');
    fill.style.height = `${b.n / max * 100}%`;
    for (const p of b.parts) {
      const s = el('span', 'td-bars-part');
      s.style.flexGrow = String(p.n);
      s.style.background = proj(p.pid).color;
      s.dataset.pid = p.pid;
      fill.append(s);
    }
    track.append(fill);
    const lab = el('span', 'td-bars-l', wk ? shortDate(b.key, today) : weekdayName(b.key).slice(0, 2));
    lab.setAttribute('aria-hidden', 'true');
    r.append(n, track, lab);
    box.append(r);
  }
  return box;
}

/** @param {Ctx} ctx @param {HTMLElement} host */
export function drawProductivity(ctx, host) {
  const today = dayKey(), s = ctx.app.settings, data = ctx.data();
  const daysOff = /** @type {number[]} */ (s.get('daysOff') ?? []), vacation = !!s.get('vacation'), weekStart = s.get('weekStart') === 0 ? 0 : 1;
  const p = productivity(data.tasks, { today, daily: cleanGoal(s.get('dailyGoal')), weekly: cleanGoal(s.get('weeklyGoal')), weekStart, daysOff, vacation });
  const doneAll = data.tasks.filter(t => t && t.done && typeof t.doneAt === 'number').length;
  if (!doneAll) {
    const e = emptyNote('Nothing finished yet', 'Tasks you complete are counted here, day by day.', 'chart');
    e.classList.add('td-empty-page');
    host.replaceChildren(e);
    return;
  }
  /** @type {HTMLElement[]} */
  const parts = [];
  if (vacation) { const v = el('p', 'td-vacation-chip'); v.append(icon(MORE.palmtree), el('span', '', 'Vacation mode')); parts.push(v); }

  const all = /** @type {HTMLButtonElement} */ (el('button', 'td-link td-prod-all', `View all ${plural(doneAll, 'completed task')}`));
  all.type = 'button';
  all.addEventListener('click', () => screens()?.push('#completed-page'));

  // the tabs: Daily, Weekly
  const tabs = el('div', 'td-seg');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Period');
  for (const [w, label] of /** @type {[boolean, string][]} */ ([[false, 'Daily'], [true, 'Weekly']])) {
    const b = /** @type {HTMLButtonElement} */ (el('button', 'td-seg-item', label));
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(weekly === w));
    b.addEventListener('click', () => { if (weekly !== w) { weekly = w; drawProductivity(ctx, host); } });
    tabs.append(b);
  }
  parts.push(all, tabs);

  // the goal: the ring, a line, Edit goal
  const n = weekly ? p.week : p.today, goal = weekly ? p.weekly : p.daily, word = weekly ? 'Weekly goal' : 'Daily goal';
  const head = el('section', 'td-prod-goal');
  head.setAttribute('aria-label', word);
  head.append(ring(n, goal, word),
    el('p', 'td-prod-line', goal ? `${word}${n >= goal ? ' reached' : ''}: ${n}/${goal} tasks` : `${weekly ? 'This week' : 'Today'}: ${plural(n, 'task')} done`));
  const edit = /** @type {HTMLButtonElement} */ (el('button', 'td-link', goal ? 'Edit goal' : 'Set a goal'));
  edit.type = 'button';
  edit.addEventListener('click', () => { void openSettingsPage('Productivity'); });
  head.append(edit);
  parts.push(head);

  // the streak (as built: a flame and the days)
  const streak = el('div', 'td-streak');
  streak.append(icon(MORE.flame), el('span', 'td-streak-n', plural(p.streak, 'day')), el('span', 'td-streak-cap', p.streak ? 'streak' : 'no streak yet'));
  streak.append(el('span', 'td-streak-best', `Longest ${plural(p.best, 'day')}`));
  parts.push(streak);

  // the bars, split by project colour (the Inbox grey)
  const projects = new Map(data.projects.map(x => [x.id, x]));
  const proj = (/** @type {string} */ pid) => { const x = projects.get(pid); return { name: x?.name || (pid === 'inbox' ? 'Inbox' : 'Project'), color: x && pid !== 'inbox' ? colorHex(x.color) : 'var(--td-text-3)' }; };
  const card = el('section', 'td-prod-bars');
  const title = weekly ? 'Completed in the last 4 weeks' : 'Completed in the last 7 days';
  card.setAttribute('aria-label', title);
  card.append(el('h2', 'td-prod-h', title), barRows(bars(data.tasks, { today, weekly, weekStart, daysOff }), goal, proj, today, weekly));
  parts.push(card);
  host.replaceChildren(...parts);
}
