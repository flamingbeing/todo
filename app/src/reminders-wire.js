// Starts and stops the reminders on this device with the option (app.js loads this file only once the option is on).
// Turning the option on asks for the browser's notification permission; if it is refused the option goes back off. Never asks
// on load: a device that already has the option on and permission granted just starts.
import { watchReminders, enable } from './reminder-delivery.js';

/** @param {import('./items.js').ItemsApp} app @returns {{ update: (t: import('./items.js').Task[]) => void }} */
export function wire(app) {
  /** @type {ReturnType<typeof watchReminders> | null} */
  let w = null;
  /** @type {import('./items.js').Task[]} */
  let last = [];
  let busy = false;
  const apply = async () => {
    if (busy) return;
    busy = true;
    try {
      if (!app.settings.get('reminders')) { w?.stop(); w = null; return; }
      if (w) return;
      if (typeof Notification !== 'undefined' && Notification.permission === 'default' && await enable() !== 'granted') { await app.settings.set('reminders', false); return; }
      w = watchReminders();
      w.update(last);
    } finally { busy = false; }
  };
  app.settings.watch('reminders', () => { void apply(); });
  void apply();
  return { update(t) { last = t; w?.update(t); } };
}
