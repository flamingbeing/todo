// dates.js: day maths, the tone and words of a due date, group headers. node --test app/test/dates.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, timeKey, addDays, daysBetween, isDay, isTime, weekdayName, shortDate, dateTone, dayWords, dueLine, dayTitle, timeText } from '../src/dates.js';

const T = '2026-11-01';   // a Sunday

test('days are local YYYY-MM-DD; addDays crosses months, years and leap days', () => {
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(timeKey(new Date(2026, 0, 5, 7, 3)), '07:03');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween(T, '2026-11-08'), 7);
  assert.equal(daysBetween(T, '2026-10-31'), -1);
  assert.equal(isDay('2026-11-01'), true);
  assert.equal(isDay('1/11/2026'), false);
  assert.equal(isTime('23:59'), true);
  assert.equal(isTime('24:00'), false);
  assert.equal(isTime('9:30'), false);
});

test('tones: overdue (before today, or today past its time), today, tomorrow, this week, later', () => {
  assert.equal(dateTone({ date: '2026-10-31' }, T), 'overdue');
  assert.equal(dateTone({ date: T, time: '08:00' }, T, '09:00'), 'overdue');
  assert.equal(dateTone({ date: T, time: '10:00' }, T, '09:00'), 'today');
  assert.equal(dateTone({ date: T }, T, '23:00'), 'today');
  assert.equal(dateTone({ date: '2026-11-02' }, T), 'tomorrow');
  assert.equal(dateTone({ date: '2026-11-03' }, T), 'week');
  assert.equal(dateTone({ date: '2026-11-07' }, T), 'week');
  assert.equal(dateTone({ date: '2026-11-08' }, T), 'later');
});

test('words: Today, Tomorrow, Yesterday, a weekday within 6 days, else the date (with the year when it differs)', () => {
  assert.equal(dayWords(T, T), 'Today');
  assert.equal(dayWords('2026-11-02', T), 'Tomorrow');
  assert.equal(dayWords('2026-10-31', T), 'Yesterday');
  assert.equal(dayWords('2026-11-03', T), 'Tuesday');
  assert.equal(dayWords('2026-11-07', T), 'Saturday');
  assert.equal(dayWords('2026-11-08', T), '8 Nov');
  assert.equal(dayWords('2026-10-20', T), '20 Oct');
  assert.equal(dayWords('2027-11-03', T), '3 Nov 2027');
  assert.equal(weekdayName(T), 'Sunday');
  assert.equal(shortDate('2026-01-09', T), '9 Jan');
});

test('a row’s date line: the time joins the words; the group’s own day is not repeated; repeats are marked', () => {
  const nine = timeText('09:00');
  assert.match(nine, /9/);
  assert.deepEqual(dueLine({ date: '2026-11-02', time: '09:00' }, T, { now: '08:00' }), { text: `Tomorrow ${nine}`, tone: 'tomorrow', repeats: false });
  assert.deepEqual(dueLine({ date: T, time: '09:00' }, T, { own: T, now: '08:00' }), { text: nine, tone: 'today', repeats: false });
  assert.deepEqual(dueLine({ date: T, rrule: 'FREQ=DAILY' }, T, { own: T }), { text: '', tone: 'today', repeats: true });
  assert.equal(dueLine(null, T), null);
  assert.equal(dueLine({ date: 'soon' }, T), null);
});

test('group headers: "1 Nov · Today · Sunday", "2 Nov · Tomorrow · Monday", "3 Nov · Tuesday"', () => {
  assert.equal(dayTitle(T, T), '1 Nov · Today · Sunday');
  assert.equal(dayTitle('2026-11-02', T), '2 Nov · Tomorrow · Monday');
  assert.equal(dayTitle('2026-11-03', T), '3 Nov · Tuesday');
  assert.equal(dayTitle('2027-01-01', T), '1 Jan 2027 · Friday');
});
