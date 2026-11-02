// Server-side Web Push for the reminders (loaded only by reminders-wire.js, so only with the Reminders option on). With the
// option on and the notification permission granted, this device subscribes (push.js) and tells the Worker (POST /api/push/subscribe);
// then, a moment after each data change, it sends the reminders due in the next week (POST /api/push/schedule) when they differ from
// what it sent last. The Worker's once-a-minute job sends each when due, so it arrives with the app closed. Turning the option off
// (or signing out) unsubscribes. A subscribe that fails (offline, signed out, refused) is tried again, with a growing wait, at the next
// data change, when the device is back online or the app comes to the front. Nothing here asks for a permission.
import { VAPID_PUBLIC_KEY } from './vapid.js';
import { subscribePush, unsubscribePush } from './push.js';
import { pushItems } from './push-items.js';

const DEBOUNCE_MS = 4000;
const RETRY_MS = 30000, RETRY_MAX_MS = 30 * 60000;

/** @param {import('./items.js').ItemsApp} app @param {{ now?: () => number, debounce?: number }} [o]  (for tests) */
export function wirePush(app, o = {}) {
  const now = o.now ?? Date.now, wait = o.debounce ?? DEBOUNCE_MS;
  /** the option is on (on() .. off()) */
  let want = false;
  let active = false;
  /** counts off() calls, so a start that was under way when the option went off knows */
  let gen = 0, fails = 0, retryAt = 0;
  /** @type {Promise<void> | null} */
  let starting = null;
  /** @type {import('./items.js').Task[]} */
  let tasks = [];
  /** @type {string | null} what the Worker has now */
  let sent = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  /** @type {(() => void) | undefined} */
  let unhook;

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
  /** drop this device at the Worker and in the browser (does not change `want`) */
  async function drop() {
    active = false; sent = null;
    if (timer) { clearTimeout(timer); timer = null; }
    const endpoint = await unsubscribePush();
    if (endpoint) await post('unsubscribe', { endpoint });
  }
  /** subscribe when wanted and not yet (and not waiting out a failure) */
  function ensure() {
    if (!want || active || starting || now() < retryAt) return;
    const g = gen;
    starting = (async () => {
      const sub = await subscribePush(VAPID_PUBLIC_KEY);
      const ok = !!sub && await post('subscribe', { subscription: sub });
      if (g !== gen) return;   // the option went off meanwhile: off() undoes it
      if (ok) { active = true; fails = 0; later(0); } else retryAt = now() + Math.min(RETRY_MAX_MS, RETRY_MS * 2 ** fails++);
    })().finally(() => { starting = null; });
  }
  const wake = () => { if (document.visibilityState !== 'hidden') ensure(); };

  return {
    /** the option is on */
    on() {
      if (want) return;
      want = true; fails = 0; retryAt = 0;
      addEventListener('online', ensure);
      document.addEventListener('visibilitychange', wake);
      const offHook = app.onSignOut?.(drop);
      unhook = () => { removeEventListener('online', ensure); document.removeEventListener('visibilitychange', wake); offHook?.(); };
      ensure();
    },
    /** the option is off: forget this device (the Worker empties the queue once no device is left) */
    async off() {
      if (!want) return;
      want = false; gen++;
      unhook?.();
      await starting;   // (a subscribe under way has finished by now; this undoes it)
      await drop();
    },
    /** @param {import('./items.js').Task[]} list */
    update(list) {
      tasks = list;
      if (!want) return;
      if (active) later(sent === null ? 0 : wait); else ensure();
    },
  };
}
