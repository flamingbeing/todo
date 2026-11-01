// Quick add (#add-sheet), docked above the keyboard: the task's name, where words that set something are marked as
// they are typed ("tomorrow 4 pm", "p1", "#Work", "@errand", "every monday": parse.js) on a peach ground drawn by a
// layer behind the field, the description, chips for the date, priority and labels (each with an x to clear it), the
// project at the foot and a round send button. A chip set by hand wins over the words; clearing a chip the words set
// leaves the words as plain text. Typing #, /, @ or % suggests the names known. It starts with what the page shown
// suggests and stays open after each add, cleared, for the next task; an unsent name is kept as a draft. Pasting two or
// more lines offers to add one task per line.
import { APP } from '../config.js';
import { icon, draftSlot, confirmModal, plural } from '@core/ui';
import { ICONS } from '../icons.js';
import { INBOX, REFUSED } from '../items.js';
import { placeText } from '../tasks.js';
import { dueLine, dayKey } from '../dates.js';
import { colorHex } from '../colors.js';
import { byOrder } from '../order.js';
import { parse, shiftRanges } from '../parse.js';
import { dateLibs } from '../recur.js';
import { openMenu } from '../ui/menu.js';
import { el, pickPlace } from './pick.js';
import { pickDate } from './scheduler.js';
import { pickLabels, onIds } from './labels.js';

/** @typedef {import('./views.js').Ctx} Ctx */
/** @typedef {import('./views.js').AddContext} AddContext */
/** @typedef {import('../dates.js').Due} Due */
/** @typedef {import('../parse.js').Parsed} Parsed */

const PRIORITY_COLOR = ['', 'var(--td-p1)', 'var(--td-p2)', 'var(--td-p3)', 'var(--td-text-2)'];
const d = () => /** @type {HTMLDialogElement} */ (document.getElementById('add-sheet'));
/** @type {Awaited<ReturnType<typeof dateLibs>> | null} */
let libs = null;

/** @param {string} cls @param {string} label */
const button = (cls, label) => {
  const b = /** @type {HTMLButtonElement} */ (el('button', cls));
  b.type = 'button';
  b.setAttribute('aria-label', label);
  return b;
};

/** @type {(() => void) | null} */
let closeLast = null;

/**
 * @param {Ctx} ctx @param {AddContext} start @param {{ handTo: (f: HTMLElement) => void } | null} [hold] the keyboard
 *   held by the tap that opened it (a phone shows it only for a focus made in the tap)
 */
