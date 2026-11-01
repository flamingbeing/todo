// markdown.js: a task's words with a little markdown, read into marks.
// node --test app/test/markdown.unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarks, hasMarks } from '../src/markdown.js';

const txt = v => ({ t: 'text', v });

test('bold, italic, code and struck words', () => {
  assert.deepEqual(parseMarks('a **big** day'), [txt('a '), { t: 'strong', c: [txt('big')] }, txt(' day')]);
  assert.deepEqual(parseMarks('__big__'), [{ t: 'strong', c: [txt('big')] }]);
  assert.deepEqual(parseMarks('*soft* and _soft_'), [{ t: 'em', c: [txt('soft')] }, txt(' and '), { t: 'em', c: [txt('soft')] }]);
  assert.deepEqual(parseMarks('run `npm i` now'), [txt('run '), { t: 'code', v: 'npm i' }, txt(' now')]);
  assert.deepEqual(parseMarks('~~gone~~'), [{ t: 's', c: [txt('gone')] }]);
});

test('marks inside marks; code keeps its text as typed', () => {
  assert.deepEqual(parseMarks('**very _much_**'), [{ t: 'strong', c: [txt('very '), { t: 'em', c: [txt('much')] }] }]);
  assert.deepEqual(parseMarks('`**not bold**`'), [{ t: 'code', v: '**not bold**' }]);
});

test('links: [words](https://…) and bare https:// ones; other schemes stay text', () => {
  assert.deepEqual(parseMarks('see [the plan](https://example.com/p?q=1)'), [txt('see '), { t: 'a', href: 'https://example.com/p?q=1', c: [txt('the plan')] }]);
  assert.deepEqual(parseMarks('at https://example.com/x.'), [txt('at '), { t: 'a', href: 'https://example.com/x', c: [txt('https://example.com/x')] }, txt('.')]);
  assert.deepEqual(parseMarks('[x](javascript:alert(1))'), [txt('[x](javascript:alert(1))')]);
  assert.deepEqual(parseMarks('<b>hi</b>'), [txt('<b>hi</b>')]);
});

test('no mark: snake_case, a lone star, 2 * 3 * 4, a mark across lines', () => {
  for (const s of ['snake_case_name', 'a * b', '2 * 3 * 4', '**open\nshut**', 'price: 5*']) assert.equal(hasMarks(s), false, s);
  assert.equal(hasMarks('a **b**'), true);
  assert.deepEqual(parseMarks(''), []);
});
