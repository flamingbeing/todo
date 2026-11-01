// The page's wiring: the shell and Settings page (shell.js), the kit's sync chip, the account block, and the screen
// switch. The lists (screens/views.js) are the five tabs and the pages pushed over them, with the task sheet, quick add
// and the project sheet loading the first time they are needed.
import { syncChip, syncButton, plural, loadState } from '@core/ui';
import { start, usingEmulator, emulatorSignIn, lastSignedIn, keepList, keptList } from './cloud.js';
import { $ } from './dom.js';
import { dayKey } from './dates.js';
import { screenSwitch } from './screen-switch.js';
import { signedOutScreen } from './screens/signed-out.js';
import { noAccessScreen } from './screens/no-access.js';
import { notSetUpScreen } from './screens/not-set-up.js';
import { views } from './screens/views.js';
import { startShell, settingsPage, showToday } from './shell.js';

const typing = () => document.activeElement?.tagName === 'INPUT' && !!(/** @type {HTMLInputElement} */ (document.activeElement).value);
const sheetOpen = () => !!document.querySelector('dialog[open]');

// app-update (the update module): a new version installs in the background; the reload waits while someone types, a
// sheet is open or saves are unsent. (Off in the emulator tests unless ?sw is given.)
const withSW = 'serviceWorker' in navigator && (!usingEmulator || new URLSearchParams(location.search).has('sw'));

window.starter = { ready: false, add: (/** @type {string} */ title) => app?.addTask({ title, due: { date: dayKey() } }), signInAs: emulatorSignIn, files: () => app?.files, members: () => app?.members };   // for the tests
startShell();   // the tabs and menu work while the app starts
// this device was signed in last time: show the list's frame (skeleton rows) now, not a blank page or the sign-in screen
// while the sign-in is restored (cloud.js says signed out only once it has settled, and then the sign-in screen replaces it)
if (lastSignedIn()) {
  $('list-view').hidden = false;
  // Today as it was last drawn, read-only, until the real one arrives (screens/views.js replaces every row)
  const kept = keptList();
  if (kept.length) {
    const ul = document.createElement('ul');
    ul.className = 'td-rows td-kept';
    ul.append(...kept.map(r => {
      const li = document.createElement('li'), box = document.createElement('span'), main = document.createElement('span');
      li.className = 'td-row'; li.dataset.priority = String(r.priority);
      box.className = 'td-check'; main.className = 'td-row-main';
      const title = Object.assign(document.createElement('span'), { className: 'td-title', textContent: r.title });
      const meta = Object.assign(document.createElement('span'), { className: 'td-meta' });
      if (r.date) {
        const date = Object.assign(document.createElement('span'), { className: 'td-date', textContent: r.date });
        if (r.tone) date.dataset.tone = r.tone;
        meta.append(date);
      }
      if (r.place) meta.append(Object.assign(document.createElement('span'), { className: 'td-place', textContent: r.place }));
      main.append(title, meta);
      li.append(box, main);
      return li;
    }));
    $('today').replaceChildren(ul);
  } else loadState($('today-state')).loading();
}
const app = await start({ canReload: withSW ? () => !typing() && !sheetOpen() : null });
settingsPage(app);

if (!app) { showToday(); notSetUpScreen().show({ phase: 'not-set-up' }); }
else {
  // the chip and the tests' status read the whole app (sync and files), not the sync module alone: "Saved" only when
  // nothing is unsent anywhere, the same count sign-out reports. (The files module says 'saving'; the chip's word is 'pending'.)
  /** @param {(st: { state: string, count: number }) => void} fn */
  const chipStatus$ = fn => app.status$(st => {
    const state = st.state === 'saving' ? 'pending' : st.state;
    fn(state === 'synced' && st.unsent > 0 ? { state: 'pending', count: st.unsent } : { state, count: st.count });
  });
  syncChip($('sync-chip'), { sync: /** @type {any} */ ({ status$: chipStatus$ }) });   // (the chip reads only status$)
  // the bar's sync button: the same state; a tap wakes the sync and sends what waits now (window.starter.syncTaps for the tests)
  syncButton($('sync-btn'), { sync: /** @type {any} */ ({ status$: chipStatus$ }), syncNow: async () => {
    window.starter.syncTaps = Number(window.starter.syncTaps ?? 0) + 1;
    app.sync.nudge('wake'); await app.sync.flush();
  } });
  chipStatus$(st => { window.starter.status = st.state; });
  const list = views(app);
  const show = screenSwitch({
    'signed-out': signedOutScreen(app, { onForget: ok => { if (ok) $('sign-out-msg').textContent = ''; } }),
    'no-access': noAccessScreen(),
    'not-set-up': notSetUpScreen(),
    ready: list,
  });
  $('sign-out').addEventListener('click', async () => {
    const unsent = await app.signOut();
    $('sign-out-msg').textContent = unsent
      ? `Signed out. ${plural(unsent, 'unsent change')} kept on this device; they send when you sign in again.`
      : 'Signed out. The list is kept on this device for your next sign-in.';
  });
  // Back after a redirect sign-in comes to the page the sign-in left from, kept whole by the browser (the back/forward
  // cache) and still on the sign-in screen: load it again, so it opens as it is now (the list)
  let phase = '';
  addEventListener('pageshow', e => { if (e.persisted && phase !== 'ready') location.reload(); });
  app.follow({
    onState(s) {
      phase = s.phase;
      $('who').textContent = s.user ? s.user.email : '';
      $('sign-out').hidden = !s.user;
      if (s.user) $('sign-out-msg').textContent = '';
      // sign-in, access and set-up live on Today: with Home set to another tab, the app would open on a blank page
      if (s.phase !== 'ready') showToday();
      show(s);
    },
    onData(data, changed) {
      list.draw(data, changed);
      keepList(list.shown());
      window.starter.ready = true;
    },
    onFiles(by) { list.drawFiles(by); },
  });
}
