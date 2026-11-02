// Web Push for reminders (the app's own; STATUS.md). Three signed-in routes and a once-a-minute job.
//
//   POST /api/push/subscribe    { subscription: { endpoint, keys: { p256dh, auth } } }  keeps this device's subscription
//   POST /api/push/unsubscribe  { endpoint }                                            forgets it (no device left: the queue goes too)
//   POST /api/push/schedule     { items: [{ key, at, title, body, taskId }] }          replaces this person's queued reminders
//   scheduled (wrangler.jsonc "triggers"): sends what is due, then removes it.
//
// Firestore (the Worker's service account; the rules refuse every page): pushSubs/{uid}/devices/{sha256(endpoint)} and
// pushQueue/{uid}_{sha256(key)} = { uid, key, at, title, body, taskId } (hashed so any task id makes a valid doc id).
// The same ID token check as /api/claims; a person needs a role (as the files route) and not be revoked.
import { unb64, sendPush } from './webpush.js';
import { fromValue, toValue } from './claims.js';

export const MAX_ITEMS = 200, MAX_DEVICES = 10, MAX_BODY = 300_000;
export const AHEAD_MS = 8 * 24 * 3600 * 1000;
/** a reminder later than this after its time is dropped (app/src/reminders.js LATE_MS) */
export const LATE_MS = 15 * 60 * 1000;
/** due within this much of now is sent now (the job runs on the minute) */
export const SOON_MS = 30 * 1000;
/** at most this many reminders per run: the Workers free plan allows 50 outgoing requests per run */
export const PER_RUN = 10;
const SKEW_MS = 60 * 1000;
/** the push services (the only addresses the Worker will post to) */
const SERVICES = /^https:\/\/([a-z0-9-]+\.)*(googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)\//;
const ROLES = ['admin', 'member', 'viewer'];

/** @param {string} s */
export async function sha256(s) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
}

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });
const text = (v, max) => typeof v === 'string' && v.length <= max;
const isB64 = (v, bytes) => { try { return typeof v === 'string' && /^[A-Za-z0-9_-]+$/.test(v) && unb64(v).length === bytes; } catch { return false; } };

/** @param {any} s @returns {{ endpoint: string, keys: { p256dh: string, auth: string } } | null} */
export function cleanSubscription(s) {
  if (!s || typeof s !== 'object' || !text(s.endpoint, 1000) || !SERVICES.test(s.endpoint)) return null;
  if (!isB64(s.keys?.p256dh, 65) || unb64(s.keys.p256dh)[0] !== 4 || !isB64(s.keys?.auth, 16)) return null;
  return { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } };
}

/** The items worth queueing: well-formed ones in range (others are dropped), at most MAX_ITEMS, soonest first. null: malformed.
 * @param {any} items @param {number} now */
