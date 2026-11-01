// parse.js: a task name typed in quick add -> its title, project, section, labels, priority and date.
// node --test app/test/parse.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, titleOf, shiftRanges } from '../src/parse.js';
import * as chrono from '../public/vendor/chrono-node/2.10.3/chrono.js';
import { RRule } from '../public/vendor/rrule/2.8.1/rrule.js';

const now = new Date(2026, 10, 1, 10, 0);   // Sunday 1 Nov 2026, 10:00
const ctx = {
  now, chrono: chrono.casual, RRule,
  projects: [{ id: 'work', name: 'Work' }, { id: 'home', name: 'Home' }, { id: 'reno', name: 'Home Renovation' }],
  sections: [{ id: 'admin', name: 'Admin', projectId: 'work' }, { id: 'calls', name: 'Calls', projectId: 'work' }, { id: 'kitchen', name: 'Kitchen', projectId: 'reno' }, { id: 'later', name: 'Later', projectId: 'inbox' }],
  labels: ['errand', 'deep work', 'Phone'],
};
/** @param {string} text @param {object} [more] */
const p = (text, more = {}) => parse(text, { ...ctx, ...more });
/** @param {string} text @param {object} [more] */
const due = (text, more) => p(text, more).due;

test('the full line: date, time, repeat, project, section, label and priority', () => {
  const r = p('Report tmr 5pm every mon #Work /Admin @errand p1');
  assert.equal(r.title, 'Report');
  assert.equal(r.projectId, 'work');
  assert.equal(r.sectionId, 'admin');
  assert.deepEqual(r.labels, ['errand']);
  assert.equal(r.priority, 1);
  assert.deepEqual(r.due, { date: '2026-11-02', time: '17:00', rrule: 'FREQ=WEEKLY;BYDAY=MO', string: 'every mon' });
  assert.deepEqual(r.tokens.map(t => [t.kind, 'Report tmr 5pm every mon #Work /Admin @errand p1'.slice(t.start, t.end)]), [
    ['date', 'tmr 5pm'], ['recur', 'every mon'], ['project', '#Work'], ['section', '/Admin'], ['label', '@errand'], ['priority', 'p1'],
  ]);
});

test('the screenshot line', () => {
  const r = p('Pick up dry cleaning p1 tomorrow 4 pm');
  assert.equal(r.title, 'Pick up dry cleaning');
  assert.equal(r.priority, 1);
  assert.deepEqual(r.due, { date: '2026-11-02', time: '16:00' });
});

test('projects: the longest known name, any case; unknown #words stay text', () => {
  assert.equal(p('Paint #Home Renovation').projectId, 'reno');
  assert.equal(p('Paint #Home Renovation').title, 'Paint');
  assert.equal(p('Sweep #home').projectId, 'home');
  assert.equal(p('Sweep #Homes').projectId, null);
  assert.equal(p('Sweep #Homes').title, 'Sweep #Homes');
  assert.equal(p('Issue #42 fix').projectId, null);
  assert.equal(p('Issue #42 fix').title, 'Issue #42 fix');
  assert.equal(p('a#Work').projectId, null, 'a # inside a word is not a project');
  assert.equal(p('one #Work two #Home').projectId, 'work', 'the first one counts');
  assert.equal(p('one #Work two #Home').title, 'one two #Home');
});

test('sections belong to the project given, or the one quick add opened in', () => {
  assert.equal(p('Call /Calls #Work').sectionId, 'calls');
  assert.equal(p('Call #Work/Calls').sectionId, 'calls');
  assert.equal(p('Call #Work/Calls').title, 'Call');
  assert.equal(p('Tiles #Home Renovation /Kitchen').sectionId, 'kitchen');
  assert.equal(p('Call /Calls').sectionId, null, 'not in the inbox');
  assert.equal(p('Call /Calls', { projectId: 'work' }).sectionId, 'calls');
  assert.equal(p('Read /Later').sectionId, 'later');
  assert.equal(p('see a/b').sectionId, null);
});

test('labels: @ and %, known names with their case, new names as typed', () => {
  assert.deepEqual(p('Bank @errand').labels, ['errand']);
  assert.deepEqual(p('Bank %errand').labels, ['errand']);
  assert.deepEqual(p('Mum @phone').labels, ['Phone']);
  assert.deepEqual(p('Write @deep work today').labels, ['deep work']);
  assert.deepEqual(p('Fix @new-one @errand @Errand').labels, ['new-one', 'errand']);
  assert.equal(p('Fix @new-one @errand').title, 'Fix');
  assert.deepEqual(p('mail me@example.com').labels, [], 'an @ inside a word is not a label');
  assert.equal(p('50% off').labels.length, 0);
});

test('priority p1..p4 and !!1, as whole words only', () => {
  assert.equal(p('Taxes p1').priority, 1);
  assert.equal(p('Taxes P2').priority, 2);
  assert.equal(p('Taxes p4').priority, 4);
  assert.equal(p('Taxes !!3').priority, 3);
  assert.equal(p('Taxes p5').priority, null);
  assert.equal(p('Buy p1x cable').priority, null);
  assert.equal(p('p3 first').priority, 3);
  assert.equal(p('p3 first p1').priority, 3);
});

