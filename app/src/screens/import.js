// Settings > Import from Todoist: the person pastes their personal API token, the page fetches their projects, sections,
// labels, open tasks and filters straight from the browser (the API answers any origin, so no relay), shows what would
// come over, and on a second tap writes it through the write queue (import-map.js says what is written).
// The token is typed once and used once: it lives in the field and in one variable, never in storage, a draft, a log or a
// request to this app's own server, and both are emptied as soon as the fetch has answered, and again on leaving the page.
import { icon, confirmModal, plural } from '@core/ui';
import { ICONS } from '../icons.js';
import { MORE } from '../icons-more.js';
import { mapImport } from '../import-map.js';

/** the API's one full-sync address; the page's policy (worker/headers.js) allows only this host besides its own */
export const SYNC_URL = 'https://api.todoist.com/api/v1/sync';
const RESOURCES = ['projects', 'sections', 'labels', 'items', 'filters'];
const BATCH = 20;
const ORDER = /** @type {const} */ (['projects', 'sections', 'labels', 'filters', 'tasks']);

/** @param {string} tag @param {string} [cls] @param {string} [text] */
const el = (tag, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

/**
 * One full sync, as the parsed answer. Throws an Error whose message is what the page says.
 * @param {string} token @param {typeof fetch} fetcher @param {AbortSignal} signal
 */
export async function fetchSync(token, fetcher, signal) {
  /** @type {Response} */
  let res;
  try {
    res = await fetcher(SYNC_URL, {
      method: 'POST', signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ sync_token: '*', resource_types: JSON.stringify(RESOURCES) }),
    });
  } catch (e) {
    if (signal.aborted) throw new Error('That took too long. Try again.');
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  if (res.status === 401 || res.status === 403) throw new Error('That token was not accepted');
  if (res.status === 429) throw new Error('Too many tries just now. Wait a few minutes and try again.');
  if (!res.ok) throw new Error(`The server answered ${res.status}. Try again later.`);
  try { return await res.json(); } catch { throw new Error('The answer was not readable. Try again later.'); }
}

/**
 * The page, drawn into host. @param {HTMLElement} host
 * @param {{ app: import('../items.js').ItemsApp, openInbox?: () => void, fetcher?: typeof fetch, today?: () => string }} o
 * @returns {{ leave: () => void, destroy: () => void }}  leave: the page is no longer shown (the token goes, the preview too)
 */
