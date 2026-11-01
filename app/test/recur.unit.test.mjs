// recur.js: "every …" words to a rule and back, and the next date once done. node --test app/test/recur.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { findRecur, describe, nextDay, firstDay, presets, buildRule, ruleChoices, dayOf, timeOf } from '../src/recur.js';
import { RRule } from '../public/vendor/rrule/2.8.1/rrule.js';

const today = '2026-11-01';   // a Sunday
/** @param {string} text */
const rule = text => findRecur(text, { today })?.recur ?? null;

test('the basic rules', () => {
  const cases = {
    'every day': 'FREQ=DAILY', daily: 'FREQ=DAILY', 'every weekday': 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', 'every workday': 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    'every week': 'FREQ=WEEKLY', weekly: 'FREQ=WEEKLY', 'every month': 'FREQ=MONTHLY', monthly: 'FREQ=MONTHLY',
    'every year': 'FREQ=YEARLY', yearly: 'FREQ=YEARLY', annually: 'FREQ=YEARLY', 'every quarter': 'FREQ=MONTHLY;INTERVAL=3', quarterly: 'FREQ=MONTHLY;INTERVAL=3',
    'every other day': 'FREQ=DAILY;INTERVAL=2', 'every other week': 'FREQ=WEEKLY;INTERVAL=2', 'every other month': 'FREQ=MONTHLY;INTERVAL=2',
    'every other year': 'FREQ=YEARLY;INTERVAL=2', 'every other fri': 'FREQ=WEEKLY;INTERVAL=2;BYDAY=FR',
    'every 3 days': 'FREQ=DAILY;INTERVAL=3', 'every 2 weeks': 'FREQ=WEEKLY;INTERVAL=2', 'every 6 months': 'FREQ=MONTHLY;INTERVAL=6', 'every 1 day': 'FREQ=DAILY',
    'every 2 years': 'FREQ=YEARLY;INTERVAL=2',
  };
  for (const [words, want] of Object.entries(cases)) assert.equal(rule(words)?.rrule, want, words);
});

test('lists: weekdays, days of the month and of the year, first and last workday, nth weekday', () => {
  const cases = {
    'every mon, fri': 'FREQ=WEEKLY;BYDAY=MO,FR', 'ev mon, fri': 'FREQ=WEEKLY;BYDAY=MO,FR', 'every monday and wednesday': 'FREQ=WEEKLY;BYDAY=MO,WE',
    'every tue thu': 'FREQ=WEEKLY;BYDAY=TU,TH', 'every sunday': 'FREQ=WEEKLY;BYDAY=SU',
    'every 2, 15, 27': 'FREQ=MONTHLY;BYMONTHDAY=2,15,27', 'every 15th': 'FREQ=MONTHLY;BYMONTHDAY=15', 'every 27': 'FREQ=MONTHLY;BYMONTHDAY=27',
    'every 14 jan': 'FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=14', 'every jan 14th': 'FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=14', 'every 14 jan, 14 apr': 'FREQ=YEARLY;BYMONTH=1,4;BYMONTHDAY=14',
    'every first workday': 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1', 'every last workday': 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1',
    'every 1st wed': 'FREQ=MONTHLY;BYDAY=+1WE', 'every 3rd thu jul': 'FREQ=YEARLY;BYMONTH=7;BYDAY=+3TH', 'every last fri': 'FREQ=MONTHLY;BYDAY=-1FR',
    'every 1st wed jan': 'FREQ=YEARLY;BYMONTH=1;BYDAY=+1WE', 'every last day': 'FREQ=MONTHLY;BYMONTHDAY=-1',
  };
  for (const [words, want] of Object.entries(cases)) assert.equal(rule(words)?.rrule, want, words);
});

