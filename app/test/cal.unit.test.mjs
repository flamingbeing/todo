// cal.js: the calendar layout's arithmetic. node --test app/test/cal.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RRule } from '../public/vendor/rrule/2.8.1/rrule.js';
import { GUTTER, columnCount, weekColumns, minutesOf, timeOf, yOf, minOf, snap, blockHeight, openAt, lanes, monthCells, dropPatch, unchanged,
  periodTitle, stepPeriod, periodOf, occurrences } from '../src/cal.js';

test('columns: 3 on a phone (112 px at 390), 7 from 600, 1 for Today', () => {
  assert.equal(columnCount(390), 3);
  assert.equal(columnCount(599), 3);
  assert.equal(columnCount(600), 7);
  assert.equal(columnCount(1200, true), 1);
  const w = weekColumns('2026-11-04', 390);
  assert.deepEqual(w.days, ['2026-11-04', '2026-11-05', '2026-11-06']);
  assert.equal(w.width, 112);
});

test('columns: 7 start on the week\'s first day (Monday or Sunday)', () => {
  const mon = weekColumns('2026-11-04', 700);
  assert.equal(mon.days.length, 7);
  assert.equal(mon.days[0], '2026-11-02');
  assert.equal(mon.width, (700 - GUTTER) / 7);
  assert.equal(weekColumns('2026-11-04', 700, { weekStart: 0 }).days[0], '2026-11-01');
});

test('columns: Today is one column the width less the gutter', () => {
  const d = weekColumns('2026-11-01', 390, { day: true });
  assert.deepEqual(d.days, ['2026-11-01']);
  assert.equal(d.width, 390 - GUTTER);
});

test('minutes and times', () => {
  assert.equal(minutesOf('10:30'), 630);
  assert.equal(minutesOf('00:00'), 0);
  assert.equal(minutesOf('9:30'), null);
  assert.equal(minutesOf(undefined), null);
  assert.equal(timeOf(630), '10:30');
  assert.equal(timeOf(5), '00:05');
});

test('48 px an hour: 30 minutes is 24 px, and back', () => {
  assert.equal(yOf(60), 48);
  assert.equal(yOf(30), 24);
  assert.equal(yOf(600), 480);
  assert.equal(minOf(24), 30);
  assert.equal(minOf(yOf(615)), 615);
});

test('snap to 15 minutes, within the day', () => {
  assert.equal(snap(607), 600);
  assert.equal(snap(608), 615);
  assert.equal(snap(-20), 0);
  assert.equal(snap(1439), 1425);
  assert.equal(snap(52, 5), 50);
});

test('a block\'s height: its duration, 30 minutes without one, at least 20 px, not past midnight', () => {
  assert.equal(blockHeight(600, 45), 36);
  assert.equal(blockHeight(600, null), 24);
  assert.equal(blockHeight(600, 10), 20);
  assert.equal(blockHeight(1410, 120), 24);
});

test('the grid opens an hour before now, or at an earlier first task, never above midnight', () => {
  assert.equal(openAt(11 * 60), yOf(600));
  assert.equal(openAt(11 * 60, 8 * 60), yOf(480));
  assert.equal(openAt(11 * 60, 13 * 60), yOf(600));
  assert.equal(openAt(20), 0);
});

test('lanes: blocks apart keep one lane each', () => {
  const l = lanes([{ id: 'a', start: 540, end: 600 }, { id: 'b', start: 600, end: 660 }]);
  assert.deepEqual(l.get('a'), { lane: 0, of: 1 });
  assert.deepEqual(l.get('b'), { lane: 0, of: 1 });
});

test('lanes: overlapping blocks sit side by side; a lane frees up for a later one', () => {
  const l = lanes([{ id: 'a', start: 540, end: 660 }, { id: 'b', start: 570, end: 600 }, { id: 'c', start: 600, end: 630 }, { id: 'd', start: 700, end: 730 }]);
  assert.deepEqual(l.get('a'), { lane: 0, of: 2 });
  assert.deepEqual(l.get('b'), { lane: 1, of: 2 });
  assert.deepEqual(l.get('c'), { lane: 1, of: 2 });
  assert.deepEqual(l.get('d'), { lane: 0, of: 1 });
});

test('lanes: three at once', () => {
  const l = lanes([{ id: 'a', start: 0, end: 60 }, { id: 'b', start: 10, end: 60 }, { id: 'c', start: 20, end: 60 }]);
  assert.deepEqual([...l.values()].map(v => v.of), [3, 3, 3]);
  assert.deepEqual(['a', 'b', 'c'].map(k => l.get(k)?.lane), [0, 1, 2]);
});

test('month cells from Monday: Nov 2026 is 6 weeks, from 26 Oct', () => {
  const m = monthCells('2026-11', 1, new Map());
  assert.equal(m.length, 6);
  assert.equal(m[0][0].key, '2026-10-26');
  assert.equal(m[0][0].inMonth, false);
  assert.equal(m[0][6].key, '2026-11-01');
  assert.equal(m[5][6].key, '2026-12-06');
});

test('month cells from Sunday: Nov 2026 is 5 weeks, from 1 Nov', () => {
  const m = monthCells('2026-11', 0, new Map());
  assert.equal(m.length, 5);
  assert.equal(m[0][0].key, '2026-11-01');
  assert.equal(m[0][0].inMonth, true);
});

