// dates.js: day maths, the tone and words of a due date, group headers. node --test app/test/dates.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, timeKey, addDays, daysBetween, isDay, isTime, weekdayName, shortDate, dateTone, dayWords, deadlineLine, dueLine, dayTitle, dayHeading, timeText, minutesClock, minutesText, weekOf, nextWeekOf, weekendOf } from '../src/dates.js';
import { minutesSpan, monthGrid, monthTitle } from '../src/dates-cal.js';

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
  assert.equal(dueLine({ date: T, time: '10:00' }, T, { own: T, dur: 45 }).text, `${timeText('10:00')}–${timeText('10:45')}`, 'a duration: the end time');
  assert.equal(dueLine({ date: T, time: '23:30' }, T, { own: T, dur: 60 }).text, `${timeText('23:30')}–${timeText('00:30')}`, 'past midnight');
  assert.equal(dueLine({ date: T }, T, { own: T, dur: 45 }).text, '', 'no time: no range');
  assert.equal(dueLine(null, T), null);
  // the calendar's minutes in the same clock as the rows (12-hour in en-US, not the stored 24-hour HH:MM)
  assert.equal(minutesClock(13 * 60 + 30), timeText('13:30'));
  assert.equal(minutesClock(0), timeText('00:00'));
  assert.match(minutesSpan(10 * 60, 10 * 60 + 45), /10:00\D+10:45|10:00.*10:45/, 'a block\'s span');
  assert.match(new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, 13, 30)), /^1:30\sPM$/, 'en-US: the format the calendar spec checks');
  assert.equal(dueLine({ date: 'soon' }, T), null);
});

test('the single day heading over Today: "Monday, 2 Nov", the year only in another one', () => {
  assert.equal(dayHeading('2026-11-02', '2026-11-02'), 'Monday, 2 Nov');
  assert.equal(dayHeading('2027-01-01', '2026-11-02'), 'Friday, 1 Jan 2027');
});

test('group headers: "1 Nov · Today · Sunday", "2 Nov · Tomorrow · Monday", "3 Nov · Tuesday"', () => {
  assert.equal(dayTitle(T, T), '1 Nov · Today · Sunday');
  assert.equal(dayTitle('2026-11-02', T), '2 Nov · Tomorrow · Monday');
  assert.equal(dayTitle('2026-11-03', T), '3 Nov · Tuesday');
  assert.equal(dayTitle('2027-01-01', T), '1 Jan 2027 · Friday');
});

test('a week starts on Monday or Sunday as set', () => {
  // 2026-11-04 is a Wednesday
  assert.equal(weekOf('2026-11-04', 1), '2026-11-02');
  assert.equal(weekOf('2026-11-04', 0), '2026-11-01');
  assert.equal(weekOf('2026-11-02', 1), '2026-11-02', 'a Monday is its own week\'s start');
  assert.equal(weekOf('2026-11-01', 1), '2026-10-26', 'a Sunday is the end of a Monday week');
  assert.equal(weekOf('2026-11-01', 0), '2026-11-01');
  assert.equal(weekOf('2027-01-01', 1), '2026-12-28', 'across a year');
});

test('a month grid: whole weeks from the 1st\'s week to the last day\'s', () => {
  const mon = monthGrid('2026-11', 1), sun = monthGrid('2026-11', 0);
  assert.deepEqual([mon[0][0], mon.at(-1)?.at(-1), mon.length], ['2026-10-26', '2026-12-06', 6]);
  assert.deepEqual([sun[0][0], sun.at(-1)?.at(-1), sun.length], ['2026-11-01', '2026-12-05', 5]);
  assert.ok(mon.every(w => w.length === 7));
  assert.equal(monthGrid('2027-02', 1).length, 4, 'February 2027 starts on a Monday and fills four weeks');
  assert.equal(monthTitle('2026-11-04'), 'November 2026');
});

test('a deadline in words: today, tomorrow, "in N days" within two weeks, else the date; past is red', () => {
  assert.deepEqual(deadlineLine(T, T), { text: 'Today', tone: 'deadline' });
  assert.deepEqual(deadlineLine('2026-11-02', T), { text: 'Tomorrow', tone: 'deadline' });
  assert.deepEqual(deadlineLine('2026-11-06', T), { text: 'in 5 days', tone: 'deadline' });
  assert.deepEqual(deadlineLine('2026-11-15', T), { text: 'in 14 days', tone: 'deadline' });
  assert.deepEqual(deadlineLine('2026-11-16', T), { text: '16 Nov', tone: 'deadline' });
  assert.deepEqual(deadlineLine('2027-01-02', T), { text: '2 Jan 2027', tone: 'deadline' });
  assert.deepEqual(deadlineLine('2026-10-30', T), { text: '30 Oct', tone: 'overdue' });
  for (const bad of [null, undefined, '', '2026-13-45', 5]) assert.equal(deadlineLine(bad, T), null);
});

test('a duration in words', () => {
  assert.deepEqual([15, 45, 60, 90, 150, 180].map(minutesText), ['15 min', '45 min', '1 h', '1 h 30 min', '2 h 30 min', '3 h']);
});

test('nextWeekOf / weekendOf: the day General sets for "Next week" and "This weekend"', () => {
  // 2026-11-02 Mon ... 2026-11-07 Sat, 2026-11-08 Sun
  assert.equal(nextWeekOf('2026-11-02'), '2026-11-09', 'Monday: the next Monday, never today');
  assert.equal(nextWeekOf('2026-11-04', 5), '2026-11-06', 'Friday as next week, from a Wednesday');
  assert.equal(nextWeekOf('2026-11-08', 0), '2026-11-15');
  assert.equal(weekendOf('2026-11-04'), '2026-11-07');
  assert.equal(weekendOf('2026-11-04', 0), '2026-11-08');
  assert.equal(weekendOf('2026-11-07'), '2026-11-14', 'on a Saturday: the next weekend');
  assert.equal(weekendOf('2026-11-08', 0), '2026-11-15');
});
