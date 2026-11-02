// The client half of server-side Web Push (reminders when the app is closed). Not used until the owner has done the steps
// in STATUS.md "Next": it needs a Worker route and VAPID keys that only the owner can make. Nothing here runs on load.
// Interface:
//   subscribePush(vapidPublicKey) -> the browser's PushSubscription as JSON ({ endpoint, keys: { p256dh, auth } }) to send to
//   the Worker (POST /api/push/subscribe, signed in), or null when push is unsupported, refused, or no key is given.
//   The Worker then sends a push whose JSON body is { title, body, taskId }; sw.js shows it and a tap opens the task.

/** @param {string} b64 URL-safe base64 -> bytes */
function bytes(b64) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '='));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in globalThis && typeof Notification !== 'undefined';

/** @param {string} vapidPublicKey @returns {Promise<PushSubscriptionJSON | null>} */
export async function subscribePush(vapidPublicKey) {
  if (!vapidPublicKey || !pushSupported() || Notification.permission !== 'granted') return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(vapidPublicKey) });
    return sub.toJSON();
  } catch { return null; }
}
