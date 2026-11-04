// The export's pure half (the mirror of import-map.js): this app's records become Todoist Sync API commands
// (screens/export.js sends them). Nothing here touches the network, the clock or the page.
//
// The mapping, in short: only open tasks go (finished ones stay here); the app's Inbox is the account's own Inbox (its id
// is passed in, never a new project); projects, sections and tasks are linked with temp ids, parents before children;
// priorities flip back (the API's 4 is the top one: theirs = 5 - ours); orders become 0..n among the siblings; labels go by
// name (a name the account already has is skipped); a repeating task sends its own words ("every 3 days") so the repeat
// survives, any other due sends the day, or the day and time as a floating 'YYYY-MM-DDTHH:MM:00'.
import { APP } from './config.js';
import { INBOX } from './items.js';
import { isColor } from './colors.js';
import { isDay, isTime } from './dates.js';

/** @typedef {import('./items.js').Data} Data */
/** @typedef {{ type: string, temp_id?: string, uuid: string, args: Record<string, any>, deps: string[], what: string }} Command
 *   what: the thing in plain words ("task Buy milk"), for the failure list; deps: temp ids this command needs made first */
/** @typedef {{ projects: number, sections: number, labels: number, tasks: number, skippedLabels: number, skippedTasks: number }} ExportCounts */
/** @typedef {{ counts: ExportCounts, commands: Command[] }} Exported */

/** the most commands one request may carry (the API's limit is 100) */
export const BATCH = 100;

/** @param {unknown} v @param {number} n */
const text = (v, n) => String(v ?? '').trim().slice(0, n);
/** @param {{ order?: unknown }} a @param {{ order?: unknown }} b */
const byOrder = (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0);
const uid = () => globalThis.crypto.randomUUID();

/**
 * The due argument: a repeating task sends its own words (so the repeat is kept), else the day, or the day and time as a
 * floating one. @param {import('./dates.js').Due | null | undefined} due @returns {Record<string, string> | null}
 */
export function dueArg(due) {
  if (!due || !isDay(due.date)) return null;
  const words = text(due.string, 200);
  if (due.rrule && words) return { string: words };
  return { date: due.time && isTime(due.time) ? `${due.date}T${due.time}:00` : due.date };
}

/** the parents-first order of records with a parent link (a cycle or a missing parent ends the chain)
 * @template {{ id: string }} T @param {T[]} recs @param {(r: T) => string | null | undefined} parentOf @returns {T[]} */
function parentsFirst(recs, parentOf) {
  const by = new Map(recs.map(r => [r.id, r]));
  /** @param {T} r */
  const depth = r => { let d = 0; const seen = new Set([r.id]); for (let p = by.get(parentOf(r) ?? ''); p && !seen.has(p.id); p = by.get(parentOf(p) ?? '')) { seen.add(p.id); d++; } return d; };
  return recs.map((r, i) => ({ r, d: depth(r), i })).sort((a, b) => a.d - b.d || a.i - b.i).map(x => x.r);
}

/**
 * @param {Partial<Data>} data  the records the app has now
 * @param {{ inboxId: string, labelNames?: Iterable<string>, id?: () => string }} o
 *   inboxId: the account's Inbox project id; labelNames: the label names the account already has (skipped); id: a temp id / uuid maker
 * @returns {Exported}
 */
