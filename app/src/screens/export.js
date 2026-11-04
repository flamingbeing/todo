// The export page (Settings > More), the mirror of the import page: the person pastes their personal API token, the page
// reads which projects and labels the account has, shows what would be added, and on a second tap writes it with the Sync
// API's commands (export-map.js says which). Only this app's open tasks go; the export adds, it never changes or removes.
// The token is typed once and used once: it lives in one variable (the field is emptied at once), never in storage, a draft,
// a log or a request to this app's own server, and it is dropped when the writes end, and again on leaving the page.
import { icon, confirmModal, plural } from '@core/ui';
import { ICONS } from '../icons.js';
import { MORE } from '../icons-more.js';
import { mapExport, batches, prepare, readAnswer } from '../export-map.js';
import { SYNC_URL, fetchSync } from './import.js';

/** @param {string} tag @param {string} [cls] @param {string} [text] */
const el = (tag, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
/** @param {number} ms */
const wait = ms => new Promise(ok => setTimeout(ok, ms));

/**
 * One request of commands. Returns the parsed answer; throws an Error whose message is what the page says.
 * @param {string} token @param {import('../export-map.js').Command[]} commands @param {typeof fetch} fetcher @param {AbortSignal} signal
 * @param {(ms: number) => Promise<void>} [pause]
 * @returns {Promise<any>}
 */
export async function sendCommands(token, commands, fetcher, signal, pause = wait) {
  const body = () => new URLSearchParams({ commands: JSON.stringify(commands.map(c => ({ type: c.type, uuid: c.uuid, ...(c.temp_id ? { temp_id: c.temp_id } : {}), args: c.args }))) });
  for (let attempt = 0; ; attempt++) {
    /** @type {Response} */
    let res;
    try {
      res = await fetcher(SYNC_URL, {
        method: 'POST', signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: body(),
      });
    } catch {
      throw new Error(signal.aborted ? 'That took too long.' : 'Could not reach the server.');
    }
    if (res.status === 429 && attempt < 2) {   // too many requests: wait as long as the server asks (up to a minute), then try once more
      const secs = Number(res.headers.get('retry-after'));
      await pause(Math.min(60, Number.isFinite(secs) && secs > 0 ? secs : 10) * 1000);
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new Error('That token was not accepted.');
    if (res.status === 429) throw new Error('Too many tries just now. Wait a few minutes and try again.');
    if (!res.ok) throw new Error(`The server answered ${res.status}.`);
    try { return await res.json(); } catch { throw new Error('The answer was not readable.'); }
  }
}

/**
 * The page, drawn into host. @param {HTMLElement} host
 * @param {{ app: import('../items.js').ItemsApp, fetcher?: typeof fetch, id?: () => string, pause?: (ms: number) => Promise<void> }} o
 * @returns {{ leave: () => void, destroy: () => void }}  leave: the page is no longer shown (the token goes, the preview too)
 */
export function exportScreen(host, { app, fetcher = (...a) => fetch(...a), id, pause }) {
  let token = '', busy = false, sending = false;
  /** @type {import('../export-map.js').Exported | null} */
  let plan = null;
  /** @type {AbortController | null} */
  let aborter = null;

  const root = el('div', 'td-import td-export');
  const intro = el('p', 'td-import-intro',
    'Copy your projects, sections, labels and open tasks into your Todoist account. Copy your personal API token from the web settings of that app (Integrations, Developer). It is used once, in this browser only, and never saved.');
  const field = el('div', 'td-import-field');
  const label = /** @type {HTMLLabelElement} */ (el('label', 'td-import-label', 'API token'));
  const input = /** @type {HTMLInputElement} */ (el('input'));
  Object.assign(input, { type: 'password', id: 'export-token', autocomplete: 'off', spellcheck: false, autocapitalize: 'none', enterKeyHint: 'go' });
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
  const sync = () => { if (!sending && !busy && !plan) token = input.value.trim(); preview.disabled = !token || busy || sending || !!plan; };
  input.addEventListener('input', sync);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !preview.disabled) { e.preventDefault(); preview.click(); } });
  show.addEventListener('click', () => {
    const on = input.type === 'password';
    input.type = on ? 'text' : 'password';
    show.setAttribute('aria-pressed', String(on));
    show.setAttribute('aria-label', on ? 'Hide token' : 'Show token');
    show.replaceChildren(icon(on ? MORE.eyeOff : MORE.eye));
  });

  /** the preview card: what is there now, what would be added, and the Export button @param {{ projects: number, labels: number }} there */
  function drawPreview(there) {
    result.replaceChildren();
    if (!plan) return;
    const c = plan.counts;
    const card = el('section', 'td-import-card');
    card.setAttribute('aria-label', 'What would be added');
    card.append(el('p', 'td-import-h', `${plural(c.projects, 'project')}, ${plural(c.sections, 'section')}, ${plural(c.labels, 'label')}, ${plural(c.tasks, 'task')} will be added to your Todoist account`));
    const list = el('dl', 'td-import-counts');
    for (const [name, n] of /** @type {[string, number][]} */ ([['Projects', c.projects], ['Sections', c.sections], ['Labels', c.labels], ['Tasks', c.tasks]])) {
      const row = el('div', 'td-import-count'); row.append(el('dt', '', name), el('dd', '', String(n))); list.append(row);
    }
    card.append(list);
    card.append(el('p', 'td-import-note', `Your Todoist account has ${plural(there.projects, 'project')} and ${plural(there.labels, 'label')} now. Tasks in the Inbox go into its Inbox.`));
    if (c.skippedLabels) card.append(el('p', 'td-import-note', `${plural(c.skippedLabels, 'label')} left out: the account has ${c.skippedLabels === 1 ? 'it' : 'them'} already.`));
    card.append(el('p', 'td-import-note', 'Only open tasks are exported; finished tasks stay here.'));
    card.append(el('p', 'td-import-note', 'Export adds, it never changes what is there: running it twice makes duplicates.'));
    const go = /** @type {HTMLButtonElement} */ (el('button', 'td-primary td-import-go', 'Export'));
    go.type = 'button'; go.disabled = !plan.commands.length;
    if (!plan.commands.length) card.append(el('p', 'td-import-note', 'There is nothing to export.'));
    go.addEventListener('click', () => run(go));
    result.append(card, go);
  }

  preview.addEventListener('click', async () => {
    if (busy || !token) return;
    busy = true; preview.disabled = true; plan = null; result.replaceChildren();
    say('Reading your Todoist account…');
    aborter = new AbortController();
    const timer = setTimeout(() => aborter?.abort(), 30_000);
    try {
      const answer = await fetchSync(token, fetcher, aborter.signal, ['projects', 'labels']);
      const projects = (Array.isArray(answer?.projects) ? answer.projects : []).filter((/** @type {any} */ p) => p && !p.is_deleted && !p.is_archived);
      const labels = (Array.isArray(answer?.labels) ? answer.labels : []).filter((/** @type {any} */ l) => l && !l.is_deleted);
      const inbox = projects.find((/** @type {any} */ p) => p.inbox_project);
      if (!inbox?.id) throw new Error('Could not find the Inbox of that account.');
      input.value = '';   // the token now lives in the one variable
      plan = mapExport(app.data(), { inboxId: String(inbox.id), labelNames: labels.map((/** @type {any} */ l) => String(l.name ?? '')), ...(id ? { id } : {}) });
      say('');
      drawPreview({ projects: projects.filter((/** @type {any} */ p) => !p.inbox_project).length, labels: labels.length });
    } catch (e) {
      say(e instanceof Error ? e.message : 'Something went wrong.', true);
    } finally {
      clearTimeout(timer); busy = false; sync();
    }
  });

  /** the writes: projects, sections, labels, tasks, in requests of up to 100 commands, one after the other @param {HTMLButtonElement} go */
  async function run(go) {
    const p = plan;
    if (!p || sending || !token) return;
    const c = p.counts;
    if (!await confirmModal(`Add ${plural(c.tasks, 'task')} and ${plural(c.projects, 'project')} to your Todoist account? This adds; it does not check for copies.`, { title: 'Export', yes: 'Export' })) return;
    sending = true; go.disabled = true; preview.disabled = true;
    const total = p.commands.length;
    let done = 0;
    /** @type {Map<string, string>} */
    const mapping = new Map();
    /** @type {Map<string, string>} */
    const failed = new Map();
    /** @type {{ command: import('../export-map.js').Command, reason: string }[]} */
    const problems = [];
    let stopped = '';
    const added = { project_add: 0, section_add: 0, label_add: 0, item_add: 0 };
    result.replaceChildren();
    const bar = /** @type {HTMLProgressElement} */ (el('progress', 'td-import-bar'));
    bar.max = total; bar.value = 0; bar.setAttribute('aria-label', 'Export progress');
    result.append(bar);
    say(`Exporting… 0 of ${total}`);
    aborter = new AbortController();
    try {
      for (const batch of batches(p.commands)) {
        const { send, skipped } = prepare(batch, mapping, failed);
        problems.push(...skipped);
        if (send.length) {
          const answer = await sendCommands(token, send, fetcher, aborter.signal, pause);
          const read = readAnswer(send, answer, mapping, failed);
          problems.push(...read.failures);
          for (const s of send) if (!read.failures.some(f => f.command === s)) added[/** @type {keyof typeof added} */ (s.type)]++;
        }
        done += batch.length; bar.value = done;
        say(`Exporting… ${done} of ${total}`);
      }
    } catch (e) {
      stopped = e instanceof Error ? e.message : 'Something went wrong.';
    }
    forget();   // the token is not needed again
    sending = false; plan = null;
    result.replaceChildren();
    const sentCount = added.project_add + added.section_add + added.label_add + added.item_add;
    const clean = !stopped && !problems.length;
    say(stopped ? `Stopped: ${stopped} What was added stays there; the rest was not sent.` : '', !!stopped);
    const summary = el('section', 'td-import-card td-import-done');
    summary.setAttribute('aria-label', 'Exported');
    const head = el('p', clean ? 'td-import-done-title' : 'td-import-h');
    if (clean) head.append(icon(ICONS.circleCheck));
    head.append(clean ? `Added ${plural(added.item_add, 'task')} to your Todoist account`
      : `Added ${plural(added.item_add, 'task')} of ${c.tasks}${problems.length || stopped ? '; some did not go' : ''}`);
    summary.append(head, el('p', 'td-import-note',
      `${plural(added.project_add, 'project')}, ${plural(added.section_add, 'section')} and ${plural(added.label_add, 'label')} were added with them.`));
    if (problems.length) {
      summary.append(el('h3', 'td-import-h', `${plural(problems.length, 'item')} not added`));
      const ul = el('ul', 'td-import-unparsed');
      for (const x of problems.slice(0, 10)) { const li = el('li'); li.append(el('span', 'td-import-u-title', x.command.what), el('span', 'td-import-u-string', x.reason)); ul.append(li); }
      summary.append(ul);
      if (problems.length > 10) summary.append(el('p', 'td-import-note', `…and ${problems.length - 10} more.`));
    }
    if (!clean && sentCount) summary.append(el('p', 'td-import-note', 'What was added stays in Todoist. Running the export again adds everything again.'));
    result.append(summary);
    sync();
  }

  const leave = () => {
    aborter?.abort(); aborter = null;
    forget();
    input.type = 'password'; show.setAttribute('aria-pressed', 'false'); show.setAttribute('aria-label', 'Show token'); show.replaceChildren(icon(MORE.eye));
    if (sending) return;   // the writes stop with the abort; the page is drawn as it was
    plan = null; busy = false; say(''); result.replaceChildren();
  };
  return { leave, destroy() { leave(); root.remove(); } };
}
