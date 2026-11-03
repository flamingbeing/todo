// Productivity (#productivity-page, from Browse): what was finished today and this week, the goals set in Settings (this
// device), the streak, and the last 7 days as bars in plain SVG. Counts only, no points. Numbers come from stats.js.
import { icon, plural } from '@core/ui';
import { MORE } from '../icons-more.js';
import { dayKey, weekdayName } from '../dates.js';
import { productivity, cleanGoal } from '../stats.js';
import { el } from './pick.js';

/** @typedef {import('./views.js').Ctx} Ctx */
const NS = 'http://www.w3.org/2000/svg';
/** @param {string} tag @param {Record<string, string | number>} attrs */
const sv = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); return e; };

/** a stat tile: big number, caption, and a goal bar when there is a goal @param {string} caption @param {number} n @param {number} goal */
function tile(caption, n, goal) {
  const t = el('div', 'td-stat');
  t.append(el('div', 'td-stat-n', String(n)), el('div', 'td-stat-cap', caption));
  if (goal) {
    const bar = el('div', 'td-stat-bar');
    const fill = el('div', 'td-stat-fill');
    fill.style.width = `${Math.min(100, Math.round(n / goal * 100))}%`;
    bar.append(fill);
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', String(goal)); bar.setAttribute('aria-valuenow', String(Math.min(n, goal)));
    bar.setAttribute('aria-label', `${caption}: ${n} of ${goal}`);
    t.append(bar, el('div', 'td-stat-goal', n >= goal ? `Goal of ${goal} reached` : `${n} of ${goal}`));
  }
  return t;
}

/** the 7-day bar chart @param {{ day: string, n: number }[]} days @param {number} max @param {number} daily @param {string} today */
export function chart(days, max, daily, today) {
  const W = 280, H = 140, top = 18, base = 112, bw = 24, gap = (W - 7 * bw) / 8, h = base - top;
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'td-chart', role: 'img',
    'aria-label': `Tasks finished in the last 7 days: ${days.map(d => `${d.day === today ? 'today' : weekdayName(d.day)} ${d.n}`).join(', ')}` });
  svg.append(sv('line', { x1: 0, x2: W, y1: base + .5, y2: base + .5, class: 'td-chart-axis' }));
  if (daily) svg.append(sv('line', { x1: 0, x2: W, y1: base - daily / max * h, y2: base - daily / max * h, class: 'td-chart-goal' }));
  days.forEach((d, i) => {
    const x = gap + i * (bw + gap), bh = d.n ? Math.max(3, d.n / max * h) : 0;
    if (bh) svg.append(sv('rect', { x, y: base - bh, width: bw, height: bh, rx: 4, class: `td-chart-bar${d.day === today ? ' is-today' : ''}` }));
    const n = sv('text', { x: x + bw / 2, y: base - bh - 4, class: 'td-chart-n', 'text-anchor': 'middle' });
    if (d.n) { n.textContent = String(d.n); svg.append(n); }
    const l = sv('text', { x: x + bw / 2, y: base + 16, class: 'td-chart-l', 'text-anchor': 'middle' });
    l.textContent = weekdayName(d.day).slice(0, 3);
    svg.append(l);
  });
  return svg;
}

/** @param {Ctx} ctx @param {HTMLElement} host */
export function drawProductivity(ctx, host) {
  const today = dayKey(), s = ctx.app.settings;
  const p = productivity(ctx.data().tasks, { today, daily: cleanGoal(s.get('dailyGoal')), weekly: cleanGoal(s.get('weeklyGoal')), weekStart: s.get('weekStart') === 0 ? 0 : 1,
    daysOff: /** @type {number[]} */ (s.get('daysOff') ?? []), vacation: !!s.get('vacation') });
  const tiles = el('div', 'td-stats');
  tiles.append(tile('Done today', p.today, p.daily), tile('Done this week', p.week, p.weekly));
  const streak = el('div', 'td-card td-streak');
  streak.append(icon(MORE.flame), el('span', 'td-streak-n', plural(p.streak, 'day')), el('span', 'td-streak-cap', p.streak ? 'streak' : 'no streak yet'));
  streak.append(el('span', 'td-streak-best', `Best ${plural(p.best, 'day')}`));
  const card = el('section', 'td-card td-chart-card');
  card.setAttribute('aria-label', 'Last 7 days');
  card.append(el('h2', 'td-chart-head', 'Last 7 days'), chart(p.days, p.max, p.daily, today));
  const note = el('p', 'td-stats-note', p.daily || p.weekly
    ? 'A day counts toward the streak when you reach your daily goal.'
    : 'No goals set. Pick a daily or weekly goal in Settings, General. A day with any finished task counts toward the streak.');
  host.replaceChildren(tiles, streak, card, note);
}