export function mapExport(data, { inboxId, labelNames = [], id = uid }) {
  /** @template T @param {T[] | undefined} l @returns {T[]} */
  const live = l => (l ?? []).filter(x => x && !(/** @type {{ _deleted?: boolean }} */ (x))._deleted);
  const projects = live(data.projects), sections = live(data.sections), labels = live(data.labels);
  const open = live(data.tasks).filter(t => !t.done && text(t.title, 500));
  /** @type {Command[]} */
  const commands = [];
  /** @param {string} type @param {string} what @param {Record<string, any>} args @param {string[]} [deps] @param {string} [temp] */
  const add = (type, what, args, deps = [], temp = '') => { commands.push({ type, uuid: id(), ...(temp ? { temp_id: temp } : {}), args, deps, what }); };

  // projects: parents first; the Inbox is the account's own
  /** @type {Map<string, string>} app id -> temp id, or the real id for the Inbox */
  const projectRef = new Map();
  const wanted = projects.filter(p => !p.inbox && p.id !== INBOX);
  projectRef.set(INBOX, inboxId);
  for (const p of projects) if (p.inbox) projectRef.set(p.id, inboxId);
  for (const p of wanted) projectRef.set(p.id, id());
  const projectSibs = new Map();
  for (const p of parentsFirst([...wanted].sort(byOrder), p => p.parentId)) {
    const parent = p.parentId && p.parentId !== p.id && wanted.some(x => x.id === p.parentId) ? /** @type {string} */ (projectRef.get(p.parentId)) : '';
    const n = projectSibs.get(parent) ?? 0; projectSibs.set(parent, n + 1);
    add('project_add', `project ${text(p.name, 120) || 'Untitled'}`, {
      name: text(p.name, 120) || 'Untitled', ...(isColor(p.color) ? { color: p.color } : {}), ...(parent ? { parent_id: parent } : {}),
      view_style: p.view === 'board' ? 'board' : 'list', is_favorite: !!p.favorite, child_order: n,
    }, parent ? [parent] : [], /** @type {string} */ (projectRef.get(p.id)));
  }

  // sections
  /** @type {Map<string, string>} */
  const sectionRef = new Map();
  const secs = sections.filter(s => projectRef.has(s.projectId)).sort(byOrder);
  const sectionSibs = new Map();
  for (const s of secs) {
    const project = /** @type {string} */ (projectRef.get(s.projectId)), temp = id();
    sectionRef.set(s.id, temp);
    const n = sectionSibs.get(project) ?? 0; sectionSibs.set(project, n + 1);
    add('section_add', `section ${text(s.name, 120) || 'Untitled'}`, { name: text(s.name, 120) || 'Untitled', project_id: project, section_order: n + 1 }, project === inboxId ? [] : [project], temp);
  }

  // labels: by name; a name the account has already is skipped
  const have = new Set([...labelNames].map(n => String(n).toLowerCase()));
  /** @type {Map<string, string>} app label id -> name */
  const labelName = new Map();
  let skippedLabels = 0, nLabels = 0;
  for (const l of [...labels].sort(byOrder)) {
    const name = text(l.name, 60);
    if (!name) continue;
    labelName.set(l.id, name);
    if (have.has(name.toLowerCase())) { skippedLabels++; continue; }
    have.add(name.toLowerCase());
    add('label_add', `label ${name}`, { name, ...(isColor(l.color) ? { color: l.color } : {}), item_order: ++nLabels, is_favorite: !!l.favorite });
  }

  // tasks: parents first; one whose project is gone is left out, and a child whose parent is not open becomes a plain task
  const sendable = open.filter(t => projectRef.has(t.projectId));
  const openIds = new Set(sendable.map(t => t.id));
  /** @param {import('./items.js').Task} t */
  const parentOf = t => (t.parentId && t.parentId !== t.id && openIds.has(t.parentId) ? t.parentId : '');
  /** @type {Map<string, string>} */
  const taskRef = new Map(sendable.map(t => [t.id, id()]));
  const taskSibs = new Map();
  for (const t of parentsFirst([...sendable].sort(byOrder), parentOf)) {
    const project = /** @type {string} */ (projectRef.get(t.projectId));
    const section = t.sectionId && sectionRef.has(t.sectionId) ? /** @type {string} */ (sectionRef.get(t.sectionId)) : '';
    const parent = parentOf(t) ? /** @type {string} */ (taskRef.get(parentOf(t))) : '';
    const key = `${project}|${section}|${parent}`, n = taskSibs.get(key) ?? 0; taskSibs.set(key, n + 1);
    const names = [...new Set((t.labels ?? []).map(l => labelName.get(l)).filter(Boolean))];
    const due = dueArg(t.due), body = text(t.description, 16000);
    const dur = Math.round(Number(t.duration));
    const deps = [project, section, parent].filter(x => x && x !== inboxId);
    add('item_add', `task ${text(t.title, 60)}`, {
      content: text(t.title, 500), ...(body ? { description: body } : {}), project_id: project,
      ...(section ? { section_id: section } : {}), ...(parent ? { parent_id: parent } : {}),
      priority: Math.min(4, Math.max(1, 5 - (Number(t.priority) || 4))), ...(names.length ? { labels: names } : {}),
      ...(due ? { due } : {}), ...(t.deadline && isDay(t.deadline) ? { deadline: { date: t.deadline } } : {}),
      ...(due && t.due?.time && dur >= 1 ? { duration: { amount: Math.min(1440, dur), unit: 'minute' } } : {}), child_order: n,
    }, deps, /** @type {string} */ (taskRef.get(t.id)));
  }

  const count = (/** @type {string} */ type) => commands.filter(c => c.type === type).length;
  return { commands, counts: { projects: count('project_add'), sections: count('section_add'), labels: count('label_add'), tasks: count('item_add'), skippedLabels, skippedTasks: open.length - sendable.length } };
}