test('the app\'s own date words', () => {
  assert.deepEqual(due('a tod'), { date: '2026-11-01' });
  assert.deepEqual(due('a today'), { date: '2026-11-01' });
  assert.deepEqual(due('a tmr'), { date: '2026-11-02' });
  assert.deepEqual(due('a tom'), { date: '2026-11-02' });
  assert.deepEqual(due('a tomorrow'), { date: '2026-11-02' });
  assert.deepEqual(due('a next week'), { date: '2026-11-02' }, 'the next Monday');
  assert.deepEqual(due('a next week', { nextWeekDay: 0 }), { date: '2026-11-08' }, 'a Sunday start, from a Sunday');
  assert.deepEqual(due('a later this week'), { date: '2026-11-03' });
  assert.deepEqual(due('a this weekend'), { date: '2026-11-01' }, 'Sunday is still this weekend');
  assert.deepEqual(due('a this weekend', { now: new Date(2026, 10, 3, 10) }), { date: '2026-11-07' });
  assert.deepEqual(due('a next weekend', { now: new Date(2026, 10, 3, 10) }), { date: '2026-11-14' });
  assert.deepEqual(due('a end of month'), { date: '2026-11-30' });
  assert.deepEqual(due('a mid jan'), { date: '2027-01-15' });
  assert.deepEqual(due('a mid november'), { date: '2026-11-15' });
  assert.deepEqual(due('a in 3 days'), { date: '2026-11-04' });
  assert.deepEqual(due('a in 2 weeks'), { date: '2026-11-15' });
  assert.deepEqual(due('a +5 days'), { date: '2026-11-06' });
  assert.deepEqual(due('a evening'), { date: '2026-11-01', time: '19:00' });
  assert.deepEqual(due('a tomorrow morning'), { date: '2026-11-02', time: '09:00' });
  assert.deepEqual(due('a tmr in the afternoon'), { date: '2026-11-02', time: '12:00' });
  assert.deepEqual(due('a tonight'), { date: '2026-11-01', time: '22:00' });
  assert.deepEqual(due('a tmr at 9'), { date: '2026-11-02', time: '09:00' });
  assert.deepEqual(due('a tmr 2 apples'), { date: '2026-11-02' }, 'a bare number after a day is not a time');
  assert.equal(p('Call on tmr').title, 'Call');
});

test('someday and no date clear the date', () => {
  const r = p('Learn piano someday');
  assert.equal(r.due, null);
  assert.equal(r.noDate, true);
  assert.equal(r.title, 'Learn piano');
  assert.equal(p('x no date').noDate, true);
});

test('chrono for the other dates', () => {
  assert.deepEqual(due('Dentist next friday'), { date: '2026-11-06' });
  assert.deepEqual(due('Dentist dec 5'), { date: '2026-12-05' });
  assert.deepEqual(due('Dentist dec 5 at 3pm'), { date: '2026-12-05', time: '15:00' });
  assert.deepEqual(due('Call at 5pm'), { date: '2026-11-01', time: '17:00' });
  assert.deepEqual(due('Call at 8am'), { date: '2026-11-02', time: '08:00' }, 'a time already past is tomorrow\'s');
  assert.equal(p('Dentist next friday').title, 'Dentist');
  assert.equal(due('review march report'), null, 'a month alone is a word');
  assert.equal(due('buy 2 apples'), null);
  assert.equal(due('a dec 5', { chrono: null }), null, 'without the library, its words stay text');
});

test('repeats: the first date comes from the rule', () => {
  assert.deepEqual(due('Gym every monday'), { date: '2026-11-02', rrule: 'FREQ=WEEKLY;BYDAY=MO', string: 'every monday' });
  assert.deepEqual(due('Water every day'), { date: '2026-11-01', rrule: 'FREQ=DAILY', string: 'every day' });
  assert.deepEqual(due('Rent every 15th at 9am'), { date: '2026-11-15', time: '09:00', rrule: 'FREQ=MONTHLY;BYMONTHDAY=15', string: 'every 15th at 9am' });
  assert.deepEqual(due('Haircut every! 4 weeks'), { date: '2026-11-01', rrule: 'FREQ=WEEKLY;INTERVAL=4', string: 'every! 4 weeks', fromDone: true });
  assert.deepEqual(due('Bins every tue starting dec 1'), { date: '2026-12-01', rrule: 'FREQ=WEEKLY;BYDAY=TU', string: 'every tue starting dec 1' });
  assert.equal(p('Gym every monday #Home').title, 'Gym');
  assert.deepEqual(due('Gym every monday', { RRule: null }), { date: '2026-11-02', rrule: 'FREQ=WEEKLY;BYDAY=MO', string: 'every monday' }, 'without the library: the same day');
  assert.equal(due('Payday every last workday', { RRule: null })?.date, '2026-11-01', 'one too hard by hand: from today until the library loads');
  assert.equal(due('Meds every 4 hours'), null);
});