export function cleanItems(items, now) {
  if (!Array.isArray(items) || items.length > MAX_ITEMS) return null;
  const out = [];
  for (const i of items) {
    if (!i || typeof i !== 'object' || !text(i.key, 300) || !i.key || !text(i.title, 200) || !text(i.body, 300) || !text(i.taskId, 128)) return null;
    if (!Number.isFinite(i.at)) return null;
    if (i.at < now - SKEW_MS || i.at > now + AHEAD_MS) continue;
    out.push({ key: i.key, at: Math.round(i.at), title: i.title || 'Task', body: i.body, taskId: i.taskId });
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * The routes. deps: { store, verify, revoked, origin, now }; store as `firestoreStore` (a test gives a memory one).
 * Answers { ok: true } or { error } with 400/401/403/405/413/503.
 */
export async function handlePush(request, { store, verify, revoked = null, origin, now = Date.now } = {}) {
  const m = new URL(request.url).pathname.match(/^\/api\/push\/(subscribe|unsubscribe|schedule)$/);
  if (!m) return json({ error: 'Not found.' }, 404);
  if (request.method !== 'POST') return json({ error: 'POST only.' }, 405, { Allow: 'POST' });
  if (!store || typeof verify !== 'function') return json({ error: 'Push is not set up yet.' }, 503);
  const from = request.headers.get('Origin');
  if (origin && from && from !== origin) return json({ error: 'Wrong origin.' }, 403);
  const idToken = (request.headers.get('Authorization') || '').match(/^Bearer\s+(\S+)$/)?.[1];
  if (!idToken) return json({ error: 'Sign in first.' }, 401);
  let token;
  try { token = await verify(idToken); } catch (e) { return json({ error: 'Sign in again.', why: e?.message }, 401); }
  const g = token.g && typeof token.g === 'object' ? token.g : {};
  if (!Object.values(g).some(r => ROLES.includes(/** @type {string} */ (r)))) return json({ error: 'No access.' }, 403);
  if (token.x != null && !(now() < Number(token.x) * 1000)) return json({ error: 'No access.' }, 403);
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: 'Too big.' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { body = null; }
  if (!body || typeof body !== 'object') return json({ error: 'JSON object expected.' }, 400);
  const uid = String(token.sub);
  try {
    if (revoked && await revoked(uid)) return json({ error: 'No access.' }, 403);
    if (m[1] === 'subscribe') {
      const sub = cleanSubscription(body.subscription);
      if (!sub) return json({ error: 'subscription: a push service address and its keys.' }, 400);
      const id = await sha256(sub.endpoint), have = await store.devices(uid);
      const others = have.filter(d => d.id !== id);
      // a person's devices are few; past the cap the oldest go (a reinstall leaves a dead one behind)
      const drop = others.length >= MAX_DEVICES ? others.sort((a, b) => (a.data.createdAt || 0) - (b.data.createdAt || 0)).slice(0, others.length - MAX_DEVICES + 1) : [];
      await store.write({ set: [[`pushSubs/${uid}/devices/${id}`, { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, createdAt: have.find(d => d.id === id)?.data.createdAt || now() }]],
        del: drop.map(d => `pushSubs/${uid}/devices/${d.id}`) });
    } else if (m[1] === 'unsubscribe') {
      if (!text(body.endpoint, 1000) || !body.endpoint) return json({ error: 'endpoint: text.' }, 400);
      const id = await sha256(body.endpoint), left = (await store.devices(uid)).filter(d => d.id !== id);
      const del = [`pushSubs/${uid}/devices/${id}`];
      if (!left.length) for (const q of await store.queueOf(uid)) del.push(`pushQueue/${q.id}`);
      await store.write({ del });
    } else {
      const items = cleanItems(body.items, now());
      if (!items) return json({ error: `items: up to ${MAX_ITEMS}, each { key, at, title, body, taskId }.` }, 400);
      const want = new Map();
      for (const i of items) want.set(`${uid}_${(await sha256(i.key)).slice(0, 40)}`, { uid, ...i });
      const set = [], del = [];
      for (const q of await store.queueOf(uid)) {
        const w = want.get(q.id);
        if (!w) del.push(`pushQueue/${q.id}`);
        else if (['at', 'title', 'body', 'taskId', 'key'].every(k => q.data[k] === w[k])) want.delete(q.id);
      }
      for (const [id, data] of want) set.push([`pushQueue/${id}`, data]);
      if (set.length || del.length) await store.write({ set, del });
    }
    return json({ ok: true });
  } catch (e) {
    console.error('push failed', m[1], e?.message);
    return json({ error: 'Couldn’t do that. Try again.' }, 500);
  }
}

/**
 * The once-a-minute job: send what is due (or due within SOON_MS) to each of its person's devices, then remove it. Late items are
 * dropped unsent; a device the push service says is gone (404, 410) is removed. -> { sent, dropped, gone } counts.
 * @param {{ store: any, vapid: { publicKey: string, privateKey: string, subject: string }, now?: number, send?: typeof sendPush }} o
 */
export async function runDue({ store, vapid, now = Date.now(), send = sendPush }) {
  const due = await store.dueItems(now + SOON_MS, PER_RUN);
  const out = { sent: 0, dropped: 0, gone: 0 };
  const del = /** @type {string[]} */ ([]);
  /** @type {Map<string, any[]>} */
  const devices = new Map();
  for (const q of due) {
    const d = q.data;
    del.push(`pushQueue/${q.id}`);
    if (now - d.at > LATE_MS) { out.dropped++; continue; }
    if (!devices.has(d.uid)) devices.set(d.uid, await store.devices(d.uid));
    const payload = { title: d.title, body: d.body, taskId: d.taskId, tag: d.key };
    for (const dev of devices.get(d.uid) ?? []) {
      if (dev.gone) continue;
      try {
        const r = await send({ subscription: { endpoint: dev.data.endpoint, keys: { p256dh: dev.data.p256dh, auth: dev.data.auth } }, payload, vapid, now });
        if (r.status === 404 || r.status === 410) { dev.gone = true; out.gone++; del.push(`pushSubs/${d.uid}/devices/${dev.id}`); }
        else if (r.ok) out.sent++;
        else console.error('push refused', new URL(dev.data.endpoint).host, r.status);
      } catch (e) { console.error('push failed', e?.message); }
    }
  }
  if (del.length) await store.write({ del });
  return out;
}

/** The queue and the devices in Firestore (REST), as the service account. base: 'https://firestore.googleapis.com' or an emulator's.
 * @param {{ project: string, accessToken: () => Promise<string> }} adm @param {string} base */
export function firestoreStore(adm, base = 'https://firestore.googleapis.com') {
  const root = `projects/${encodeURIComponent(adm.project)}/databases/(default)/documents`;
  const call = async (/** @type {string} */ path, /** @type {unknown} */ body) => {
    const r = await fetch(`${base}/v1/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${await adm.accessToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`${path.split(':').pop()} ${r.status}`);
    return r.json();
  };
  const run = async (/** @type {string} */ parent, /** @type {any} */ q) =>
    (await call(`${root}${parent}:runQuery`, { structuredQuery: q })).filter((/** @type {any} */ r) => r.document)
      .map((/** @type {any} */ r) => ({ id: r.document.name.split('/').pop(), data: fromValue({ mapValue: { fields: r.document.fields || {} } }) }));
  const field = (/** @type {string} */ f, /** @type {string} */ op, /** @type {any} */ v) => ({ fieldFilter: { field: { fieldPath: f }, op, value: toValue(v) } });
  return {
    devices: (/** @type {string} */ uid) => run(`/pushSubs/${encodeURIComponent(uid)}`, { from: [{ collectionId: 'devices' }], limit: 50 }),
    queueOf: (/** @type {string} */ uid) => run('', { from: [{ collectionId: 'pushQueue' }], where: field('uid', 'EQUAL', uid), limit: MAX_ITEMS + 50 }),
    dueItems: (/** @type {number} */ until, /** @type {number} */ limit) => run('', { from: [{ collectionId: 'pushQueue' }], where: field('at', 'LESS_THAN_OR_EQUAL', until), orderBy: [{ field: { fieldPath: 'at' } }], limit }),
    /** @param {{ set?: [string, any][], del?: string[] }} w one commit (a single request, up to 500 writes) */
    async write({ set = [], del = [] }) {
      const writes = [
        ...set.map(([p, data]) => ({ update: { name: `${root}/${p}`, fields: toValue(data).mapValue.fields } })),
        ...del.map(p => ({ delete: `${root}/${p}` })),
      ];
      for (let i = 0; i < writes.length; i += 400) await call(`${root}:commit`, { writes: writes.slice(i, i + 400) });
    },
  };
}