/** the commands as requests of at most `size`, in order @param {Command[]} commands @param {number} [size] */
export function batches(commands, size = BATCH) {
  /** @type {Command[][]} */
  const out = [];
  for (let i = 0; i < commands.length; i += size) out.push(commands.slice(i, i + size));
  return out;
}

/**
 * One request's worth, ready to send: a temp id an earlier request made is swapped for the real id it got, and a command that
 * needs something that failed is left out (with its reason).
 * @param {Command[]} batch @param {Map<string, string>} mapping temp id -> real id  @param {Map<string, string>} failed temp id -> why
 * @returns {{ send: Command[], skipped: { command: Command, reason: string }[] }}
 */
export function prepare(batch, mapping, failed) {
  /** @type {Command[]} */
  const send = [];
  /** @type {{ command: Command, reason: string }[]} */
  const skipped = [];
  for (const c of batch) {
    const bad = c.deps.find(d => failed.has(d));
    if (bad) {
      skipped.push({ command: c, reason: 'what it belongs to was not added' });
      if (c.temp_id) failed.set(c.temp_id, 'what it belongs to was not added');
      continue;
    }
    const args = { ...c.args };
    for (const k of ['project_id', 'section_id', 'parent_id']) if (typeof args[k] === 'string' && mapping.has(args[k])) args[k] = mapping.get(args[k]);
    send.push({ ...c, args });
  }
  return { send, skipped };
}

/** the API's words for an error, made plain @param {unknown} s */
function plainError(s) {
  const o = /** @type {Record<string, any> | null} */ (s && typeof s === 'object' ? s : null);
  const msg = text(o?.error ?? s, 160);
  return msg ? msg.replace(/\.$/, '') : 'the server refused it';
}

/**
 * Read one answer: what each command got (sync_status by uuid) and the real ids (temp_id_mapping). A command the answer
 * does not mention counts as failed. Updates mapping and failed; returns the failures.
 * @param {Command[]} sent @param {any} answer @param {Map<string, string>} mapping @param {Map<string, string>} failed
 * @returns {{ ok: number, failures: { command: Command, reason: string }[] }}
 */
export function readAnswer(sent, answer, mapping, failed) {
  const status = answer && typeof answer.sync_status === 'object' && answer.sync_status ? answer.sync_status : {};
  const ids = answer && typeof answer.temp_id_mapping === 'object' && answer.temp_id_mapping ? answer.temp_id_mapping : {};
  for (const [k, v] of Object.entries(ids)) mapping.set(k, String(v));
  let ok = 0;
  /** @type {{ command: Command, reason: string }[]} */
  const failures = [];
  for (const c of sent) {
    const s = status[c.uuid];
    if (s === 'ok') { ok++; continue; }
    const reason = s === undefined ? 'the server did not answer for it' : plainError(s);
    failures.push({ command: c, reason });
    if (c.temp_id) failed.set(c.temp_id, reason);
  }
  return { ok, failures };
}

/** the fields that belong to syncing, not to the person's records */
const INTERNAL = new Set(['_edits', 'serverAt', '_deleted']);

/** the file name of a backup, from the local day @param {string} day YYYY-MM-DD */
export const backupName = day => `${APP.name}-backup-${day}.json`;

/**
 * Everything the person has as one JSON text: projects, sections, labels, filters, tasks (open and finished), comments and
 * templates, without the sync-internal fields; records marked deleted are left out.
 * @param {Partial<Data>} data @param {{ day: string, now?: number }} o @returns {string}
 */
export function backupJson(data, { day, now = Date.now() }) {
  /** @param {any[] | undefined} list */
  const clean = list => (Array.isArray(list) ? list : []).filter(r => r && typeof r === 'object' && !r._deleted)
    .map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !INTERNAL.has(k))));
  return JSON.stringify({
    app: APP.name, kind: 'backup', day, savedAt: now,
    projects: clean(data.projects), sections: clean(data.sections), labels: clean(data.labels), filters: clean(data.filters),
    tasks: clean(data.tasks), comments: clean(data.comments), templates: clean(data.templates),
  }, null, 2);
}