test('cleared ranges stay text', () => {
  const text = 'Call tom tomorrow';
  const r = p(text, { ignore: [{ start: 5, end: 8 }] });
  assert.equal(r.title, 'Call tom');
  assert.deepEqual(r.due, { date: '2026-11-02' });
  const r2 = p('Fix p1 soon', { ignore: [{ start: 4, end: 6 }] });
  assert.equal(r2.priority, null);
  assert.equal(r2.title, 'Fix p1 soon');
  const r3 = p('Mow every monday', { ignore: [{ start: 4, end: 16 }] });
  assert.equal(r3.due, null);
  const r4 = p('Fix #Work', { ignore: [{ start: 4, end: 9 }] });
  assert.equal(r4.projectId, null);
});

test('smart dates off: only #, /, @, % and p count', () => {
  const r = p('Pay tmr every mon #Work /Admin @errand %Phone p2', { smartDates: false });
  assert.equal(r.title, 'Pay tmr every mon');
  assert.equal(r.due, null);
  assert.equal(r.projectId, 'work');
  assert.equal(r.sectionId, 'admin');
  assert.deepEqual(r.labels, ['errand', 'Phone']);
  assert.equal(r.priority, 2);
});

test('plain text has no tokens; the title keeps its words', () => {
  const r = p('  Buy   milk  ');
  assert.equal(r.title, 'Buy milk');
  assert.deepEqual(r.tokens, []);
  assert.equal(r.priority, null);
  assert.equal(r.projectId, null);
  assert.equal(p('').title, '');
});

test('titleOf and shiftRanges', () => {
  assert.equal(titleOf('a b c', [{ start: 2, end: 3, kind: 'priority', value: 1 }]), 'a c');
  assert.deepEqual(shiftRanges('Call tom', 'Please call tom', [{ start: 5, end: 8 }]), [{ start: 12, end: 15 }]);
  assert.deepEqual(shiftRanges('Call tom', 'Call tom now', [{ start: 5, end: 8 }]), [{ start: 5, end: 8 }]);
  assert.deepEqual(shiftRanges('Call tom', 'Call tim', [{ start: 5, end: 8 }]), []);
});

test('{march 30}: a deadline, a day only, apart from the date', () => {
  const r = p('Tax return {dec 5} tmr');
  assert.equal(r.title, 'Tax return');
  assert.equal(r.deadline, '2026-12-05');
  assert.deepEqual(r.due, { date: '2026-11-02' }, 'the date is still read');
  assert.deepEqual(r.tokens.map(t => t.kind), ['deadline', 'date']);
  assert.equal(p('Pay {next friday}').deadline, '2026-11-06');
  assert.equal(p('Pay {end of month}').deadline, '2026-11-30');
  assert.equal(p('Pay {dec 5 at 3pm}').due, null, 'the braces hide the time from the date scan');
  assert.equal(p('Pay {dec 5 at 3pm}').deadline, '2026-12-05', 'and only the day counts');
  assert.equal(p('Pay {tod}').due, null, 'not a date');
});

test('{...} that is not a day stays text', () => {
  for (const t of ['Fix {the thing}', 'Fix {}', 'Fix {march}', 'Fix {99/99}']) {
    const r = p(t);
    assert.equal(r.deadline, null, t);
    assert.equal(r.title, t, t);
  }
  assert.equal(p('Fix {dec 5}', { chrono: null }).deadline, null, 'without the library, only the shortcuts');
  assert.equal(p('Fix {dec 5}', { smartDates: false }).deadline, null, 'smart dates off');
  assert.equal(p('Fix {dec 5}', { ignore: [{ start: 4, end: 11 }] }).deadline, null, 'a cleared range stays text');
  assert.equal(p('Fix {tmr} {dec 5}').deadline, '2026-11-02', 'the first one counts');
});

test('an emoji before the words (two UTF-16 units) moves nothing', () => {
  const r = p('🎉 party p1 tomorrow 5pm every fri');
  assert.equal(r.title, '🎉 party');
  assert.equal(r.priority, 1);
  assert.deepEqual(r.due, { date: '2026-11-06', time: '17:00', rrule: 'FREQ=WEEKLY;BYDAY=FR', string: 'every fri' });
  // (two of them: a mask two places late would hide the t of tomorrow)
  const text = '🎉🎉 call p1 tomorrow';
  assert.deepEqual(p(text).tokens.map(t => text.slice(t.start, t.end)), ['p1', 'tomorrow']);
  assert.equal(p(text).title, '🎉🎉 call');
});

test('a repeat before the rule library has loaded: its first day all the same (the simple rules)', () => {
  const none = { RRule: null };
  assert.deepEqual(due('Gym every fri', none), { date: '2026-11-06', rrule: 'FREQ=WEEKLY;BYDAY=FR', string: 'every fri' });
  assert.equal(due('Rent every month on the 15th', none)?.date, due('Rent every month on the 15th')?.date);
  assert.equal(due('Water plants every day', none)?.date, '2026-11-01');
});
