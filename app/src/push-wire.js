// Server-side Web Push for the reminders (loaded only by reminders-wire.js, so only with the Reminders option on). With the
// option on and the notification permission granted, this device subscribes (push.js) and tells the Worker (POST /api/push/subscribe);
// then, a moment after each data change, it sends the reminders due in the next week (POST /api/push/schedule) when they differ from
// what it sent last. The Worker's once-a-minute job sends each when due, so it arrives with the app closed. Turning the option off
// unsubscribes. Nothing here asks for a permission.
import { VAPID_PUBLIC_KEY } from './vapid.js';
import { subscribePush, unsubscribePush } from './push.js';
import { pushItems } from './push-items.js';

const DEBOUNCE_MS = 4000;

/** @param {import('./items.js').ItemsApp} app @param {{ now?: () => number, debounce?: number }} [o]  (for tests) */
export function wirePush(app, o = {}) {
  const now = o.now ?? Date.now, wait = o.debounce ?? DEBOUNCE_MS;
  let active = false;
  /** @type {import('./items.js').Task[]} */
  let tasks = [];
  /** @type {string | null} what the Worker has now */
  let sent = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;

  /** @param {string} route @param {unknown} body */
  async function post(route, body) {
    try {
      const token = await app.idToken?.();
      if (!token) return false;
      const r = await fetch(`/api/push/${route}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return r.ok;
    } catch { return false; }
  }
  async function schedule() {
    timer = null;
    if (!active) return;
    const items = pushItems(tasks, now());
    const key = JSON.stringify(items);
    if (key === sent) return;
    if (await post('schedule', { items })) sent = key;
  }
  const later = (/** @type {number} */ ms) => { if (timer) clearTimeout(timer); timer = setTimeout(() => void schedule(), ms); };

  return {
    /** subscribe this device and fill the queue -> whether it worked */
    async start() {
      if (active) return true;
      const sub = await subscribePush(VAPID_PUBLIC_KEY);
      if (!sub || !await post('subscribe', { subscription: sub })) return false;
      active = true; sent = null;
      later(0);
      return true;
    },
    /** forget this device (the Worker empties the queue once no device is left) */
    async stop() {
      active = false; sent = null;
      if (timer) clearTimeout(timer);
      const endpoint = await unsubscribePush();
      if (endpoint) await post('unsubscribe', { endpoint });
    },
    /** @param {import('./items.js').Task[]} list */
    update(list) { tasks = list; if (active) later(sent === null ? 0 : wait); },
  };
}
