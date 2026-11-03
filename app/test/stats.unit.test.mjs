import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productivity, doneByDay, cleanGoal } from '../src/stats.js';

const at = (d, t = '12:00') => new Date(`${d}T${t}:00`).getTime();
const done = (d, t) => ({ id: `t${Math.random()}`, title: 'x', done: true, doneAt: at(d, t) });
const open = () => ({ id: 'o', title: 'y', done: false });

test('cleanGoal: a whole number up to 999, else none', () => {
  assert.equal(cleanGoal(5), 5); assert.equal(cleanGoal('7'), 7); assert.equal(cleanGoal(-2), 0);
  assert.equal(cleanGoal('x'), 0); assert.equal(cleanGoal(5000), 999); assert.equal(cleanGoal(2.6), 3);
});

test('doneByDay counts completed tasks by local day, ignoring open ones and ones with no time', () => {
  const m = doneByDay([done('2026-11-02', '00:05'), done('2026-11-02', '23:55'), done('2026-11-01'), open(), { id: 'z', done: true }]);
  assert.equal(m.get('2026-11-02'), 2); assert.equal(m.get('2026-11-01'), 1); assert.equal(m.size, 2);
});

test('today, this week (Monday start; Sunday start) and the last 7 days', () => {
  // 2026-11-02 is a Monday
  const tasks = [done('2026-11-02'), done('2026-11-02'), done('2026-11-01'), done('2026-10-30'), done('2026-10-20')];
  const p = productivity(tasks, { today: '2026-11-02' });
  assert.equal(p.today, 2); assert.equal(p.week, 2);
  assert.deepEqual(p.days.map(d => d.n), [0, 0, 0, 1, 0, 1, 2]);
  assert.equal(p.days[0].day, '2026-10-27'); assert.equal(p.days[6].day, '2026-11-02');
  assert.equal(productivity(tasks, { today: '2026-11-02', weekStart: 0 }).week, 3);   // Sunday 1 Nov starts that week
  assert.equal(productivity(tasks, { today: '2026-11-02' }).max, 2);
});

test('streak: consecutive days meeting the goal; today may still be open', () => {
  const t = [done('2026-11-02'), done('2026-11-01'), done('2026-10-31'), done('2026-10-29')];
  assert.equal(productivity(t, { today: '2026-11-02' }).streak, 3);
  assert.equal(productivity(t, { today: '2026-11-03' }).streak, 3);   // nothing yet on the 3rd: runs up to yesterday
  assert.equal(productivity(t, { today: '2026-11-04' }).streak, 0);
  assert.equal(productivity(t, { today: '2026-11-02' }).best, 3);
});

test('streak with a daily goal needs that many each day', () => {
  const t = [done('2026-11-02'), done('2026-11-02'), done('2026-11-01'), done('2026-10-31'), done('2026-10-31')];
  assert.equal(productivity(t, { today: '2026-11-02', daily: 2 }).streak, 1);
  assert.equal(productivity(t, { today: '2026-11-02', daily: 1 }).streak, 3);
});

test('goals come back cleaned, and no tasks give zeros', () => {
  const p = productivity([], { today: '2026-11-02', daily: 3, weekly: -1 });
  assert.deepEqual([p.today, p.week, p.streak, p.best, p.daily, p.weekly], [0, 0, 0, 0, 3, 0]);
  assert.equal(p.days.length, 7);
});

test('days off never break the streak; vacation holds it over the days since the last one met', () => {
  // 2026-11-02 Mon ... 2026-11-06 Fri; 2026-11-07 Sat and 2026-11-08 Sun off
  const tasks = ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09'].map(d => done(d));
  assert.equal(productivity(tasks, { today: '2026-11-09' }).streak, 1, 'the weekend breaks it');
  const off = productivity(tasks, { today: '2026-11-09', daysOff: [0, 6] });
  assert.equal(off.streak, 4);
  assert.equal(off.best, 4);
  const away = ['2026-11-01', '2026-11-02'].map(d => done(d));
  assert.equal(productivity(away, { today: '2026-11-06' }).streak, 0);
  assert.equal(productivity(away, { today: '2026-11-06', vacation: true }).streak, 2);
  assert.equal(productivity([], { today: '2026-11-06', vacation: true }).streak, 0);
});

test('doneByDayProject: per day, per project (the Inbox when none)', async () => {
  const { doneByDayProject } = await import('../src/stats.js');
  const m = doneByDayProject([{ ...done('2026-11-02'), projectId: 'p1' }, { ...done('2026-11-02'), projectId: 'p1' }, done('2026-11-02'), { ...done('2026-11-01'), projectId: 'p2' }, open()]);
  assert.equal(m.get('2026-11-02').get('p1'), 2); assert.equal(m.get('2026-11-02').get('inbox'), 1);
  assert.equal(m.get('2026-11-01').get('p2'), 1); assert.equal(m.size, 2);
});

test('bars: 7 days newest first, split by project (largest first), today and days off marked', async () => {
  const { bars } = await import('../src/stats.js');
  const tasks = [{ ...done('2026-11-02'), projectId: 'a' }, { ...done('2026-11-02'), projectId: 'b' }, { ...done('2026-11-02'), projectId: 'b' }, done('2026-11-01')];
  const b = bars(tasks, { today: '2026-11-02', daysOff: [0] });   // 1 Nov 2026 is a Sunday
  assert.equal(b.length, 7);
  assert.deepEqual(b.map(x => x.key).slice(0, 2), ['2026-11-02', '2026-11-01']);
  assert.deepEqual(b[0].parts, [{ pid: 'b', n: 2 }, { pid: 'a', n: 1 }]);
  assert.equal(b[0].n, 3); assert.equal(b[0].today, true); assert.equal(b[1].today, false);
  assert.equal(b[1].off, true); assert.equal(b[0].off, false);
  assert.equal(b[6].key, '2026-10-27'); assert.equal(b[6].n, 0); assert.deepEqual(b[6].parts, []);
});

test('bars weekly: 4 weeks from the week start, this week first; days off do not mark weeks', async () => {
  const { bars } = await import('../src/stats.js');
  const tasks = [done('2026-11-03'), done('2026-11-02'), done('2026-11-01'), done('2026-10-26'), done('2026-10-05')];
  const mon = bars(tasks, { today: '2026-11-03', weekly: true, daysOff: [0, 1] });
  assert.deepEqual(mon.map(x => x.key), ['2026-11-02', '2026-10-26', '2026-10-19', '2026-10-12']);
  assert.deepEqual(mon.map(x => x.n), [2, 2, 0, 0]);
  assert.equal(mon[0].today, true); assert.ok(mon.every(x => !x.off));
  const sun = bars(tasks, { today: '2026-11-03', weekly: true, weekStart: 0 });
  assert.equal(sun[0].key, '2026-11-01'); assert.equal(sun[0].n, 3);
});

test('vacation and days off change the streak, not the bars', async () => {
  const { bars } = await import('../src/stats.js');
  const tasks = [done('2026-11-02'), done('2026-10-30')];
  const plain = bars(tasks, { today: '2026-11-02' }).map(x => x.n);
  assert.deepEqual(bars(tasks, { today: '2026-11-02', daysOff: [6, 0] }).map(x => x.n), plain);
  const p = productivity(tasks, { today: '2026-11-02', daysOff: [6, 0] });
  assert.equal(p.streak, 2);
});
