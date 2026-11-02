// Showing reminders on this device (loaded only when the per-device option "Reminders" is on; app.js). While the app is open
// or backgrounded, a timer and every data change ask reminders.js what is due; each is shown once through the service
// worker's notification (Notification API), so a tap opens the task (sw.js notificationclick). A closed app cannot show them:
// that needs Web Push (push.js, STATUS.md "Next"). Permission is asked only by `enable()`, from the Settings switch.
import { dueNow, nextAt, bodyOf } from './reminders.js';

const SENT_KEY = 'td-reminders-sent';
const POLL_MS = 30000;
/** a sent key is forgotten after this long (it can no longer be due) */
const KEEP_MS = 2 * 24 * 3600 * 1000;

/** @returns {Map<string, number>} what was shown, with when */
function loadSent() {
  try { return new Map(Object.entries(JSON.parse(localStorage.getItem(SENT_KEY) || '{}')).map(([k, v]) => [k, Number(v)])); } catch { return new Map(); }
}
/** @param {Map<string, number>} sent */
function saveSent(sent) { try { localStorage.setItem(SENT_KEY, JSON.stringify(Object.fromEntries(sent))); } catch { /* private window: shown again on reload, at most */ } }

export const supported = () => typeof Notification !== 'undefined' && 'serviceWorker' in navigator;

/** Ask for permission (call from the switch being turned on). @returns {Promise<'granted' | 'denied' | 'default' | 'unsupported'>} */
export async function enable() {
  if (!supported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}

/** @param {import('./reminders.js').Fire} f */
async function show(f) {
  const opts = { body: bodyOf(f), tag: f.key, data: { taskId: f.taskId, url: `./#task=${encodeURIComponent(f.taskId)}` }, icon: 'icons/icon-192.png' };
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) { await reg.showNotification(f.title || 'Task', opts); return true; }
    new Notification(f.title || 'Task', opts);   // no service worker (the emulator tests): the page's own
    return true;
  } catch { return false; }
}

/**
 * Start watching. Returns { update(tasks), stop() }: call update with the tasks whenever they change.
 * @param {{ now?: () => number, show?: (f: import('./reminders.js').Fire) => Promise<boolean>, granted?: () => boolean }} [o]  (for tests)
 */
export function watchReminders(o = {}) {
  const now = o.now ?? Date.now, out = o.show ?? show, granted = o.granted ?? (() => supported() && Notification.permission === 'granted');
  const sent = loadSent();
  /** @type {import('./items.js').Task[]} */
  let tasks = [];
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  const tick = async () => {
    if (timer) clearTimeout(timer);
    const t = now();
    if (granted()) {
      for (const f of dueNow(tasks, t, new Set(sent.keys()))) if (await out(f)) sent.set(f.key, t);
      for (const [k, at] of sent) if (t - at > KEEP_MS) sent.delete(k);
      saveSent(sent);
    }
    const next = nextAt(tasks, t);
    timer = setTimeout(() => void tick(), Math.min(POLL_MS, next === null ? POLL_MS : Math.max(1000, next - t)));
  };
  const wake = () => { if (document.visibilityState === 'visible') void tick(); };
  document.addEventListener('visibilitychange', wake);
  return {
    update(/** @type {import('./items.js').Task[]} */ list) { tasks = list; void tick(); },
    stop() { if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', wake); },
  };
}