test('a time, a start, an end, and for N weeks', () => {
  assert.deepEqual(rule('every mon, fri at 20:00'), { rrule: 'FREQ=WEEKLY;BYDAY=MO,FR', fromDone: false, string: 'every mon, fri at 20:00', time: '20:00' });
  assert.equal(rule('every fri at noon')?.time, '12:00');
  assert.equal(rule('every day 5pm')?.time, '17:00');
  assert.equal(rule('every day at 9')?.time, '09:00');
  assert.equal(rule('every last workday at 3pm')?.time, '15:00');
  assert.equal(rule('every day starting aug 3')?.start, '2027-08-03');
  assert.equal(rule('every day from 3 aug')?.start, '2027-08-03');
  assert.equal(rule('every day ending aug 3')?.rrule, 'FREQ=DAILY;UNTIL=20270803T235959Z');
  assert.equal(rule('every day until 20 nov')?.rrule, 'FREQ=DAILY;UNTIL=20261120T235959Z');
  assert.equal(rule('every day for 3 weeks')?.rrule, 'FREQ=DAILY;UNTIL=20261121T235959Z');
  const both = rule('every day from 10 may until 20 may');
  assert.equal(both?.start, '2027-05-10');
  assert.equal(both?.rrule, 'FREQ=DAILY;UNTIL=20270520T235959Z');
});

test('every! and after N days count from completion', () => {
  assert.deepEqual(rule('every! week'), { rrule: 'FREQ=WEEKLY', fromDone: true, string: 'every! week' });
  assert.equal(rule('every! 3 days')?.fromDone, true);
  assert.deepEqual(rule('after 10 days'), { rrule: 'FREQ=DAILY;INTERVAL=10', fromDone: true, string: 'after 10 days' });
});

test('where the words are in a longer text, in the case typed', () => {
  const hit = findRecur('Water plants Every Mon at 8am #Home', { today });
  assert.equal(hit?.index, 13);
  assert.equal(hit?.recur.string, 'Every Mon at 8am');
  assert.equal(hit?.recur.time, '08:00');
  assert.equal(findRecur('everyone is here', { today }), null);
  assert.equal(findRecur('every', { today }), null);
});

test('what this grammar does not say stays words', () => {
  for (const words of ['every hour', 'every 12 hours starting at 9pm', 'every mon at 8pm, tue at 9pm', 'every day except fri',
    'every day every week', 'every 2 months on first friday', 'every 3 workday', 'every banana']) assert.equal(rule(words), null, words);
});

test('back to plain words', () => {
  const said = (/** @type {string} */ words) => { const r = rule(words); return r ? describe(r) : null; };
  assert.equal(said('every day'), 'Every day');
  assert.equal(said('every 3 days'), 'Every 3 days');
  assert.equal(said('every weekday'), 'Every weekday');
  assert.equal(said('every mon, fri at 20:00'), 'Every Monday, Friday at 20:00');
  assert.equal(said('every other week'), 'Every other week');
  assert.equal(said('every other fri'), 'Every other Friday');
  assert.equal(said('every quarter'), 'Every quarter');
  assert.equal(said('every 15th'), 'Every month on the 15th');
  assert.equal(said('every 2, 22'), 'Every month on the 2nd, 22nd');
  assert.equal(said('every last day'), 'Every month on the last day');
  assert.equal(said('every last workday'), 'Every month on the last workday');
  assert.equal(said('every 1st wed'), 'Every month on the 1st Wednesday');
  assert.equal(said('every 14 jan'), 'Every year on 14 Jan');
  assert.equal(said('every 3rd thu jul'), 'Every year on the 3rd Thursday of Jul');
  assert.equal(said('every day until 20 nov'), 'Every day until 20 Nov');
  assert.equal(said('every! 3 days'), 'Every 3 days, counted from completion');
  assert.equal(describe({ rrule: 'FREQ=WEEKLY;INTERVAL=3;BYDAY=MO' }), 'Every 3 weeks on Monday');
});

test('the first day a rule falls on (today counts)', () => {
  assert.equal(firstDay('FREQ=DAILY', today, RRule), today);
  assert.equal(firstDay('FREQ=WEEKLY;BYDAY=MO', today, RRule), '2026-11-02');
  assert.equal(firstDay('FREQ=WEEKLY;BYDAY=SU', today, RRule), today);
  assert.equal(firstDay('FREQ=MONTHLY;BYMONTHDAY=15', today, RRule), '2026-11-15');
  assert.equal(firstDay('FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=14', today, RRule), '2027-01-14');
  assert.equal(firstDay('FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1', today, RRule), '2026-11-30');
});

