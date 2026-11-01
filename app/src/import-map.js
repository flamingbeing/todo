// The import's pure half: one full sync answer (the request is in screens/import.js: sync_token=* and
// resource_types=["projects","sections","labels","items","filters"]) becomes the records this app
// writes. Nothing here touches the network, the clock or the page: the caller passes the day, an id maker and the
// records the app already has, so the same import twice gives the same records (every record keeps the source's id in
// `extId`, and a second run updates those instead of adding copies).
//
// The mapping, in short: deleted, completed and archived things are left out; the source Inbox is this app's Inbox
// (merged, never a second one); colours keep their names (an unknown one is charcoal); priorities flip (the source's 4 is
// the top one: ours = 5 - theirs); orders become 1..n among the siblings; task labels, which come as names, become label
// ids (a missing label is made); a due day with a "Z" time is turned into this device's local time; a repeating task keeps
// its date and its words are read with recur.js (words it can't read are listed and the task imports as a plain dated one).
import { INBOX } from './items.js';
import { isColor, DEFAULT_COLOR } from './colors.js';
import { isDay, isTime, dayKey, timeKey } from './dates.js';
import { findRecur } from './recur.js';

/** @typedef {import('./items.js').Data} Data */
/** @typedef {{ rec: Record<string, any>, base: Record<string, any> | null }} Write  rec: the record to save; base: the copy it starts from (null: new) */
/** @typedef {{ projects: Write[], sections: Write[], labels: Write[], filters: Write[], tasks: Write[] }} Writes */
/** @typedef {{ title: string, string: string }} Unparsed */
/** @typedef {{ projects: number, sections: number, labels: number, tasks: number, recurring: number, filters: number,
 *   skipped: number, changed: number }} Counts  the first six are what the source holds that imports; changed: records that would be written */
/** @typedef {{ counts: Counts, unparsed: Unparsed[], writes: Writes }} Mapped */

const EMPTY = /** @type {Data} */ ({ tasks: [], projects: [], sections: [], labels: [], filters: [] });
/** @param {unknown} v @returns {Record<string, any>[]} */
const list = v => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []);
/** @param {unknown} v */
const ext = v => (v === undefined || v === null || v === '' ? '' : String(v).slice(0, 64));
/** @param {unknown} v @param {number} n */
const text = (v, n) => String(v ?? '').trim().slice(0, n);
/** an item the source marks gone, done or archived @param {Record<string, any>} x */
const gone = x => !!(x.is_deleted || x.is_archived || x.checked || x.completed_at);

/** the siblings' order: child_order / section_order / item_order when numbers, else the order_key text @param {Record<string, any>} a @param {Record<string, any>} b @param {string} field */
function bySource(a, b, field) {
  if (typeof a[field] === 'number' && typeof b[field] === 'number' && a[field] !== b[field]) return a[field] - b[field];
  const x = String(a.order_key ?? ''), y = String(b.order_key ?? '');
  return x < y ? -1 : x > y ? 1 : 0;
}

/** @template T @param {T[]} items @param {(x: T) => string} key @returns {Map<string, T[]>} */
function groups(items, key) {
  /** @type {Map<string, T[]>} */
  const out = new Map();
  for (const x of items) { const k = key(x); if (!out.has(k)) out.set(k, []); /** @type {T[]} */ (out.get(k)).push(x); }
  return out;
}

/** a label name the rules accept (no # @ % /) @param {unknown} name */
export const labelName = name => text(name, 60).replace(/[#@%/]/g, '-').trim();

/** a day that exists (not 2026-13-45) @param {string} s */
const real = s => isDay(s) && new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8))).toISOString().slice(0, 10) === s;

/**
 * A due map from the source's: 'YYYY-MM-DD', 'YYYY-MM-DDTHH:MM:SS' (floating: the same clock wherever) or with a Z (fixed: a
 * moment, shown on this device's clock).
 * @param {unknown} date @returns {{ date: string, time?: string } | null}
 */