test('month cells: up to 3 a day; more shows 2 and "+N more"', () => {
  const by = new Map([['2026-11-03', ['a', 'b', 'c']], ['2026-11-04', ['a', 'b', 'c', 'd', 'e']]]);
  const days = monthCells('2026-11', 1, by).flat();
  const d3 = days.find(c => c.key === '2026-11-03'), d4 = days.find(c => c.key === '2026-11-04');
  assert.deepEqual([d3?.shown, d3?.more], [['a', 'b', 'c'], 0]);
  assert.deepEqual([d4?.shown, d4?.more], [['a', 'b'], 3]);
  const short = monthCells('2026-11', 1, by, 2).flat().find(c => c.key === '2026-11-03');
  assert.deepEqual([short?.shown, short?.more], [['a'], 2]);
});

test('drop on a day keeps the time and the duration', () => {
  assert.deepEqual(dropPatch({ due: { date: '2026-11-03', time: '10:00' }, duration: 45 }, { date: '2026-11-05' }), { due: { date: '2026-11-05', time: '10:00' } });
  assert.deepEqual(dropPatch({ due: null }, { date: '2026-11-05' }), { due: { date: '2026-11-05' } });
});

test('drop in a slot sets the time; a task without a duration gets 30 minutes', () => {
  assert.deepEqual(dropPatch({ due: { date: '2026-11-03' } }, { date: '2026-11-04', min: 9 * 60 + 7 }), { due: { date: '2026-11-04', time: '09:00' }, duration: 30 });
  assert.deepEqual(dropPatch({ due: { date: '2026-11-03', time: '08:00' }, duration: 90 }, { date: '2026-11-03', min: 600 }), { due: { date: '2026-11-03', time: '10:00' } });
  assert.deepEqual(dropPatch({}, { date: '2026-11-04', min: 600 }), { due: { date: '2026-11-04', time: '10:00' }, duration: 30 });
});

test('drop on the all-day row drops the time and keeps a repeat', () => {
  const p = dropPatch({ due: { date: '2026-11-03', time: '10:00', rrule: 'FREQ=DAILY', string: 'every day' }, duration: 45 }, { date: '2026-11-04', allDay: true });
  assert.deepEqual(p, { due: { date: '2026-11-04', rrule: 'FREQ=DAILY', string: 'every day' } });
});

test('a drop where it was changes nothing', () => {
  const t = { due: { date: '2026-11-03', time: '10:00' }, duration: 30 };
  assert.ok(unchanged(t, dropPatch(t, { date: '2026-11-03', min: 600 })));
  assert.ok(!unchanged(t, dropPatch(t, { date: '2026-11-03', min: 615 })));
  assert.ok(!unchanged({ due: null }, dropPatch({ due: null }, { date: '2026-11-03' })));
});

test('the period title', () => {
  assert.equal(periodTitle('2026-11-04'), 'Nov 2026');
  assert.equal(periodTitle('2026-11-04', '2026-11-06'), 'Nov 2026');
  assert.equal(periodTitle('2026-10-30', '2026-11-01'), 'Oct – Nov 2026');
  assert.equal(periodTitle('2026-12-31', '2027-01-02'), 'Dec 2026 – Jan 2027');
});

test('paging: by days, and by month across a year', () => {
  assert.equal(stepPeriod('2026-11-04', 'week', 1, 3), '2026-11-07');
  assert.equal(stepPeriod('2026-11-02', 'week', -1, 7), '2026-10-26');
  assert.equal(stepPeriod('2026-11-01', 'day', 1), '2026-11-02');
  assert.equal(stepPeriod('2026-12-01', 'month', 1), '2027-01-01');
  assert.equal(stepPeriod('2026-01-01', 'month', -1), '2025-12-01');
});

test('the period a day is in', () => {
  assert.equal(periodOf('2026-11-18', 'month', 0), '2026-11-01');
  assert.equal(periodOf('2026-11-04', 'week', 7), '2026-11-02');
  assert.equal(periodOf('2026-11-04', 'week', 7, 0), '2026-11-01');
  assert.equal(periodOf('2026-11-04', 'week', 3), '2026-11-04');
});

test('future occurrences of a repeating task in a range, after its own date', () => {
  assert.deepEqual(occurrences({ date: '2026-11-02', rrule: 'FREQ=WEEKLY;BYDAY=MO' }, '2026-11-01', '2026-11-30', RRule), ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
  assert.deepEqual(occurrences({ date: '2026-11-01', rrule: 'FREQ=DAILY;INTERVAL=3' }, '2026-11-05', '2026-11-12', RRule), ['2026-11-07', '2026-11-10']);
});

test('no future occurrences: not repeating, repeating from done, or a bad rule', () => {
  assert.deepEqual(occurrences({ date: '2026-11-02' }, '2026-11-01', '2026-11-30', RRule), []);
  assert.deepEqual(occurrences({ date: '2026-11-02', rrule: 'FREQ=DAILY', fromDone: true }, '2026-11-01', '2026-11-30', RRule), []);
  assert.deepEqual(occurrences({ date: '2026-11-02', rrule: 'NONSENSE' }, '2026-11-01', '2026-11-30', RRule), []);
  assert.deepEqual(occurrences(null, '2026-11-01', '2026-11-30', RRule), []);
});

test('month cells: February 2027 from Monday fits 4 weeks', () => {
  const m = monthCells('2027-02', 1, new Map());
  assert.equal(m.length, 4);
  assert.ok(m.flat().every(c => c.inMonth));
});

test('lanes: nothing in, nothing out', () => {
  assert.equal(lanes([]).size, 0);
});
