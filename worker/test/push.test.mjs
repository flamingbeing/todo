// worker/push.js with an in-memory store and a fake sender. Run: node --test 'worker/test/*.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePush, runDue, cleanItems, cleanSubscription, sha256, firestoreStore, MAX_ITEMS, PER_RUN } from '../push.js';
import { b64 } from '../webpush.js';

const NOW = Date.UTC(2026, 10, 5, 3, 0, 0);
const P256DH = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
const AUTH = 'BTBZMqHH6r4Tts7J_aSIgg';
const sub = (n = 1, host = 'web.push.apple.com') => ({ endpoint: `https://${host}/${n}`, keys: { p256dh: P256DH, auth: AUTH } });

/** a memory store with the same interface as firestoreStore */
function memory() {
  const docs = new Map();
  const under = prefix => [...docs].filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/')).map(([p, data]) => ({ id: p.split('/').pop(), data }));
  return { docs,
    devices: async uid => under(`pushSubs/${uid}/devices/`),
    queueOf: async uid => under('pushQueue/').filter(d => d.data.uid === uid),
    dueItems: async (until, limit) => under('pushQueue/').filter(d => d.data.at <= until).sort((a, b) => a.data.at - b.data.at).slice(0, limit),
    write: async ({ set = [], del = [] }) => { for (const [p, d] of set) docs.set(p, d); for (const p of del) docs.delete(p); } };
}
const verify = async t => { if (t === 'bad') throw new Error('bad'); return { sub: t, g: { _: 'member' } }; };
const call = (store, route, body, { token = 'u1', method = 'POST', extra = {}, revoked = null, verifyFn = verify } = {}) =>
  handlePush(new Request(`https://todo.test/api/push/${route}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }, body: method === 'POST' ? JSON.stringify(body) : undefined }),
    { store, verify: verifyFn, revoked, origin: 'https://todo.test', now: () => NOW });
const item = (n, over = {}) => ({ key: `t${n}|0|${n}`, at: NOW + n * 60000, title: `Task ${n}`, body: 'Due now', taskId: `t${n}`, ...over });

test('only a signed-in person with a role, from the app’s own origin, by POST', async () => {
  const s = memory();
  assert.equal((await call(s, 'schedule', { items: [] }, { token: null })).status, 401);
  assert.equal((await call(s, 'schedule', { items: [] }, { token: 'bad' })).status, 401);
  assert.equal((await call(s, 'schedule', { items: [] }, { verifyFn: async () => ({ sub: 'u', g: {} }) })).status, 403, 'no role');
  assert.equal((await call(s, 'schedule', { items: [] }, { revoked: async () => true })).status, 403, 'removed');
  assert.equal((await call(s, 'schedule', { items: [] }, { extra: { Origin: 'https://evil.test' } })).status, 403);
  assert.equal((await call(s, 'schedule', null, { method: 'GET' })).status, 405);
  assert.equal((await call(s, 'other', {})).status, 404);
  assert.equal((await call(null, 'schedule', { items: [] })).status, 503);
  assert.equal((await call(s, 'schedule', { items: [] })).status, 200);
});

test('subscribe keeps a device under the person, once per endpoint; bad or foreign addresses are refused', async () => {
  const s = memory();
  assert.equal((await call(s, 'subscribe', { subscription: sub(1) })).status, 200);
  assert.equal((await call(s, 'subscribe', { subscription: sub(1) })).status, 200);
  const id = await sha256(sub(1).endpoint);
  assert.deepEqual([...s.docs.keys()], [`pushSubs/u1/devices/${id}`]);
  assert.deepEqual(s.docs.get(`pushSubs/u1/devices/${id}`), { endpoint: sub(1).endpoint, p256dh: P256DH, auth: AUTH, createdAt: NOW });
  for (const bad of [null, {}, sub(2, 'evil.example.com'), { endpoint: 'http://web.push.apple.com/x', keys: sub().keys }, { endpoint: sub().endpoint, keys: { p256dh: 'AAAA', auth: AUTH } },
    { endpoint: sub().endpoint, keys: { p256dh: P256DH, auth: 'AAAA' } }, { endpoint: 'https://web.push.apple.com.evil.test/x', keys: sub().keys }]) {
    assert.equal((await call(s, 'subscribe', { subscription: bad })).status, 400, JSON.stringify(bad));
  }
  assert.equal(cleanSubscription(sub(3, 'fcm.googleapis.com'))?.endpoint, 'https://fcm.googleapis.com/3');
  assert.ok(cleanSubscription(sub(4, 'updates.push.services.mozilla.com')));
});

test('a person keeps at most 10 devices: the oldest go', async () => {
  const s = memory();
  for (let n = 1; n <= 12; n++) { s.docs.set(`pushSubs/u1/devices/d${n}`, { endpoint: sub(n).endpoint, p256dh: P256DH, auth: AUTH, createdAt: n }); }
  await call(s, 'subscribe', { subscription: sub(99) });
  const ids = (await s.devices('u1')).map(d => d.id);
  assert.equal(ids.length, 10);
  assert.ok(!ids.includes('d1') && !ids.includes('d2') && !ids.includes('d3') && ids.includes('d4'));
});

test('unsubscribe removes the device; the last one also empties the queue', async () => {
  const s = memory();
  await call(s, 'subscribe', { subscription: sub(1) });
  await call(s, 'subscribe', { subscription: sub(2) });
  await call(s, 'schedule', { items: [item(1)] });
  await call(s, 'unsubscribe', { endpoint: sub(1).endpoint });
  assert.equal((await s.devices('u1')).length, 1);
  assert.equal((await s.queueOf('u1')).length, 1);
  await call(s, 'unsubscribe', { endpoint: sub(2).endpoint });
  assert.equal((await s.devices('u1')).length, 0);
  assert.equal((await s.queueOf('u1')).length, 0);
  assert.equal((await call(s, 'unsubscribe', {})).status, 400);
});

test('schedule replaces the person’s queue: new in, changed updated, missing out, other people untouched', async () => {
  const s = memory();
  await call(s, 'schedule', { items: [item(1), item(2)] }, { token: 'u2' });
  await call(s, 'schedule', { items: [item(1), item(2), item(3)] });
  assert.equal((await s.queueOf('u1')).length, 3);
  await call(s, 'schedule', { items: [item(1, { title: 'Renamed' }), item(3)] });
  const q = (await s.queueOf('u1')).sort((a, b) => a.data.at - b.data.at);
  assert.deepEqual(q.map(d => d.data.title), ['Renamed', 'Task 3']);
  assert.equal(q[0].id, `u1_${(await sha256(item(1).key)).slice(0, 40)}`);
  assert.deepEqual(q[0].data, { uid: 'u1', ...item(1, { title: 'Renamed' }) });
  assert.equal((await s.queueOf('u2')).length, 2);
  await call(s, 'schedule', { items: [] });
  assert.equal((await s.queueOf('u1')).length, 0);
});

test('schedule checks sizes and times: malformed is refused, out of range is skipped', async () => {
  const s = memory();
  const bad = [{ items: 'x' }, { items: [{ ...item(1), title: 'x'.repeat(201) }] }, { items: [{ ...item(1), body: 'x'.repeat(301) }] }, { items: [{ ...item(1), at: 'soon' }] },
    { items: [{ ...item(1), key: '' }] }, { items: [{ ...item(1), taskId: 5 }] }, { items: Array.from({ length: MAX_ITEMS + 1 }, (_, i) => item(i + 1)) }, { items: [null] }];
  for (const b of bad) assert.equal((await call(s, 'schedule', b)).status, 400, JSON.stringify(b).slice(0, 80));
  assert.equal((await call(s, 'schedule', { items: Array.from({ length: MAX_ITEMS }, (_, i) => item(i + 1)) })).status, 200);
  assert.equal((await s.queueOf('u1')).length, MAX_ITEMS);
  assert.deepEqual(cleanItems([item(1, { at: NOW - 3600000 }), item(2, { at: NOW + 9 * 86400000 }), item(3), item(4, { at: NOW - 30000 })], NOW).map(i => i.taskId), ['t4', 't3']);
  const big = await handlePush(new Request('https://todo.test/api/push/schedule', { method: 'POST', headers: { Authorization: 'Bearer u1' }, body: 'x'.repeat(300_001) }), { store: s, verify, now: () => NOW });
  assert.equal(big.status, 413);
});

async function setup(devices = 1) {
  const s = memory();
  for (let n = 1; n <= devices; n++) await call(s, 'subscribe', { subscription: sub(n) });
  return s;
}
const vapid = { publicKey: 'k', privateKey: 'p', subject: 'https://todo.test' };
const sender = (status = 201, log = []) => async o => { log.push(o); return new Response(null, { status: typeof status === 'function' ? status(o) : status }); };

test('the job sends what is due to each device and removes it; later ones stay', async () => {
  const s = await setup(2);
  await call(s, 'schedule', { items: [item(0, { at: NOW - 1000, key: 'a|0|1' }), item(1, { at: NOW + 20000, key: 'b|0|1' }), item(2, { at: NOW + 120000, key: 'c|0|1' })] });
  const log = [];
  const r = await runDue({ store: s, vapid, now: NOW, send: sender(201, log) });
  assert.deepEqual(r, { sent: 4, dropped: 0, gone: 0 });
  assert.equal(log.length, 4);
  assert.deepEqual(log[0].payload, { title: 'Task 0', body: 'Due now', taskId: 't0', tag: 'a|0|1' });
  assert.equal(log[0].subscription.keys.auth, AUTH);
  assert.deepEqual((await s.queueOf('u1')).map(d => d.data.key), ['c|0|1']);
  assert.deepEqual(await runDue({ store: s, vapid, now: NOW, send: sender() }), { sent: 0, dropped: 0, gone: 0 });
});

test('the job drops a reminder more than 15 minutes late, unsent', async () => {
  const s = await setup();
  s.docs.set('pushQueue/u1_x', { uid: 'u1', key: 'k', at: NOW - 16 * 60000, title: 'Old', body: '', taskId: 't' });
  s.docs.set('pushQueue/u1_y', { uid: 'u1', key: 'k2', at: NOW - 14 * 60000, title: 'Recent', body: '', taskId: 't' });
  const log = [];
  assert.deepEqual(await runDue({ store: s, vapid, now: NOW, send: sender(201, log) }), { sent: 1, dropped: 1, gone: 0 });
  assert.deepEqual(log.map(l => l.payload.title), ['Recent']);
  assert.equal((await s.queueOf('u1')).length, 0);
});

test('the job removes a device the push service says is gone (404, 410), keeps the others and on other errors', async () => {
  const s = await setup(3);
  await call(s, 'schedule', { items: [item(1, { at: NOW }), item(2, { at: NOW })] });
  const id = d => d.data.endpoint.split('/').pop();
  const r = await runDue({ store: s, vapid, now: NOW, send: sender(o => ({ 1: 410, 2: 404, 3: 500 })[o.subscription.endpoint.split('/').pop()]) });
  assert.deepEqual(r, { sent: 0, dropped: 0, gone: 2 });
  assert.deepEqual((await s.devices('u1')).map(id), ['3']);
  assert.equal((await s.queueOf('u1')).length, 0);
});

test('the job survives a failing send and does at most PER_RUN reminders a run', async () => {
  const s = await setup();
  await call(s, 'schedule', { items: Array.from({ length: PER_RUN + 5 }, (_, i) => item(i, { at: NOW - 1000 + i })) });
  let n = 0;
  const r = await runDue({ store: s, vapid, now: NOW, send: async () => { if (++n === 1) throw new Error('network'); return new Response(null, { status: 201 }); } });
  assert.equal(r.sent, PER_RUN - 1);
  assert.equal((await s.queueOf('u1')).length, 5);
});

test('firestoreStore talks REST: queries by uid and by time, one commit for many writes', async () => {
  const calls = [], real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push([url, JSON.parse(init.body)]);
    return new Response(JSON.stringify([{ readTime: 'x' }, { document: { name: 'projects/p/databases/(default)/documents/pushQueue/u1_a', fields: { at: { integerValue: '5' }, uid: { stringValue: 'u1' } } } }]), { status: 200 });
  };
  try {
    const st = firestoreStore({ project: 'p', accessToken: async () => 'tok' });
    assert.deepEqual(await st.queueOf('u1'), [{ id: 'u1_a', data: { at: 5, uid: 'u1' } }]);
    await st.dueItems(99, 10);
    await st.devices('u1');
    await st.write({ set: [['pushQueue/u1_a', { uid: 'u1', at: 7 }]], del: ['pushQueue/u1_b'] });
  } finally { globalThis.fetch = real; }
  assert.equal(calls[0][0], 'https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents:runQuery');
  assert.deepEqual(calls[0][1].structuredQuery.where.fieldFilter, { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: 'u1' } });
  assert.equal(calls[1][1].structuredQuery.where.fieldFilter.op, 'LESS_THAN_OR_EQUAL');
  assert.equal(calls[2][0], 'https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents/pushSubs/u1:runQuery');
  assert.equal(calls[3][0], 'https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents:commit');
  assert.deepEqual(calls[3][1].writes, [{ update: { name: 'projects/p/databases/(default)/documents/pushQueue/u1_a', fields: { uid: { stringValue: 'u1' }, at: { integerValue: '7' } } } },
    { delete: 'projects/p/databases/(default)/documents/pushQueue/u1_b' }]);
});
