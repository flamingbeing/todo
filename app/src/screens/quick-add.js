// Quick add (#add-sheet), docked above the keyboard: the task's name, where words that set something are marked as
// they are typed ("tomorrow 4 pm", "p1", "#Work", "@errand", "every monday": parse.js) on a peach ground drawn by a
// layer behind the field, the description (always there, under the name), chips for the date, priority, reminders, labels,
// deadline and duration (each with an x to clear it, but the date's: its words are the date), then a hairline and the foot:
// the project picker and a small round send button (faint until the name has text). The date, priority, reminders and
// labels chips are always in the row (each can be hidden in Settings > Quick Add), deadline and duration once set; picking
// a value ticks the haptics. A chip set by hand wins over the words; clearing a chip the words
// set leaves the words as plain text. A day picked in the Date sheet is written into the name as highlighted words
// ("11 Nov", "every workday") when they read back as that same date; editing or deleting the words changes the date.
// The "…" chip's menu stacks upward: Deadline, Priority, Reminders, Labels, Duration, Customize Quick Add. Typing # opens a floating card of
// "My Projects" (Inbox first) above the sheet; the Inbox chip opens the same card; /, @ and % suggest inline. The
// placeholder is a different example each time the sheet opens. It starts with what the page shown
// suggests and stays open after each add, cleared, for the next task (opened for a sub-task, from the task sheet's "Add sub-task", it closes
// after the one add); an unsent name is kept as a draft. Pasting two or
// more lines offers to add one task per line.
import { APP } from '../config.js';
import { icon, draftSlot, confirmModal, plural, haptic, lazyModules } from '@core/ui';
import { ICONS } from '../icons.js';
import { MORE } from '../icons-more.js';
import { INBOX, REFUSED } from '../items.js';
import { placeText } from '../tasks.js';
import { dueLine, deadlineLine, dayKey, minutesText } from '../dates.js';
import { LEADS, cleanReminders, leadShort, dueMs, autoReminders } from '../reminders.js';
import { colorHex } from '../colors.js';
import { byOrder, orderBetween } from '../order.js';
import { projectTree } from '../arrange.js';
import { parse, shiftRanges, dueWords } from '../parse.js';
import { dateLibs } from '../recur.js';
import { openMenu } from '../ui/menu.js';
import { el } from './pick.js';
import { pickDate, DURATIONS, dayOptions } from './scheduler.js';
import { pickLabels, onIds } from './labels.js';
import { openSettingsPage } from '../shell.js';

/** @typedef {import('./views.js').Ctx} Ctx */
/** @typedef {import('./views.js').AddContext} AddContext */
/** @typedef {import('../dates.js').Due} Due */
/** @typedef {import('../parse.js').Parsed} Parsed */

/** a different example in the name's box each time the sheet opens */
const EXAMPLES = ['Water the plants every Sunday', 'Book a haircut Friday 6pm', 'Renew the passport in 3 weeks p2',
  'Plan the team lunch next Wednesday #Work', 'Fix the bike chain tomorrow @errand'];
