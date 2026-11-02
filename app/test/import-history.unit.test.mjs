import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchCompleted, COMPLETED_URL, WINDOW_DAYS } from '../src/import-history.js';

const NOW = Date.parse('2026-11-02T00:00:00Z');
const reply = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const signal = new AbortController().signal;

test('walks back in 90-day windows, 2 years by default, and follows each window\'s cursor', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url: new URL(url), init });
    const u = new URL(url);
    if (calls.length === 1) return reply({ items: [{ id: 'a' }], next_cursor: 'c2' });
    if (u.searchParams.get('cursor') === 'c2') return reply({ items: [{ id: 'b' }, null, 'x'], next_cursor: null });
    return reply({ items: [] });
  };
  const items = await fetchCompleted('tok', fetcher, signal, { now: NOW });
  assert.deepEqual(items.map(i => i.id), ['a', 'b']);
  assert.equal(calls.length, 10, '9 windows (2 years) plus the one extra page');
  assert.ok(calls.every(c => c.url.origin + c.url.pathname === COMPLETED_URL));
  const first = calls[0].url.searchParams;
  assert.equal(first.get('until'), new Date(NOW).toISOString());
  assert.equal(Date.parse(first.get('until')) - Date.parse(first.get('since')), WINDOW_DAYS * 86_400_000);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.equal(calls[0].init.credentials, 'omit'); assert.equal(calls[0].init.method, 'GET');
  const sinceOfLast = Date.parse(calls.at(-1).url.searchParams.get('since'));
  assert.ok(NOW - sinceOfLast >= 2 * 365 * 86_400_000);
});

test('a refusal or a bad answer throws with words the page can show', async () => {
  await assert.rejects(fetchCompleted('t', async () => reply({}, 401), signal, { now: NOW }), /not accepted/);
  await assert.rejects(fetchCompleted('t', async () => reply({}, 429), signal, { now: NOW }), /Too many/);
  await assert.rejects(fetchCompleted('t', async () => reply({}, 500), signal, { now: NOW }), /500/);
  await assert.rejects(fetchCompleted('t', async () => { throw new Error('offline'); }, signal, { now: NOW }), /reach/);
  await assert.rejects(fetchCompleted('t', async () => ({ ok: true, status: 200, json: async () => { throw new Error('x'); } }), signal, { now: NOW }), /readable/);
});

test('a stuck cursor stops at the page limit, and a huge history stops at 5000', async () => {
  let n = 0;
  await fetchCompleted('t', async () => { n++; return reply({ items: [], next_cursor: 'again' }); }, signal, { now: NOW, years: 0.5 });
  assert.equal(n, 25 * 3);
  const big = await fetchCompleted('t', async () => reply({ items: Array.from({ length: 200 }, (_, i) => ({ id: String(i) })), next_cursor: 'more' }), signal, { now: NOW });
  assert.equal(big.length, 5000);
});
