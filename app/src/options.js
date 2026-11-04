// The options this app allows (@core/settings): a name here is the only way a value reaches the device or the account.
// New options are off. A new app replaces these with its own.
import { cleanTabs } from '@core/ui';

export const SETTINGS_COLL = 'settings';
export const SWIPES = ['complete', 'schedule', 'delete', 'select', 'none'];
/** the leads (minutes before) an automatic reminder can take: reminders.js LEADS (kept here so startup need not load it) */
export const LEAD_MINUTES = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];
/** the app icons (app/public/icons/variants/<id>.svg|png; 'default' is icons/icon.svg) */
export const APP_ICONS = ['default', 'night', 'paper', 'mint'];
/** the rows of Browse's top card that Settings > Navigation menu can hide */
export const BROWSE_ROWS = ['inbox', 'today', 'upcoming', 'search', 'filters', 'reporting', 'templates'];
/** Browse's top card in order: a tab only while it is off the bar, minus the hidden ones; Templates for writers; Completed last
 * @param {(id: string) => boolean} onBar @param {unknown} hidden @param {boolean} canWrite */
export const browseRows = (onBar, hidden, canWrite) => [...BROWSE_ROWS.filter(id => !(Array.isArray(hidden) && hidden.includes(id))
  && !(['inbox', 'today', 'upcoming', 'search'].includes(id) && onBar(id)) && (id !== 'templates' || canWrite)), 'completed'];
/** @param {unknown} v @returns {number[]} weekdays 0-6, each once, in order */
const cleanDays = v => (Array.isArray(v) ? [...new Set(v.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : []);
/** @param {readonly unknown[]} ok @param {unknown} d */
const oneOf = (ok, d) => ({ scope: /** @type {const} */ ('device'), default: d, clean: (/** @type {unknown} */ v) => (ok.includes(v) ? v : d) });

/** @param {number} max */
const goal = max => ({ scope: /** @type {const} */ ('device'), default: 0, clean: (/** @type {unknown} */ v) => Math.min(max, Math.max(0, Math.round(Number(v)) || 0)) });

/** the tabs Home can be */
export const HOMES = ['inbox', 'today', 'upcoming', 'browse'];

/** @type {Record<string, import('app-ui/settings/types').OptionSpec>} */
export const OPTIONS = {
  // this device only: a phone and a computer can differ
  bigRows: { scope: 'device', default: false },
  // this device only too (was the account's before; the rules still accept the old value on a saved doc)
  showCounts: { scope: 'device', default: false },
  // the tab bar's order and the tabs off it (this device; Settings, Tab bar)
  tabs: { scope: 'device', default: { order: [], hidden: [] }, clean: cleanTabs },
  // quick add and the scheduler read dates, times and repeats in the words typed (this device)
  smartDates: { scope: 'device', default: true },
  // quick add: a new task goes to the top of its list instead of the end (this device)
  addToTop: { scope: 'device', default: false },
  // quick add: Priority, Reminders and Labels keep their chip in the row next to "+" before it is set (this device; off,
  // the row is "+", the project, Date), Deadline and Duration are rows of the "+" menu (on)
  qaPriority: { scope: 'device', default: false },
  qaReminders: { scope: 'device', default: false },
  qaLabels: { scope: 'device', default: false },
  qaDeadline: { scope: 'device', default: true },
  qaDuration: { scope: 'device', default: true },
  // what a row does when swiped right or left (this device): 'complete', 'schedule', 'delete', 'select' or 'none'
  swipeRight: { scope: 'device', default: 'complete', clean: v => (SWIPES.includes(String(v)) ? v : 'complete') },
  swipeLeft: { scope: 'device', default: 'schedule', clean: v => (SWIPES.includes(String(v)) ? v : 'schedule') },
  // the tab the app opens on and Back returns to (this device)
  home: { scope: 'device', default: 'today', clean: v => (typeof v === 'string' && HOMES.includes(v) ? v : 'today') },
  // the first day of the week in Upcoming's strip and the calendars (this device): 1 Monday, 0 Sunday
  weekStart: { scope: 'device', default: 1, clean: v => (v === 0 ? 0 : 1) },
  // each list's Display choices (this device): a view's id to its grouping, sorting, filter and completed switch
  display: { scope: 'device', default: {}, clean: v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) },
  // the last searches on the Search page (this device), newest first
  recentSearches: { scope: 'device', default: [], clean: v => (Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 10) : []) },
  // the places last opened, newest first, for Search's "Recently visited" (this device): see recent.js
  recentPlaces: { scope: 'device', default: [], clean: v => (Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 6) : []) },
  // notify when a reminder is due (this device)
  reminders: { scope: 'device', default: false },
  dailyGoal: goal(99),
  weeklyGoal: goal(999),
  // Round 3 (all this device, off or as before by default):
  // a repeating task's done sub-tasks open again when it moves to its next date (as before; off: they stay done)
  resetSubs: { scope: 'device', default: true },
  // a short tone when a task is completed (screens/tone.js)
  tone: { scope: 'device', default: false },
  // the day "next week" means in quick add and the Date sheet (1 Monday ... 0 Sunday), and the day "weekend" means (6 or 0)
  nextWeekDay: { scope: 'device', default: 1, clean: v => (Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 6 ? v : 1) },
  weekendDay: oneOf([6, 0], 6),
  // a task given a time with no reminders gets one this many minutes before (-1: off)
  autoReminder: oneOf([-1, ...LEAD_MINUTES], -1),
  // where the + button sits: 'right', 'center' or 'left'
  fabPos: oneOf(['right', 'center', 'left'], 'right'),
  // the app's icon in the tab and on the home screen
  appIcon: oneOf(APP_ICONS, 'default'),
  // the rows of Browse's top card taken out of it (Settings > Navigation menu)
  browseHidden: { scope: 'device', default: [], clean: v => (Array.isArray(v) ? BROWSE_ROWS.filter(id => v.includes(id)) : []) },
  // a small celebration when the daily or weekly goal is reached (screens/party.js)
  goalParty: { scope: 'device', default: false },
  // the weekdays the streak skips (0 Sunday ... 6 Saturday), and a pause that holds it
  daysOff: { scope: 'device', default: [], clean: cleanDays },
  vacation: { scope: 'device', default: false },
  // the wide side bar hidden; its My Projects folded
  sideHidden: { scope: 'device', default: false },
  sideProjectsFolded: { scope: 'device', default: false },
  // add: options
};