test('next date: every counts from the due day, every! from the day done', () => {
  // every week on Monday, due Mon 2 Nov, done a day late on Tue 3 Nov: the next Monday
  assert.equal(nextDay({ date: '2026-11-02', rrule: 'FREQ=WEEKLY;BYDAY=MO' }, { done: '2026-11-03', today: '2026-11-03' }, RRule), '2026-11-09');
  // every! week, done Tuesday: the next Tuesday
  assert.equal(nextDay({ date: '2026-11-02', rrule: 'FREQ=WEEKLY', fromDone: true }, { done: '2026-11-03', today: '2026-11-03' }, RRule), '2026-11-10');
  // every 3 days from the due day
  assert.equal(nextDay({ date: '2026-11-01', rrule: 'FREQ=DAILY;INTERVAL=3' }, { done: '2026-11-01', today }, RRule), '2026-11-04');
  // every month on the 31st skips short months
  assert.equal(nextDay({ date: '2026-10-31', rrule: 'FREQ=MONTHLY;BYMONTHDAY=31' }, { done: today, today }, RRule), '2026-12-31');
  // a moved occurrence: an absolute rule comes back to its days, a relative one goes on from the moved day
  assert.equal(nextDay({ date: '2026-11-04', rrule: 'FREQ=WEEKLY;BYDAY=TU' }, { done: '2026-11-04', today: '2026-11-04' }, RRule), '2026-11-10');
  assert.equal(nextDay({ date: '2026-11-04', rrule: 'FREQ=WEEKLY' }, { done: '2026-11-04', today: '2026-11-04' }, RRule), '2026-11-11');
});

test('next date: still past jumps to the first match from today; past the end there is none', () => {
  // every day, due three weeks ago: today
  assert.equal(nextDay({ date: '2026-10-10', rrule: 'FREQ=DAILY' }, { done: today, today }, RRule), today);
  // every Monday, months behind: the coming Monday
  assert.equal(nextDay({ date: '2026-08-03', rrule: 'FREQ=WEEKLY;BYDAY=MO' }, { done: today, today }, RRule), '2026-11-02');
  // until 5 Nov: from the 4th the next is the 5th, from the 5th there is none
  assert.equal(nextDay({ date: '2026-11-04', rrule: 'FREQ=DAILY;UNTIL=20261105T235959Z' }, { done: '2026-11-04', today: '2026-11-04' }, RRule), '2026-11-05');
  assert.equal(nextDay({ date: '2026-11-05', rrule: 'FREQ=DAILY;UNTIL=20261105T235959Z' }, { done: '2026-11-05', today: '2026-11-05' }, RRule), null);
  // for 2 weeks from today, every Monday: two Mondays, then none
  const r = /** @type {any} */ (rule('every mon for 2 weeks'));
  assert.equal(nextDay({ date: '2026-11-02', rrule: r.rrule }, { done: '2026-11-02', today: '2026-11-02' }, RRule), '2026-11-09');
  assert.equal(nextDay({ date: '2026-11-09', rrule: r.rrule }, { done: '2026-11-09', today: '2026-11-09' }, RRule), null);
  assert.equal(nextDay({ date: today }, { done: today, today }, RRule), null);
});

test('the repeat menu, the custom screen and back', () => {
  const p = presets('2026-11-05');   // a Thursday
  assert.deepEqual(p.map(x => x.label), ['Every day', 'Every week on Thu', 'Every weekday (Mon - Fri)', 'Every month on the 5th', 'Every year on 5 Nov']);
  assert.equal(p[1].rrule, 'FREQ=WEEKLY;BYDAY=TH');
  const built = buildRule({ unit: 'week', every: 2, days: [5, 1], until: '2027-01-31' });
  assert.equal(built, 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;UNTIL=20270131T235959Z');
  assert.deepEqual(ruleChoices(built), { unit: 'week', every: 2, days: [1, 5], until: '2027-01-31' });
  assert.equal(buildRule({ unit: 'day', every: 1 }), 'FREQ=DAILY');
});

test('days and times in the words', () => {
  assert.equal(dayOf('tomorrow', today), '2026-11-02');
  assert.equal(dayOf('3/12', today), '2026-12-03');
  assert.equal(dayOf('31 feb', today), null);
  assert.equal(dayOf('fri', today), '2026-11-06');
  assert.equal(timeOf('8:30pm', false), '20:30');
  assert.equal(timeOf('12am', false), '00:00');
  assert.equal(timeOf('9', false), null);
  assert.equal(timeOf('13pm', false), null);
});