export function openQuickAdd(ctx, start, hold = null) {
  closeLast?.();
  const sheet = d(), body = /** @type {HTMLElement} */ (sheet.querySelector('[data-fill]'));
  const settings = ctx.app.settings;
  const smart = () => { try { return settings.get('smartDates') !== false; } catch { return true; } };
  /** what the person set by hand (a chip or the foot): it wins over the words */
  const manual = /** @type {{ due?: Due | null, priority?: number, labels?: string[], place?: { projectId: string, sectionId: string | null } }} */ ({});
  /** where the page shown says a task goes, and its date */
  const base = { projectId: start.projectId ?? INBOX, sectionId: start.sectionId ?? null, parentId: start.parentId ?? null, due: start.due ?? null, order: typeof start.order === 'number' ? start.order : undefined };
  /** cleared ranges of the name: the words stay text */
  let ignore = /** @type {{ start: number, end: number }[]} */ ([]);
  let was = '';
  /** @type {Parsed} */
  let parsed = parse('', {});

  const form = /** @type {HTMLFormElement} */ (el('form', 'td-add'));
  const field = el('div', 'td-qa-field');
  const mirror = el('div', 'td-qa-mirror');
  mirror.setAttribute('aria-hidden', 'true');
  const title = Object.assign(document.createElement('textarea'), { className: 'td-add-title', placeholder: 'Task name', maxLength: 500,
    rows: 1, autocomplete: 'off', enterKeyHint: 'send', spellcheck: true });
  title.setAttribute('aria-label', 'Task name');
  field.append(mirror, title);
  const desc = Object.assign(document.createElement('textarea'), { className: 'td-add-desc', placeholder: 'Description', rows: 1, maxLength: 16000 });
  desc.setAttribute('aria-label', 'Description');
  const grow = (/** @type {HTMLTextAreaElement} */ t) => { t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; };
  desc.addEventListener('input', () => { grow(desc); keep(); });

  // the draft: the unsent name and description
  const draft = draftSlot(APP.name, 'quick-add', { move: true });
  const kept = /** @type {{ name?: string, desc?: string, ignore?: { start: number, end: number }[] } | null} */ (draft.initial);
  // the cleared words go with it, so they stay text when the draft comes back
  const keep = () => { try { if (title.value || desc.value) draft.save({ name: title.value, desc: desc.value, ignore }); else draft.clear(); } catch { /* storage blocked */ } };

  // the words: parse, mark, chips
  const context = () => {
    const data = ctx.data();
    return { projects: data.projects.filter(p => p.id !== INBOX), sections: data.sections, labels: data.labels.map(l => l.name), projectId: base.projectId,
      now: new Date(), smartDates: smart(), ignore, chrono: libs?.chrono ?? null, RRule: libs?.RRule ?? null };
  };
  const reparse = () => {
    ignore = shiftRanges(was, title.value, ignore);
    was = title.value;
    parsed = parse(title.value, context());
    // the layer behind: the same text, the words found on peach
    const text = title.value, parts = [];
    let i = 0;
    for (const t of parsed.tokens) {
      if (t.start > i) parts.push(document.createTextNode(text.slice(i, t.start)));
      const m = el('mark', 'td-hl', text.slice(t.start, t.end));
      m.dataset.kind = t.kind;
      parts.push(m);
      i = t.end;
    }
    parts.push(document.createTextNode(`${text.slice(i)}​`));
    mirror.replaceChildren(...parts);
    grow(title);
    drawChips(); drawPlace(); ready(); suggest(); keep();
  };

  /** what the task gets: the hand-set values, else the words, else the page's */
  const value = () => {
    const place = manual.place ?? (parsed.projectId ? { projectId: parsed.projectId, sectionId: parsed.sectionId } : parsed.sectionId ? { projectId: base.projectId, sectionId: parsed.sectionId } : null);
    return {
      projectId: place?.projectId ?? base.projectId, sectionId: place ? place.sectionId : base.sectionId,
      parentId: place && place.projectId !== base.projectId ? null : base.parentId,
      due: manual.due !== undefined ? manual.due : parsed.due ?? (parsed.noDate ? null : base.due),
      priority: manual.priority ?? parsed.priority ?? 4,
      labels: [...new Set([...(manual.labels ?? []), ...parsed.labels])],
    };
  };
  /** the words of a kind leave the marks (they stay text) @param {string[]} kinds */
  const unmark = kinds => { for (const t of parsed.tokens) if (kinds.includes(t.kind)) ignore.push({ start: t.start, end: t.end }); };
  const fromWords = (/** @type {string[]} */ kinds) => parsed.tokens.some(t => kinds.includes(t.kind));

  // the chips: date, priority, labels
  const chips = el('div', 'td-chips');
  /** a chip: the button that opens its picker, and beside it (once set) an x that clears it
   * @param {string} label @returns {{ box: HTMLElement, main: HTMLButtonElement, x: HTMLButtonElement }} */
  const chip = label => {
    const box = el('div', 'td-chip'), main = button('td-chip-main', label), x = button('td-chip-x', `Clear ${label.toLowerCase()}`);
    x.append(icon(ICONS.x));
    box.append(main, x);
    return { box, main, x };
  };
  /** @param {{ box: HTMLElement, x: HTMLButtonElement }} c @param {boolean} set @param {(() => void) | null} clear */
  const setX = (c, set, clear) => {
    c.box.classList.toggle('is-set', set);
    c.x.hidden = !set;
    c.x.onclick = clear && (() => { clear(); reparse(); title.focus(); });
  };
  const dateC = chip('Date'), prioC = chip('Priority'), labelC = chip('Labels');
  const dateChip = dateC.main, prioChip = prioC.main, labelChip = labelC.main;
  const drawChips = () => {
    const v = value(), today = dayKey(), line = v.due ? dueLine(v.due, today) : null;
    dateChip.replaceChildren(icon(ICONS.calendar), el('span', '', line?.text ?? 'Date'));
    if (v.due?.rrule) dateChip.append(icon(ICONS.repeat, { class: 'td-chip-repeat' }));
    dateChip.setAttribute('aria-label', line ? `Date: ${line.text}${v.due?.rrule ? ', repeating' : ''}` : 'Date');
    if (line) dateC.box.dataset.tone = line.tone; else delete dateC.box.dataset.tone;
    setX(dateC, !!line, () => { if (fromWords(['date', 'recur'])) unmark(['date', 'recur']); manual.due = base.due ? null : undefined; });
    const flag = icon(ICONS.flag);
    flag.style.color = PRIORITY_COLOR[v.priority];
    prioChip.replaceChildren(flag, el('span', '', v.priority === 4 ? 'Priority' : `P${v.priority}`));
    prioChip.setAttribute('aria-label', v.priority === 4 ? 'Priority' : `Priority: P${v.priority}`);
    setX(prioC, v.priority !== 4, () => { unmark(['priority']); delete manual.priority; });
    labelChip.replaceChildren(icon(ICONS.tag), el('span', '', v.labels.length ? v.labels.join(', ') : 'Labels'));
    labelChip.setAttribute('aria-label', v.labels.length ? `Labels: ${v.labels.join(', ')}` : 'Labels');
    setX(labelC, v.labels.length > 0, () => { unmark(['label']); delete manual.labels; });
    labelC.box.hidden = !v.labels.length;
  };
  dateChip.addEventListener('click', () => pickDate(value().due, due => {
    unmark(['date', 'recur']); manual.due = due; reparse(); title.focus();
  }, { data: ctx.data(), weekStart: Number(settings.get('weekStart') ?? 1) }));
  prioChip.addEventListener('click', () => openMenu(prioChip, [1, 2, 3, 4].map(p => ({
    label: `Priority ${p}`, icon: ICONS.flag, color: PRIORITY_COLOR[p], checked: value().priority === p,
    run: () => { unmark(['priority']); manual.priority = p; reparse(); title.focus(); } })), { label: 'Priority' }));
  // the labels: the picker (from the chip, or the "…" chip's menu); typed @names count too
  const openLabels = () => {
    const known = ctx.data().labels, ticks = new Map();
    for (const n of value().labels) { const l = known.find(x => x.name.toLowerCase() === n.toLowerCase()); if (l) ticks.set(l.id, 'on'); }
    pickLabels(ctx, ticks, (now, made) => {
      const all = [...ctx.data().labels, ...made];
      unmark(['label']);
      manual.labels = onIds(now).map(id => all.find(l => l.id === id)?.name ?? '').filter(Boolean);
      reparse(); title.focus();
    });
  };
  labelChip.addEventListener('click', openLabels);
  const moreChip = button('td-chip td-chip-more', 'More options');
  moreChip.append(icon(ICONS.ellipsis));
  moreChip.addEventListener('click', () => openMenu(moreChip, [{ label: 'Labels', icon: ICONS.tag, run: openLabels }], { label: 'More options' }));
  chips.append(dateC.box, prioC.box, labelC.box, moreChip);

  // names as they are typed after #, /, @ or %
  const list = el('div', 'td-suggest');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Suggestions');
  list.hidden = true;
  const suggest = () => {
    const before = title.value.slice(0, title.selectionStart ?? title.value.length);
    const m = /(?:^|\s)([#/@%])([^\s#@%/]*)$/.exec(before);
    const data = ctx.data();
    /** @type {{ name: string, icon: import('app-ui/icons/lucide.js').IconNodes, color?: string }[]} */
    let names = [];
    if (m && document.activeElement === title) {
      const word = m[2].toLowerCase();
      const pid = value().projectId;
      const all = m[1] === '#' ? byOrder(data.projects.filter(p => p.id !== INBOX)).map(p => ({ name: p.name, icon: ICONS.hash, color: colorHex(p.color) }))
        : m[1] === '/' ? byOrder(data.sections.filter(s => s.projectId === pid)).map(s => ({ name: s.name, icon: ICONS.listTree }))
          : byOrder(data.labels).map(l => ({ name: l.name, icon: ICONS.tag }));
      names = all.filter(x => x.name.toLowerCase().includes(word) && x.name.toLowerCase() !== word).slice(0, 6);
    }
    list.hidden = !names.length;
    list.replaceChildren(...names.map(n => {
      const b = /** @type {HTMLButtonElement} */ (el('button', 'td-suggest-item'));
      b.type = 'button';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', 'false');
      const i = icon(n.icon);
      if (n.color) i.style.color = n.color;
      b.append(i, el('span', '', n.name));
      // a tap keeps the field's focus (and the keyboard)
      b.addEventListener('pointerdown', e => e.preventDefault());
      b.addEventListener('click', () => {
        const at = title.selectionStart ?? title.value.length, from = at - (m?.[2].length ?? 0);
        const next = `${title.value.slice(0, from)}${n.name} ${title.value.slice(at)}`;
        title.value = next;
        title.setSelectionRange(from + n.name.length + 1, from + n.name.length + 1);
        reparse(); keep(); title.focus();
      });
      return b;
    }));
  };

  // the foot: where it goes, and send
  const foot = el('div', 'td-add-foot');
  const place = button('td-add-place', 'Project');
  const drawPlace = () => {
    const v = value(), data = ctx.data(), p = data.projects.find(x => x.id === v.projectId);
    const i = icon(v.projectId === INBOX ? ICONS.inbox : ICONS.hash);
    if (v.projectId !== INBOX) i.style.color = colorHex(p?.color);
    const words = placeText(/** @type {import('../items.js').Task} */ ({ id: '', title: '-', projectId: v.projectId, sectionId: v.sectionId }), data.projects, data.sections);
    place.replaceChildren(i, el('span', '', words), icon(ICONS.chevronDown, { class: 'td-add-place-more' }));
    place.setAttribute('aria-label', `Project: ${words}`);
  };
  place.addEventListener('click', () => pickPlace(ctx.data(), value(), to => { unmark(['project', 'section']); manual.place = to; reparse(); title.focus(); }));
  const send = /** @type {HTMLButtonElement} */ (el('button', 'td-send'));
  send.type = 'submit';
  send.setAttribute('aria-label', 'Add task');
  send.append(icon(ICONS.arrowUp));
  const ready = () => { send.disabled = !parsed.title; };
  foot.append(place, send);

  // (the FAB dropped between two rows gives the first task that place; the next ones go to the end)
  const atDrop = (/** @type {{ projectId: string, sectionId: string | null, parentId: string | null }} */ v) => {
    const o = base.order;
    base.order = undefined;
    return o !== undefined && v.projectId === base.projectId && v.sectionId === base.sectionId && v.parentId === base.parentId ? o : undefined;
  };
  /** labels made here before the list has them (by name) @type {Map<string, string>} */
  const made = new Map();
  /** adds one task from a name (with its words) and the description @param {Parsed} p @param {ReturnType<typeof value>} v @param {string} about */
  const addOne = async (p, v, about) => {
    // a task keeps its labels' ids: a name not known yet is made a label first
    const ids = [];
    for (const n of v.labels) {
      const known = ctx.data().labels.find(l => l.name.toLowerCase() === n.toLowerCase())?.id ?? made.get(n.toLowerCase());
      if (known) { ids.push(known); continue; }
      const r = await ctx.app.addLabel({ name: n });
      if (!r.refused) { made.set(n.toLowerCase(), r.id); ids.push(r.id); }
    }
    return ctx.app.addTask({ title: p.title, description: about || undefined, projectId: v.projectId, sectionId: v.sectionId, parentId: v.parentId,
      priority: v.priority, labels: ids.length ? [...new Set(ids)] : undefined, due: v.due ?? undefined, order: atDrop(v) });
  };
  const clearAll = () => {
    title.value = ''; desc.value = ''; desc.style.height = ''; ignore = []; was = '';
    for (const k of /** @type {const} */ (['due', 'priority', 'labels'])) delete manual[k];
    try { draft.clear(); } catch { /* storage blocked */ }
    reparse();
  };
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (title.value !== was) reparse();   // set without an input event (an autofill, a script)
    if (!parsed.title) return;
    const p = parsed, v = value(), about = desc.value.trim();
    clearAll();
    title.focus();
    const refused = await addOne(p, v, about);
    if (refused) ctx.toast(refused === 'A task needs a title' ? refused : REFUSED);
  });
  title.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); form.requestSubmit(); return; }
    // a backspace right after marked words takes the mark off first, then the letters
    if (e.key === 'Backspace' && title.selectionStart === title.selectionEnd) {
      const at = title.selectionStart ?? 0, t = parsed.tokens.find(x => x.end === at);
      if (t) { e.preventDefault(); ignore.push({ start: t.start, end: t.end }); reparse(); }
    }
  });
  desc.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
  title.addEventListener('input', () => { reparse(); keep(); });
  title.addEventListener('keyup', e => { if (e.key.startsWith('Arrow')) suggest(); });
  title.addEventListener('click', suggest);
  title.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== title) list.hidden = true; }, 0));
  title.addEventListener('scroll', () => { mirror.scrollTop = title.scrollTop; });

  // several lines pasted: one task each, once asked
  title.addEventListener('paste', async e => {
    const text = e.clipboardData?.getData('text/plain') ?? '';
    const lines = text.split(/\r?\n/).map(l => l.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ x]\])\s+/, '').trim()).filter(Boolean);
    if (lines.length < 2) {
      if (/\n/.test(text)) { e.preventDefault(); document.execCommand('insertText', false, text.replace(/\s*\r?\n\s*/g, ' ')); }
      return;
    }
    e.preventDefault();
    if (!await confirmModal(`Add ${plural(lines.length, 'task')}?`, { title: 'Add tasks', yes: `Add ${lines.length}` })) {
      document.execCommand('insertText', false, lines.join(' '));
      return;
    }
    const v0 = value();
    let refused = '';
    for (const line of lines) {
      const p = parse(line, { ...context(), ignore: [] });
      if (!p.title) continue;
      const v = { ...v0, ...(p.projectId ? { projectId: p.projectId, sectionId: p.sectionId, parentId: null } : {}),
        ...(p.due ? { due: p.due } : p.noDate ? { due: null } : {}), ...(p.priority ? { priority: p.priority } : {}),
        labels: [...new Set([...v0.labels, ...p.labels])] };
      refused ||= await addOne(p, v, '');
    }
    if (refused) ctx.toast(REFUSED); else ctx.toast(`${plural(lines.length, 'task')} added`);
    title.focus();
  });

  form.append(field, desc, list, chips, foot);
  body.replaceChildren(form);
  if (kept && (kept.name || kept.desc)) {
    title.value = kept.name ?? ''; desc.value = kept.desc ?? '';
    ignore = Array.isArray(kept.ignore) ? kept.ignore.filter(r => Number.isInteger(r?.start) && Number.isInteger(r?.end)) : [];
    was = title.value;
  }
  reparse();
  if (desc.value) grow(desc);
  if (!sheet.open) sheet.showModal();
  if (hold) hold.handTo(title); else title.focus();
  title.setSelectionRange(title.value.length, title.value.length);
  const onClose = () => { list.hidden = true; try { draft.stop(); } catch { /* storage blocked */ } };
  sheet.addEventListener('close', onClose, { once: true });
  closeLast = () => { sheet.removeEventListener('close', onClose); try { draft.stop(); } catch { /* as above */ } };
  // the date libraries: the words they read are marked once they are here
  if (!libs) void dateLibs().then(l => { libs = l; if (sheet.open && body.contains(form)) reparse(); }).catch(() => {});
}