export function importScreen(host, { app, openInbox = () => {}, fetcher = (...a) => fetch(...a), today }) {
  let token = '', busy = false, importing = false;
  /** @type {import('../import-map.js').Mapped | null} */
  let mapped = null;
  /** @type {AbortController | null} */
  let aborter = null;

  const root = el('div', 'td-import');
  const intro = el('p', 'td-import-intro',
    'Bring your projects, sections, labels, open tasks and filters over from your Todoist account. Copy your personal API token from the web app: Settings, Integrations, Developer. It is used once, in this browser only, and never saved.');
  const field = el('div', 'td-import-field');
  const label = /** @type {HTMLLabelElement} */ (el('label', 'td-import-label', 'API token'));
  const input = /** @type {HTMLInputElement} */ (el('input'));
  Object.assign(input, { type: 'password', id: 'import-token', autocomplete: 'off', spellcheck: false, autocapitalize: 'none', enterKeyHint: 'go' });
  input.setAttribute('autocorrect', 'off');
  input.dataset['1pIgnore'] = ''; input.dataset.lpignore = 'true'; input.dataset.formType = 'other';
  label.htmlFor = input.id;
  const show = /** @type {HTMLButtonElement} */ (el('button', 'td-import-show'));
  Object.assign(show, { type: 'button' });
  show.setAttribute('aria-label', 'Show token'); show.setAttribute('aria-pressed', 'false');
  show.append(icon(MORE.eye));
  const box = el('div', 'td-import-box');
  box.append(input, show);
  field.append(label, box);

  const preview = /** @type {HTMLButtonElement} */ (el('button', 'td-primary td-import-go', 'Preview'));
  preview.type = 'button'; preview.disabled = true;
  const status = el('p', 'td-import-status');
  status.setAttribute('role', 'status');
  const result = el('div', 'td-import-result');
  root.append(intro, field, preview, status, result);
  host.append(root);

  const say = (/** @type {string} */ text, error = false) => { status.textContent = text; status.classList.toggle('is-error', error); };
  const forget = () => { token = ''; input.value = ''; preview.disabled = true; };
  const sync = () => { token = input.value.trim(); preview.disabled = !token || busy || importing; };
  input.addEventListener('input', sync);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !preview.disabled) { e.preventDefault(); preview.click(); } });
  show.addEventListener('click', () => {
    const on = input.type === 'password';
    input.type = on ? 'text' : 'password';
    show.setAttribute('aria-pressed', String(on));
    show.setAttribute('aria-label', on ? 'Hide token' : 'Show token');
    show.replaceChildren(icon(on ? MORE.eyeOff : MORE.eye));
  });

  /** the preview card: counts, recurrences it can't read, and the Import button */
  function drawPreview() {
    result.replaceChildren();
    if (!mapped) return;
    const m = mapped, c = m.counts;
    const card = el('section', 'td-import-card');
    card.setAttribute('aria-label', 'What would come over');
    const rows = /** @type {[string, number][]} */ ([['Projects', c.projects], ['Sections', c.sections], ['Labels', c.labels], ['Tasks', c.tasks],
      ['Repeating tasks', c.recurring], ['Filters', c.filters]]);
    const list = el('dl', 'td-import-counts');
    for (const [name, n] of rows) { const row = el('div', 'td-import-count'); row.append(el('dt', '', name), el('dd', '', String(n))); list.append(row); }
    card.append(list);
    if (c.skipped) card.append(el('p', 'td-import-note', `${plural(c.skipped, 'task')} left out: finished, or in a project that is not imported.`));
    if (m.unparsed.length) {
      const h = el('h3', 'td-import-h', `${plural(m.unparsed.length, 'repeat')} this app can't read`);
      const ul = el('ul', 'td-import-unparsed');
      for (const u of m.unparsed) { const li = el('li'); li.append(el('span', 'td-import-u-title', u.title), el('span', 'td-import-u-string', u.string || 'no words')); ul.append(li); }
      card.append(h, el('p', 'td-import-note', 'These come over as plain tasks on their next date; set the repeat again by hand.'), ul);
    }
    card.append(el('p', 'td-import-note', 'Anything imported before is updated, not added twice.'));
    const go = /** @type {HTMLButtonElement} */ (el('button', 'td-primary td-import-go', 'Import'));
    go.type = 'button'; go.disabled = !c.changed;
    if (!c.changed) card.append(el('p', 'td-import-note', 'Everything here is already imported.'));
    go.addEventListener('click', () => run(go));
    result.append(card, go);
  }

  preview.addEventListener('click', async () => {
    if (busy || !token) return;
    busy = true; preview.disabled = true; mapped = null; drawPreview();
    say('Fetching…');
    aborter = new AbortController();
    const timer = setTimeout(() => aborter?.abort(), 30_000);
    try {
      const answer = await fetchSync(token, fetcher, aborter.signal);
      forget();   // the token is not needed again
      mapped = mapImport(answer, { today: today?.(), existing: app.data() });
      const c = mapped.counts;
      if (!c.projects && !c.tasks && !c.labels && !c.filters) { say('There is nothing to import in that account.'); mapped = null; }
      else say('');
      drawPreview();
    } catch (e) {
      say(e instanceof Error ? e.message : 'Something went wrong.', true);
    } finally {
      clearTimeout(timer); busy = false; sync();
    }
  });

  /** the writes, in order: projects, sections, labels, filters, tasks (parents first, as the mapper ordered them) @param {HTMLButtonElement} go */
  async function run(go) {
    const m = mapped;
    if (!m || importing) return;
    const n = m.counts.tasks;
    if (!await confirmModal(`Import ${plural(n, 'task')} into this account?`, { title: 'Import', yes: 'Import' })) return;
    importing = true; go.disabled = true; preview.disabled = true;
    const total = ORDER.reduce((sum, k) => sum + m.writes[k].length, 0);
    let done = 0, failed = '';
    result.replaceChildren();
    const bar = /** @type {HTMLProgressElement} */ (el('progress', 'td-import-bar'));
    bar.max = total; bar.value = 0; bar.setAttribute('aria-label', 'Import progress');
    result.append(bar);
    say(`Importing… 0 of ${total}`);
    try {
      for (const kind of ORDER) {
        const coll = kind;
        const all = m.writes[kind];
        for (let i = 0; i < all.length && !failed; i += BATCH) {
          const batch = all.slice(i, i + BATCH);
          const reasons = await Promise.all(batch.map(w => app.writeRecord(coll, w.rec, w.base)));
          failed = reasons.find(Boolean) || '';
          done += batch.length; bar.value = done;
          say(`Importing… ${done} of ${total}`);
        }
        if (failed) break;
      }
    } catch (e) {
      failed = e instanceof Error ? e.message : 'Something went wrong.';
    }
    importing = false; mapped = null;
    result.replaceChildren();
    if (failed) {
      say(`Stopped after ${done} of ${total}: ${failed} What was saved stays; import again to carry on.`, true);
      sync();
      return;
    }
    say('');
    const summary = el('section', 'td-import-card td-import-done');
    summary.setAttribute('aria-label', 'Imported');
    const head = el('p', 'td-import-done-title');
    head.append(icon(ICONS.circleCheck), `Imported ${plural(m.counts.tasks, 'task')}`);
    summary.append(head, el('p', 'td-import-note',
      `${plural(m.counts.projects, 'project')}, ${plural(m.counts.sections, 'section')}, ${plural(m.counts.labels, 'label')} and ${plural(m.counts.filters, 'filter')} came with them.`));
    const open = /** @type {HTMLButtonElement} */ (el('button', 'td-primary td-import-go', 'Open Inbox'));
    open.type = 'button'; open.addEventListener('click', () => openInbox());
    result.append(summary, open);
    sync();
  }

  const leave = () => {
    aborter?.abort(); aborter = null;
    forget();
    input.type = 'password'; show.setAttribute('aria-pressed', 'false'); show.setAttribute('aria-label', 'Show token'); show.replaceChildren(icon(MORE.eye));
    if (importing) return;   // the writes carry on; the page is drawn as it was
    mapped = null; busy = false; say(''); result.replaceChildren();
  };
  return { leave, destroy() { leave(); root.remove(); } };
}