export function dueFrom(date) {
  const s = String(date ?? '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return real(s) ? { date: s } : null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
  if (!m || !real(m[1])) return null;
  if (!m[3]) return isTime(m[2]) ? { date: m[1], time: m[2] } : { date: m[1] };
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? { date: m[1] } : { date: dayKey(d), time: timeKey(d) };
}

/** whether a saved copy already holds every field of rec @param {Record<string, any>} rec @param {Record<string, any>} base */
const same = (rec, base) => Object.entries(rec).every(([k, v]) => JSON.stringify(v ?? null) === JSON.stringify(base[k] ?? null));

/**
 * @param {any} sync  the sync answer (a missing resource is empty)
 * @param {{ today?: string, id?: () => string, now?: () => number, existing?: Partial<Data> }} [o]
 *   today: the local day (for reading "every …" words); id: a new record's id; existing: the records the app has now
 * @returns {Mapped}
 */
export function mapImport(sync, { today = dayKey(), id = () => Math.random().toString(36).slice(2, 12), now = Date.now, existing = {} } = {}) {
  const have = { ...EMPTY, ...existing };
  /** @param {{ id: string, extId?: unknown }[]} recs */
  const byExt = recs => new Map(recs.filter(r => r.extId).map(r => [String(r.extId), r]));
  const known = { projects: byExt(have.projects), sections: byExt(have.sections), labels: byExt(have.labels), filters: byExt(have.filters), tasks: byExt(have.tasks) };
  /** @type {Writes} */
  const writes = { projects: [], sections: [], labels: [], filters: [], tasks: [] };
  /** @type {Unparsed[]} */
  const unparsed = [];
  let skipped = 0, recurring = 0;

  /** one record of a collection: reuse the saved copy with this extId, keep what the source does not own @param {keyof Writes} coll @param {string} extId
   * @param {Record<string, any>} fields @param {{ id?: string, keep?: string[] }} [o] @returns {string} the record's id */
  const put = (coll, extId, fields, { id: fixed, keep = [] } = {}) => {
    const base = fixed ? (/** @type {any[]} */ (have[coll]).find(r => r.id === fixed) ?? null) : known[coll].get(extId) ?? null;
    const rid = base?.id ?? fixed ?? id();
    /** @type {Record<string, any>} */
    const rec = { ...(base ?? {}), ...fields, id: rid, extId };
    for (const k of keep) if (base && k in base) rec[k] = base[k];
    if (!base) rec.createdAt = typeof fields.createdAt === 'number' ? fields.createdAt : now();
    else rec.createdAt = base.createdAt ?? now();
    if (!base || !same(rec, base)) writes[coll].push({ rec, base });
    return rid;
  };

  // projects: the Inbox is ours already; the rest in the source's order among the same parent
  const projects = list(sync?.projects).filter(p => !(p.is_deleted || p.is_archived));
  /** @type {Map<string, string>} the source project id -> ours */
  const projectIds = new Map();
  for (const p of projects) {
    const sid = ext(p.id);
    if (!sid) continue;
    projectIds.set(sid, p.inbox_project ? INBOX : known.projects.get(sid)?.id ?? id());
  }
  let nProjects = 0;
  for (const [, sibs] of groups(projects.filter(p => ext(p.id)), p => (projectIds.has(ext(p.parent_id)) && !p.inbox_project ? ext(p.parent_id) : ''))) {
    sibs.sort((a, b) => bySource(a, b, 'child_order'));
    let n = 0;
    for (const p of sibs) {
      const sid = ext(p.id), isInbox = !!p.inbox_project, ours = /** @type {string} */ (projectIds.get(sid));
      const parent = !isInbox && projectIds.get(ext(p.parent_id)) !== ours ? projectIds.get(ext(p.parent_id)) ?? null : null;
      if (isInbox) {
        // the Inbox keeps its name, colour and place; it only learns where it came from
        const base = have.projects.find(x => x.id === INBOX);
        put('projects', sid, base ? {} : { name: 'Inbox', color: DEFAULT_COLOR, parentId: null, order: 0, view: p.view_style === 'board' ? 'board' : 'list', inbox: true }, { id: INBOX });
        continue;
      }
      nProjects++;
      put('projects', sid, {
        name: text(p.name, 120) || 'Untitled', color: isColor(p.color) ? p.color : DEFAULT_COLOR, parentId: parent, order: ++n,
        favorite: !!p.is_favorite, view: p.view_style === 'board' ? 'board' : 'list', collapsed: !!p.is_collapsed,
      }, { id: ours });
    }
  }

  // sections: in a project's section order
  const sections = list(sync?.sections).filter(s => !gone(s) && projectIds.has(ext(s.project_id)) && ext(s.id));
  /** @type {Map<string, string>} */
  const sectionIds = new Map();
  for (const [, sibs] of groups(sections, s => ext(s.project_id))) {
    sibs.sort((a, b) => bySource(a, b, 'section_order'));
    let n = 0;
    for (const s of sibs) {
      const sid = ext(s.id);
      sectionIds.set(sid, put('sections', sid, {
        name: text(s.name, 120) || 'Untitled', projectId: projectIds.get(ext(s.project_id)), order: ++n, collapsed: !!s.is_collapsed,
      }));
    }
  }

  // labels: in item_order; the names that tasks use but the label list lacks are made
  /** @type {Map<string, string>} a label name (lower case) -> its id */
  const labelIds = new Map();
  const labels = list(sync?.labels).filter(l => !l.is_deleted && labelName(l.name)).sort((a, b) => bySource(a, b, 'item_order') || bySource(a, b, 'order'));
  let nLabels = 0;
  for (const l of labels) {
    const name = labelName(l.name), sid = ext(l.id);
    if (labelIds.has(name.toLowerCase())) continue;
    const base = (sid && known.labels.get(sid)) || have.labels.find(x => x.name.toLowerCase() === name.toLowerCase()) || null;
    nLabels++;
    labelIds.set(name.toLowerCase(), put('labels', sid || `label:${name.toLowerCase()}`.slice(0, 64), {
      name, color: isColor(l.color) ? l.color : DEFAULT_COLOR, order: nLabels, favorite: !!l.is_favorite,
    }, base ? { id: base.id } : {}));
  }
  /** a label name used by a task -> its id (made when new) @param {unknown} raw */
  const labelFor = raw => {
    const name = labelName(raw), k = name.toLowerCase();
    if (!name) return '';
    if (!labelIds.has(k)) {
      const base = have.labels.find(x => x.name.toLowerCase() === k);
      labelIds.set(k, put('labels', `label:${k}`.slice(0, 64), { name, color: DEFAULT_COLOR, order: have.labels.length + labelIds.size + 1, favorite: false }, base ? { id: base.id, keep: ['color', 'order', 'favorite'] } : {}));
      nLabels++;
    }
    return /** @type {string} */ (labelIds.get(k));
  };

  // filters: in item_order, the query kept as it is (what this app can't read shows as the filter's own error)
  const filters = list(sync?.filters).filter(f => !f.is_deleted && ext(f.id) && text(f.name, 120) && text(f.query, 1000));
  filters.sort((a, b) => bySource(a, b, 'item_order'));
  filters.forEach((f, i) => put('filters', ext(f.id), {
    name: text(f.name, 120), query: text(f.query, 1000), color: isColor(f.color) ? f.color : DEFAULT_COLOR, order: i + 1, favorite: !!f.is_favorite,
  }));

  // tasks: the open ones in a kept project; a subtask whose parent was left out stands on its own
  const items = list(sync?.items ?? sync?.tasks).filter(t => ext(t.id));
  const open = items.filter(t => {
    const ok = !gone(t) && projectIds.has(ext(t.project_id)) && !!text(t.content, 500) && (!ext(t.section_id) || sectionIds.has(ext(t.section_id)));
    if (!ok && !t.is_deleted) skipped++;
    return ok;
  });
  const openIds = new Set(open.map(t => ext(t.id)));
  const parentOf = (/** @type {Record<string, any>} */ t) => (openIds.has(ext(t.parent_id)) ? ext(t.parent_id) : '');
  /** @type {Map<string, string>} */
  const taskIds = new Map(open.map(t => [ext(t.id), known.tasks.get(ext(t.id))?.id ?? id()]));
  /** depth, so a parent is written before its children @param {Record<string, any>} t */
  const depth = t => { let d = 0, p = parentOf(t); const seen = new Set(); while (p && !seen.has(p) && d < 20) { seen.add(p); d++; p = parentOf(/** @type {Record<string, any>} */ (open.find(x => ext(x.id) === p))); } return d; };
  /** @type {Map<string, number>} */
  const order = new Map();
  for (const [, sibs] of groups(open, t => `${ext(t.project_id)}|${ext(t.section_id)}|${parentOf(t)}`)) {
    sibs.sort((a, b) => bySource(a, b, 'child_order'));
    sibs.forEach((t, i) => order.set(ext(t.id), i + 1));
  }
  let nTasks = 0;
  for (const t of open.map(x => ({ t: x, d: depth(x) })).sort((a, b) => a.d - b.d).map(x => x.t)) {
    const sid = ext(t.id), due = t.due && typeof t.due === 'object' ? dueFrom(t.due.date) : null;
    /** @type {Record<string, any>} */
    const fields = {
      title: text(t.content, 500).replace(/\s+/g, ' '), description: text(t.description, 16000) || null,
      projectId: projectIds.get(ext(t.project_id)), sectionId: sectionIds.get(ext(t.section_id)) ?? null,
      parentId: parentOf(t) ? taskIds.get(parentOf(t)) : null, order: order.get(sid) ?? 1,
      priority: Math.min(4, Math.max(1, 5 - (Number(t.priority) || 1))),
      labels: [...new Set((Array.isArray(t.labels) ? t.labels : []).map(labelFor).filter(Boolean))].slice(0, 20),
      due: null, deadline: t.deadline && real(String(t.deadline.date)) ? String(t.deadline.date) : null,
      collapsed: !!t.is_collapsed,
    };
    if (due) {
      fields.due = due;
      if (t.due.is_recurring) {
        recurring++;
        const words = text(t.due.string, 200), hit = words ? findRecur(words, { today }) : null;
        if (hit && hit.index === 0 && hit.end >= words.length) {
          fields.due = { ...due, ...(!due.time && hit.recur.time ? { time: hit.recur.time } : {}), rrule: hit.recur.rrule.slice(0, 300), string: words, ...(hit.recur.fromDone ? { fromDone: true } : {}) };
        } else unparsed.push({ title: fields.title, string: words });
      }
    }
    const added = Date.parse(String(t.added_at ?? ''));
    nTasks++;
    put('tasks', sid, { ...fields, done: false, doneAt: null, ...(Number.isFinite(added) ? { createdAt: added } : {}) }, { id: taskIds.get(sid), keep: ['dayOrder', 'done', 'doneAt'] });
  }

  const changed = Object.values(writes).reduce((n, w) => n + w.length, 0);
  return {
    counts: { projects: nProjects, sections: sections.length, labels: nLabels, tasks: nTasks, recurring, filters: filters.length, skipped, changed },
    unparsed, writes,
  };
}
