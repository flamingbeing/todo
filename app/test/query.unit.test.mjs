// query.js: saved filters' words, read and tested against tasks.
// node --test app/test/query.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { runQuery, countQuery, parseQuery, compileQuery, tokenize, readDay, fold, errorText } from '../src/query.js';

const T = '2026-11-04';   // a Wednesday
const projects = [
  { id: 'work', name: 'Work', order: 1 }, { id: 'side', name: 'Side Work', order: 2 }, { id: 'home', name: 'Home', order: 3 },
  { id: 'reno', name: 'Renovation', parentId: 'home', order: 4 }, { id: 'café', name: 'Café', order: 5 }, { id: 'amp', name: 'R&D', order: 6 },
];
const sections = [{ id: 'w1', name: 'Admin', projectId: 'work' }, { id: 'w2', name: 'Meetings', projectId: 'work' }];
const labels = [{ id: 'l1', name: 'errand' }, { id: 'l2', name: 'home-phone' }, { id: 'l3', name: 'homework' }, { id: 'l4', name: 'Résumé' }];
const c = { projects, sections, labels, today: T };
let n = 0;
const t = (id, o = {}) => ({ id, title: id, projectId: 'inbox', order: ++n, priority: 4, done: false, ...o });
const tasks = [
  t('a', { due: { date: T }, priority: 1, projectId: 'work' }),
  t('b', { due: { date: '2026-11-05' }, labels: ['l1'] }),
  t('c', { due: { date: '2026-11-03', time: '09:00' }, projectId: 'home' }),
  t('d', { projectId: 'reno', labels: ['l2', 'l3'] }),
  t('e', { due: { date: '2026-11-10', rrule: 'FREQ=WEEKLY' }, projectId: 'work', sectionId: 'w1', priority: 2 }),
  t('f', { parentId: 'a', projectId: 'work', sectionId: 'w2', description: 'Call the bank' }),
  t('g', { due: { date: '2026-10-20' }, priority: 3, projectId: 'side' }),
  t('h', { projectId: 'café', labels: ['errand'], title: 'Pick up crème' }),
  t('i', { due: { date: T }, done: true }),
  t('j', { projectId: 'amp', labels: ['l4'], due: { date: '2026-11-09' } }),
  t('k', { labels: ['gone'] }),
];
const ids = q => { const r = runQuery(q, tasks, c); assert.equal(r.error, null, `${q}: ${r.error && errorText(r.error)}`); return r.groups.map(g => g.tasks.map(x => x.id)); };
const one = q => ids(q)[0];
const err = q => { const r = compileQuery(q, c); assert.ok(r.error, `${q} should fail`); return r.error; };

const cases = [
  ['today', ['a']],
  ['tomorrow', ['b']],
  ['yesterday', ['c']],
  ['overdue', ['c', 'g']],
  ['od', ['c', 'g']],
  ['no date', ['d', 'f', 'h', 'k']],
  ['!no date', ['a', 'b', 'c', 'e', 'g', 'j']],
  ['no time', ['a', 'b', 'e', 'g', 'j']],
  ['3 days', ['a', 'b']],
  ['next 6 days', ['a', 'b', 'e', 'j']],
  ['-2 days', ['c']],
  ['-30 days', ['c', 'g']],
  ['date: 2026-11-10', ['e']],
  ['due: tomorrow', ['b']],
  ['date before: today', ['c', 'g']],
  ['due after: Nov 5', ['e', 'j']],
  ['date: 9 Nov', ['j']],
  ['date: nov 9 2026', ['j']],
  ['monday', ['j']],
  ['wednesday', ['a']],
  ['recurring', ['e']],
  ['p1', ['a']],
  ['P2', ['e']],
  ['no priority', ['b', 'c', 'd', 'f', 'h', 'j', 'k']],
  ['@errand', ['b', 'h']],
  ['%errand', ['b', 'h']],
  ['@home*', ['d']],
  ['@resume', ['j']],
  ['no labels', ['a', 'c', 'e', 'f', 'g', 'k']],
  ['#Work', ['a', 'e', 'f']],
  ['#work', ['a', 'e', 'f']],
  ['#*Work', ['a', 'e', 'f', 'g']],
  ['#Home', ['c']],
  ['##Home', ['c', 'd']],
  ['#Inbox', ['b', 'k']],
  ['#cafe', ['h']],
  ['#R\\&D', ['j']],
  ['/Admin', ['e']],
  ['/*', ['e', 'f']],
  ['!/*', ['a', 'b', 'c', 'd', 'g', 'h', 'j', 'k']],
  ['search: bank', ['f']],
  ['search: CREME pick', ['h']],
  ['subtask', ['f']],
  ['!subtask & #Work', ['a', 'e']],
  ['today & p1', ['a']],
  ['today | tomorrow', ['a', 'b']],
  ['(#Work | @errand) & !no date', ['a', 'b', 'e']],
  ['!(today | overdue) & !no date', ['b', 'e', 'j']],
  ['p1 | p2 & #Work', ['a', 'e']],
  ['  today  ', ['a']],
];
for (const [q, want] of cases) test(`"${q}"`, () => assert.deepEqual(one(q), want));