let lastExample = -1;
const nextExample = () => {
  let i = Math.floor(Math.random() * EXAMPLES.length);
  if (i === lastExample) i = (i + 1) % EXAMPLES.length;
  lastExample = i;
  return EXAMPLES[i];
};
const PRIORITY_COLOR = ['', 'var(--td-p1)', 'var(--td-p2)', 'var(--td-p3)', 'var(--td-text-2)'];
// the opening motion (grows out of the add button) loads on first use, not at startup
const lazy = lazyModules({ morph: () => import('../ui/quick-add-morph.js') });
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
  const manual = /** @type {{ due?: Due | null, priority?: number, labels?: string[], deadline?: string | null, duration?: number | null, reminders?: number[], place?: { projectId: string, sectionId: string | null } }} */ ({});
  /** where the page shown says a task goes, and its date (a group's "+": its priority or label too) */
  const base = { projectId: start.projectId ?? INBOX, sectionId: start.sectionId ?? null, parentId: start.parentId ?? null, due: start.due ?? null, order: typeof start.order === 'number' ? start.order : undefined,
    priority: start.priority, labels: start.labels };
  /** cleared ranges of the name: the words stay text */
  let ignore = /** @type {{ start: number, end: number }[]} */ ([]);
  let was = '';
  /** @type {Parsed} */
  let parsed = parse('', {});

  const form = /** @type {HTMLFormElement} */ (el('form', 'td-add'));
  const field = el('div', 'td-qa-field');
  const mirror = el('div', 'td-qa-mirror');
  mirror.setAttribute('aria-hidden', 'true');
  const title = Object.assign(document.createElement('textarea'), { className: 'td-add-title', placeholder: nextExample(), maxLength: 500,
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
      now: new Date(), smartDates: smart(), ignore, chrono: libs?.chrono ?? null, RRule: libs?.RRule ?? null, ...dayOptions(ctx.app.settings) };
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
      priority: manual.priority ?? parsed.priority ?? base.priority ?? 4,
      labels: [...new Set([...(manual.labels ?? base.labels ?? []), ...parsed.labels])],
      deadline: manual.deadline !== undefined ? manual.deadline : parsed.deadline ?? start.deadline ?? null,
      // minutes: set by hand, else typed ("for 45 min"), else a calendar slot's while the task keeps that slot's time
      duration: manual.duration !== undefined ? manual.duration : parsed.duration ?? (start.duration && (manual.due ?? base.due)?.time ? start.duration : null),
      reminders: manual.reminders ?? /** @type {number[]} */ ([]),
    };
  };
  /** the words of a kind leave the marks (they stay text) @param {string[]} kinds */
  const unmark = kinds => { for (const t of parsed.tokens) if (kinds.includes(t.kind)) ignore.push({ start: t.start, end: t.end }); };
  const fromWords = (/** @type {string[]} */ kinds) => parsed.tokens.some(t => kinds.includes(t.kind));

  // the chips: date, priority, reminders, labels (deadline and duration once set)
  const on = (/** @type {string} */ k) => { try { return settings.get(k) !== false; } catch { return true; } };
  /** a value picked from a chip */
  const tick = () => { try { haptic('tick'); } catch { /* no haptics here */ } };
  const chips = el('div', 'td-chips');
  /** a chip: the button that opens its picker, and beside it (once set) an x that clears it
   * @param {string} label @returns {{ box: HTMLElement, main: HTMLButtonElement, x: HTMLButtonElement }} */
  const chip = label => {
    const box = el('div', 'td-chip'), main = button('td-chip-main', label), x = button('td-chip-x', `Clear ${label.toLowerCase()}`);
    x.append(icon(MORE.x));
    box.append(main, x);
    return { box, main, x };
  };
  /** @param {{ box: HTMLElement, x: HTMLButtonElement }} c @param {boolean} set @param {(() => void) | null} clear */
  const setX = (c, set, clear) => {
    c.box.classList.toggle('is-set', set);
    c.x.hidden = !set || !clear;   // (no clear: the words are the way to change it)
    c.x.onclick = clear && (() => { clear(); reparse(); title.focus(); });
  };
  const dateC = chip('Date'), prioC = chip('Priority'), labelC = chip('Labels'), deadC = chip('Deadline'), durC = chip('Duration'), remC = chip('Reminders');
  const dateChip = dateC.main, prioChip = prioC.main, labelChip = labelC.main;
  const drawChips = () => {
    const v = value(), today = dayKey(), line = v.due ? dueLine(v.due, today) : null;
    dateChip.replaceChildren(icon(ICONS.calendar), el('span', '', line?.text ?? 'Date'));
    if (v.due?.rrule) dateChip.append(icon(ICONS.repeat, { class: 'td-chip-repeat' }));
    dateChip.setAttribute('aria-label', line ? `Date: ${line.text}${v.due?.rrule ? ', repeating' : ''}` : 'Date');
    if (line) dateC.box.dataset.tone = line.tone; else delete dateC.box.dataset.tone;
    // (a date the words give has no x: editing or deleting the words changes it)
    setX(dateC, !!line, fromWords(['date', 'recur']) ? null : () => { manual.due = base.due ? null : undefined; });
    const flag = icon(MORE.flag, { class: `td-flag${v.priority < 4 ? ' is-filled' : ''}` });
    flag.style.color = PRIORITY_COLOR[v.priority];
    prioChip.replaceChildren(flag, el('span', '', v.priority === 4 ? 'Priority' : `P${v.priority}`));
    prioChip.setAttribute('aria-label', v.priority === 4 ? 'Priority' : `Priority: P${v.priority}`);
    prioC.box.hidden = v.priority === 4 && !on('qaPriority');
    prioC.box.dataset.p = String(v.priority);
    setX(prioC, v.priority !== 4, () => { unmark(['priority']); delete manual.priority; base.priority = undefined; });
    labelChip.replaceChildren(icon(ICONS.tag), el('span', '', v.labels.length ? v.labels.join(', ') : 'Labels'));
    labelChip.setAttribute('aria-label', v.labels.length ? `Labels: ${v.labels.join(', ')}` : 'Labels');
    setX(labelC, v.labels.length > 0, () => { unmark(['label']); delete manual.labels; base.labels = undefined; });
    labelC.box.hidden = !v.labels.length && !on('qaLabels');
    const dl = deadlineLine(v.deadline, today);
    deadC.main.replaceChildren(icon(ICONS.target), el('span', '', dl?.text ?? 'Deadline'));
    deadC.main.setAttribute('aria-label', dl ? `Deadline: ${dl.text}` : 'Deadline');
    setX(deadC, !!dl, () => { unmark(['deadline']); manual.deadline = null; });
    deadC.box.hidden = !dl;
    if (dl) deadC.box.dataset.tone = dl.tone; else delete deadC.box.dataset.tone;
    const mins = v.duration ? minutesText(v.duration) : '';
    durC.main.replaceChildren(icon(MORE.hourglass), el('span', '', mins || 'Duration'));
    durC.main.setAttribute('aria-label', mins ? `Duration: ${mins}` : 'Duration');
    setX(durC, !!mins, () => { unmark(['duration']); manual.duration = null; });
    durC.box.hidden = !mins;
    const rem = v.reminders;
    remC.main.replaceChildren(icon(MORE.alarmClock), el('span', '', rem.length ? String(rem.length) : 'Reminders'));
    remC.main.setAttribute('aria-label', rem.length ? `Reminders: ${rem.map(leadShort).join(', ')}` : 'Reminders');
    setX(remC, rem.length > 0, () => { delete manual.reminders; });
    remC.box.hidden = !rem.length && !on('qaReminders');
  };
  // reminders: tick the leads wanted (before the due time; a date with no time counts as 09:00), once there is a date
  const openReminders = (/** @type {HTMLElement} */ at) => {
    const v = value();
    if (dueMs({ due: v.due }) === null) { ctx.toast('Set a date first'); return; }
    const has = cleanReminders(v.reminders);
    openMenu(at, LEADS.map(([lead, label]) => ({ label, icon: MORE.bell, checked: has.includes(lead),
      run: () => { manual.reminders = cleanReminders(has.includes(lead) ? has.filter(x => x !== lead) : [...has, lead]); tick(); reparse(); title.focus(); } })),
    { label: 'Reminders', title: 'Reminders', pop: true });
  };
  remC.main.addEventListener('click', () => openReminders(remC.main));
  /** @param {number | null} n */
  const setDuration = n => { unmark(['duration']); manual.duration = n; tick(); reparse(); title.focus(); };
  const openDuration = (/** @type {HTMLElement} */ at) => openMenu(at, [null, ...DURATIONS].map(n => ({ label: n ? minutesText(n) : 'None', icon: MORE.hourglass,
    checked: (value().duration ?? null) === n, run: () => setDuration(n) })), { label: 'Duration', ...(at === moreChip ? { pop: true } : {}) });
  durC.main.addEventListener('click', () => openDuration(durC.main));
  /** @param {string | null | undefined} date */
  const deadlineOf = date => (date ? { date } : null);
  const openDeadline = () => pickDate(deadlineOf(value().deadline), d => {
    unmark(['deadline']); manual.deadline = d?.date ?? null; tick(); reparse(); title.focus();
  }, { data: ctx.data(), ...dayOptions(settings), dateOnly: true });
  deadC.main.addEventListener('click', openDeadline);
  /** a picked date (null: none) goes into the name as words that read back as it; else the chip alone holds it @param {Due | null} due */
  const writeDate = async due => {
    if (!libs) { try { libs = await dateLibs(); } catch { /* the words are not read without them */ } }
    const old = title.value, own = parsed.tokens.filter(t => t.kind === 'date' || t.kind === 'recur');
    const words = due ? dueWords(due, context()) : null;
    if (due && !words) { unmark(['date', 'recur']); manual.due = due; return; }
    // the old date's words go, the new ones take the first one's place (else the front: "11 Nov call mum")
    let next = old, at = 0;
    for (const t of [...own].reverse()) { next = next.slice(0, t.start) + next.slice(t.end); at = t.start; }
    if (!own.length) at = 0;
    else next = next.replace(/\s{2,}/g, ' ');
    if (words) next = `${next.slice(0, at)}${words}${next.slice(at) ? ' ' : ''}${next.slice(at).replace(/^\s+/, '')}`;
    next = next.replace(/^\s+/, '');
    title.value = next;
    delete manual.due;
    reparse();
    // (an old "tomorrow" that was cleared stays text; a clash with other words leaves the chip to hold the date)
    const got = parsed.due;
    const same = due ? !!got && got.date === due.date && (got.time ?? '') === (due.time ?? '') && (got.rrule ?? '') === (due.rrule ?? '') : !parsed.due;
    if (!same) { title.value = old; reparse(); unmark(['date', 'recur']); manual.due = due; return; }
    if (!due && base.due) manual.due = null;
    const end = title.value.length;
    title.setSelectionRange(end, end);
  };
  dateChip.addEventListener('click', () => pickDate(value().due, async (due, duration) => {
    await writeDate(due);
    tick();
    if (duration !== undefined && duration !== value().duration) { unmark(['duration']); manual.duration = duration; }
    reparse(); title.focus();
  }, { data: ctx.data(), ...dayOptions(settings), duration: value().duration, durationRow: false }));
  const openPriority = (/** @type {HTMLElement} */ at) => openMenu(at, [1, 2, 3, 4].map(p => ({
    label: `Priority ${p}`, icon: MORE.flag, color: PRIORITY_COLOR[p], checked: value().priority === p,
    run: () => { unmark(['priority']); manual.priority = p; tick(); reparse(); title.focus(); } })), { label: 'Priority', ...(at === moreChip ? { pop: true } : {}) });
  prioChip.addEventListener('click', () => openPriority(prioChip));
  // the labels: the picker (from the chip, or the "…" chip's menu); typed @names count too
  const openLabels = () => {
    const known = ctx.data().labels, ticks = new Map();
    for (const n of value().labels) { const l = known.find(x => x.name.toLowerCase() === n.toLowerCase()); if (l) ticks.set(l.id, 'on'); }
    pickLabels(ctx, ticks, (now, made) => {
      const all = [...ctx.data().labels, ...made];
      unmark(['label']);
      manual.labels = onIds(now).map(id => all.find(l => l.id === id)?.name ?? '').filter(Boolean);
      tick(); reparse(); title.focus();
    });
  };
  labelChip.addEventListener('click', openLabels);
  const moreChip = button('td-chip td-chip-more', 'More options');
  moreChip.append(icon(MORE.ellipsis));
  // (the description is always under the name; the menu stacks upward, the icon left of each label, no ticks; the last
  // row closes quick add, its draft kept, and opens Settings > Quick Add)
  moreChip.addEventListener('click', () => openMenu(moreChip, [
    ...(on('qaDeadline') ? [{ label: 'Deadline', icon: ICONS.target, run: openDeadline }] : []),
    ...(on('qaPriority') ? [{ label: 'Priority', icon: MORE.flag, run: () => openPriority(moreChip) }] : []),
    ...(on('qaReminders') ? [{ label: 'Reminders', icon: MORE.alarmClock, run: () => openReminders(moreChip) }] : []),
    ...(on('qaLabels') ? [{ label: 'Labels', icon: ICONS.tag, run: openLabels }] : []),
    ...(on('qaDuration') ? [{ label: 'Duration', icon: MORE.hourglass, run: () => openDuration(moreChip) }] : []),
    { label: 'Customize Quick Add', icon: MORE.slidersHorizontal, run: () => { if (sheet.open) sheet.close(); void openSettingsPage('Quick Add'); } }],
  { label: 'More options', pop: true }));

  // names as they are typed after #, /, @ or %: # opens a floating "My Projects" card above the sheet (Inbox first, a short
  // list that scrolls, the sheet stays put); /, @ and % list inline
  const list = el('div', 'td-suggest');
  const items = el('div', 'td-suggest-items');
  items.setAttribute('role', 'listbox');
  items.setAttribute('aria-label', 'Suggestions');
  const head = el('div', 'td-suggest-head', 'My Projects');
  list.append(head, items);
  list.hidden = true;
  /** the card sits above the sheet, at its left edge (it is fixed, so the sheet's height does not move) */
  const placeCard = () => {
    const r = d().getBoundingClientRect();
    list.style.left = `${r.left + 8}px`; list.style.width = `${Math.min(r.width - 16, 320)}px`;
    list.style.bottom = `${innerHeight - r.top + 8}px`;
  };
  const suggest = () => {
    const before = title.value.slice(0, title.selectionStart ?? title.value.length);
    const m = /(?:^|\s)([#/@%])([^\s#@%/]*)$/.exec(before);
    const data = ctx.data();
    /** @type {{ name: string, icon: import('app-ui/icons/lucide.js').IconNodes, color?: string, inbox?: boolean }[]} */
    let names = [];
    if (m && document.activeElement === title) {
      const word = m[2].toLowerCase();
      const pid = value().projectId;
      const all = m[1] === '#' ? [{ name: 'Inbox', icon: ICONS.inbox, inbox: true }, ...byOrder(data.projects.filter(p => p.id !== INBOX)).map(p => ({ name: p.name, icon: ICONS.hash, color: colorHex(p.color) }))]
        : m[1] === '/' ? byOrder(data.sections.filter(s => s.projectId === pid)).map(s => ({ name: s.name, icon: ICONS.listTree }))
          : byOrder(data.labels).map(l => ({ name: l.name, icon: ICONS.tag }));
      names = all.filter(x => x.name.toLowerCase().includes(word) && x.name.toLowerCase() !== word);
      if (m[1] !== '#') names = names.slice(0, 6);
    }
    const card = !!m && m[1] === '#';
    list.hidden = !names.length;
    list.classList.toggle('is-card', card);
    head.hidden = !card;
    items.setAttribute('aria-label', card ? 'My Projects' : 'Suggestions');
    if (card && names.length) placeCard();
    items.replaceChildren(...names.map(n => {
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
        if (n.inbox) {
          // Inbox is no word of the name: the typed "#" goes and the task is set to the Inbox
          const cut = Math.max(0, from - 1);
          title.value = `${title.value.slice(0, cut)}${title.value.slice(at).replace(/^\s+/, '')}`;
          title.setSelectionRange(cut, cut);
          unmark(['project', 'section']); manual.place = { projectId: INBOX, sectionId: null };
          reparse(); keep(); title.focus();
          return;
        }
        const next = `${title.value.slice(0, from)}${n.name} ${title.value.slice(at)}`;
        title.value = next;
        title.setSelectionRange(from + n.name.length + 1, from + n.name.length + 1);
        delete manual.place;
        reparse(); keep(); title.focus();
      });
      return b;
    }));
  };

  // the foot: where it goes, and send
  const place = button('td-add-place', 'Project');
  const drawPlace = () => {
    const v = value(), data = ctx.data(), p = data.projects.find(x => x.id === v.projectId);
    const i = icon(v.projectId === INBOX ? ICONS.inbox : ICONS.hash);
    if (v.projectId !== INBOX) i.style.color = colorHex(p?.color);
    const words = placeText(/** @type {import('../items.js').Task} */ ({ id: '', title: '-', projectId: v.projectId, sectionId: v.sectionId }), data.projects, data.sections);
    place.replaceChildren(i, el('span', '', words), icon(ICONS.chevronDown, { class: 'td-add-place-more' }));
    place.setAttribute('aria-label', `Project: ${words}`);
  };
  place.addEventListener('click', () => {
    // "My Projects": a card above the chip (Inbox, then each project; the sections are picked with "/")
    const data = ctx.data(), now = value();
    const set = (/** @type {{ projectId: string, sectionId: string | null }} */ to) => { unmark(['project', 'section']); manual.place = to; tick(); reparse(); title.focus(); };
    openMenu(place, [{ label: 'Inbox', icon: ICONS.inbox, checked: now.projectId === INBOX, run: () => set({ projectId: INBOX, sectionId: null }) },
      ...projectTree(data.projects.map(x => ({ ...x, collapsed: false }))).map(({ project: p }) => ({ label: p.name, icon: ICONS.hash, color: colorHex(p.color),
        checked: now.projectId === p.id, run: () => set({ projectId: p.id, sectionId: null }) }))], { label: 'My Projects', title: 'My Projects', pop: true });
  });
  const send = /** @type {HTMLButtonElement} */ (el('button', 'td-send'));
  send.type = 'submit';
  send.setAttribute('aria-label', 'Add task');
  send.append(icon(MORE.arrowUp));
  const ready = () => { send.disabled = !parsed.title; };   // (faint while the name is empty, see .td-send)
  chips.append(dateC.box, prioC.box, remC.box, labelC.box, deadC.box, durC.box, moreChip);
  const foot = el('div', 'td-add-foot');
  foot.append(place, send);

  // (the FAB dropped between two rows gives the first task that place; the next ones go to the end)
  const atDrop = (/** @type {{ projectId: string, sectionId: string | null, parentId: string | null }} */ v) => {
    const o = base.order;
    base.order = undefined;
    return o !== undefined && v.projectId === base.projectId && v.sectionId === base.sectionId && v.parentId === base.parentId ? o : undefined;
  };
  /** the order before the first task in a task's list (the top) @param {{ projectId: string, sectionId: string | null, parentId: string | null }} v */
  const topOf = v => {
    const mine = byOrder(ctx.data().tasks.filter(t => (t.projectId || INBOX) === v.projectId && (t.sectionId || null) === (v.sectionId || null) && (t.parentId || null) === (v.parentId || null)));
    return orderBetween(null, typeof mine[0]?.order === 'number' ? mine[0].order : null);
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
      priority: v.priority, labels: ids.length ? [...new Set(ids)] : undefined, due: v.due ?? undefined, deadline: v.deadline ?? undefined, order: atDrop(v) ?? (settings.get('addToTop') ? topOf(v) : undefined),
      duration: v.duration ?? undefined, reminders: (r => (r.length && v.due ? r : undefined))(autoReminders(v.due, v.reminders, settings.get('autoReminder'))) });
  };
  const clearAll = () => {
    title.value = ''; desc.value = ''; desc.style.height = ''; ignore = []; was = '';
    for (const k of /** @type {const} */ (['due', 'priority', 'labels', 'deadline', 'duration', 'reminders'])) delete manual[k];
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
    else if (start.parentId && sheet.open) sheet.close();   // (a sub-task: one add, back to the task sheet behind)
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
        ...(p.due ? { due: p.due } : p.noDate ? { due: null } : {}), ...(p.priority ? { priority: p.priority } : {}), ...(p.deadline ? { deadline: p.deadline } : {}),
        labels: [...new Set([...v0.labels, ...p.labels])] };
      refused ||= await addOne(p, v, '');
    }
    if (refused) ctx.toast(REFUSED); else ctx.toast(`${plural(lines.length, 'task')} added`);
    title.focus();
  });

  form.append(el('div', 'td-grab'), field, desc, list, chips, foot);
  body.replaceChildren(form);
  if (kept && (kept.name || kept.desc)) {
    title.value = kept.name ?? ''; desc.value = kept.desc ?? '';
    ignore = Array.isArray(kept.ignore) ? kept.ignore.filter(r => Number.isInteger(r?.start) && Number.isInteger(r?.end)) : [];
    was = title.value;
  }
  reparse();
  if (desc.value) grow(desc);
  if (!sheet.open) { lazy.loaded('morph')?.aim(sheet); sheet.showModal(); void lazy.need('morph').catch(() => {}); }
  if (hold) hold.handTo(title); else title.focus();
  title.setSelectionRange(title.value.length, title.value.length);
  const onClose = () => { list.hidden = true; try { draft.stop(); } catch { /* storage blocked */ } };
  sheet.addEventListener('close', onClose, { once: true });
  closeLast = () => { sheet.removeEventListener('close', onClose); try { draft.stop(); } catch { /* as above */ } };
  // the date libraries: the words they read are marked once they are here
  if (!libs) void dateLibs().then(l => { libs = l; if (sheet.open && body.contains(form)) reparse(); }).catch(() => {});
}
