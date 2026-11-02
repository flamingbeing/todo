// Starts and stops the reminders on this device with the option (app.js loads this file only once the option is on).
// Turning the option on asks for the browser's notification permission; if it is refused the option goes back off. Never asks
// on load: a device that already has the option on and permission granted just starts. With the permission granted it also
// turns on server-side Web Push (push-wire.js, loaded here only) so reminders arrive with the app closed; off, it turns that off.
import { watchReminders, enable } from './reminder-delivery.js';

/** @param {import('./items.js').ItemsApp} app @returns {{ update: (t: import('./items.js').Task[]) => void }} */
export function wire(app) {
  /** @type {ReturnType<typeof watchReminders> | null} */
  let w = null;
  /** @type {import('./items.js').Task[]} */
  let last = [];
  let busy = false;
  /** @type {Promise<ReturnType<typeof import('./push-wire.js').wirePush>> | null} */
  let pw = null;
  const push = () => (pw ??= import('./push-wire.js').then(m => m.wirePush(app)));
  const apply = async () => {
    if (busy) return;
    busy = true;
    try {
      if (!app.settings.get('reminders')) { w?.stop(); w = null; void push().then(p => p.stop()); return; }
      if (w) return;
      if (typeof Notification !== 'undefined' && Notification.permission === 'default' && await enable() !== 'granted') { await app.settings.set('reminders', false); return; }
      w = watchReminders();
      w.update(last);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') void push().then(p => { p.update(last); return p.start(); });
    } finally { busy = false; }
  };
  app.settings.watch('reminders', () => { void apply(); });
  void apply();
  return { update(t) { last = t; w?.update(t); if (w && pw) void pw.then(p => p.update(t)); } };
}