test('a comma makes a list per part, each headed by its own words', () => {
  const r = runQuery('today, overdue ,  @errand', tasks, c);
  assert.deepEqual(r.groups.map(g => g.title), ['today', 'overdue', '@errand']);
  assert.deepEqual(r.groups.map(g => g.tasks.map(x => x.id)), [['a'], ['c', 'g'], ['b', 'h']]);
  assert.deepEqual(countQuery('today, today | tomorrow', tasks, c), { count: 2, error: null }, 'a task in two lists counts once');
});

test('done tasks never show', () => assert.ok(!one('today | !today').includes('i')));

test('errors say what and where', () => {
  assert.deepEqual(err('today &'), { message: 'The query ends where a term should be', at: 8 });
  assert.equal(err('(today | p1').at, 1);
  assert.match(err('(today | p1').message, /not closed/);
  assert.equal(err('today)').at, 6);
  assert.match(err('today tomorrow').message, /isn't a term/);
  assert.match(err('today p1').message, /isn't a term/);
  assert.deepEqual(err('assigned to: me'), { message: '“assigned to: me” isn\'t a term this knows', at: 1 });
  assert.equal(err('p1 & date: blursday').at, 6);
  assert.match(err('p1 & date: blursday').message, /isn't a date/);
  assert.match(err('(today, p1)').message, /inside brackets/);
  assert.match(err('today,').message, /each side/);
  assert.match(err('').message, /empty/);
  assert.match(err('& p1').message, /can't be here/);
  assert.match(err('p1 \\').message, /backslash/);
  assert.equal(errorText({ message: 'x', at: 3 }), 'x (at 3)');
  assert.deepEqual(countQuery('p1 &', tasks, c).count, 0);
});

test('the tokens keep their places; an escape is plain text', () => {
  assert.deepEqual(tokenize('!a & (b)').map(x => [x.type, x.at]), [['op', 1], ['term', 2], ['op', 4], ['op', 6], ['term', 7], ['op', 8]]);
  assert.equal(tokenize('#a\\,b').length, 1);
  assert.equal(parseQuery('#a\\,b').parts.length, 1);
  assert.deepEqual(one('#Side\\*'), [], 'an escaped * is a star, not "any"');
});

test('days as written', () => {
  assert.equal(readDay('today', c), T);
  assert.equal(readDay('Friday', c), '2026-11-06');
  assert.equal(readDay('wed', c), T, 'today counts as the next Wednesday');
  assert.equal(readDay('3 Jan', c), '2027-01-03', 'a day gone by this year is next year');
  assert.equal(readDay('2026-02-30', c), null);
  assert.equal(readDay('soon', { ...c, parseDate: () => '2026-12-01' }), '2026-12-01', 'else the app\'s own reader');
  assert.equal(fold('Crème Brûlée'), 'creme brulee');
});
