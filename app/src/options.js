// The options this app allows (@core/settings): a name here is the only way a value reaches the device or the account.
// New options are off. A new app replaces these with its own.
import { cleanTabs } from '@core/ui';
import { ICONS } from './icons.js';

export const SETTINGS_COLL = 'settings';
const SWIPES = ['complete', 'schedule', 'delete', 'none'];
/** @type {[unknown, string][]} */
const SWIPE_CHOICES = [['complete', 'Complete'], ['schedule', 'Schedule'], ['delete', 'Delete'], ['none', 'None']];

/** @param {number} max */
const goal = max => ({ scope: /** @type {const} */ ('device'), default: 0, clean: (/** @type {unknown} */ v) => Math.min(max, Math.max(0, Math.round(Number(v)) || 0)) });
/** @param {...number} n @returns {[unknown, string][]} */
const goals = (...n) => n.map(x => [x, x ? String(x) : 'No goal']);

/** @type {[unknown, string][]} the tabs Home can be */
const HOMES = [['inbox', 'Inbox'], ['today', 'Today'], ['upcoming', 'Upcoming'], ['browse', 'Browse']];

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
  // what a row does when swiped right or left (this device): 'complete', 'schedule', 'delete' or 'none'
  swipeRight: { scope: 'device', default: 'complete', clean: v => (SWIPES.includes(String(v)) ? v : 'complete') },
  swipeLeft: { scope: 'device', default: 'schedule', clean: v => (SWIPES.includes(String(v)) ? v : 'schedule') },
  // the tab the app opens on and Back returns to (this device)
  home: { scope: 'device', default: 'today', clean: v => (HOMES.some(([id]) => id === v) ? v : 'today') },
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
  // add: options
};

/** The Features page's rows: a recipe adds one switch for its part (an option here that is on until turned off); with none,
 * the page does not show. @type {import('app-ui/ui/settings-screen.js').SettingRow[]} */
const FEATURES = [
  // add: feature rows
];

/** The Settings pages (src/shell.js: @core/ui settingsScreen with its menu): a row is a switch for a yes/no option; icon,
 * sub and group are the page's row in the menu. */
export const SETTING_SECTIONS = [
  { title: 'General', icon: ICONS.settings, group: '', rows: [
    { key: 'home', label: 'Home view', sub: 'Where the app opens and Back returns to; Today if it is off the tab bar', choices: HOMES },
    { key: 'weekStart', label: 'Start the week on', sub: 'This device', choices: /** @type {[unknown, string][]} */ ([[1, 'Monday'], [0, 'Sunday']]) },
    { key: 'swipeRight', label: 'Swipe to right', sub: 'This device', choices: SWIPE_CHOICES },
    { key: 'swipeLeft', label: 'Swipe to left', sub: 'This device', choices: SWIPE_CHOICES },
    { key: 'bigRows', label: 'Larger rows', sub: 'This device' },
  ] },
  { title: 'Navigation menu', icon: ICONS.listChecks, group: 'Personalization', find: 'browse counts', rows: [
    { key: 'showCounts', label: 'Show task counts in Browse', sub: 'This device' },
  ] },
  { title: 'Quick Add', icon: ICONS.plus, group: 'Personalization', find: 'smart date recognition natural language', rows: [
    { key: 'smartDates', label: 'Smart date recognition', sub: 'Read dates, times and repeats as you type a task' },
  ] },
  { title: 'Productivity', icon: ICONS.gauge, group: 'Productivity', find: 'goal daily weekly', rows: [
    { key: 'dailyGoal', label: 'Daily goal', sub: 'Tasks a day. This device', choices: goals(0, 1, 3, 5, 10, 20) },
    { key: 'weeklyGoal', label: 'Weekly goal', sub: 'Tasks a week. This device', choices: goals(0, 10, 20, 30, 50, 100) },
  ] },
  { title: 'Reminders', icon: ICONS.alarmClock, group: 'Productivity', find: 'notify notifications alert', rows: [
    { key: 'reminders', label: 'Notify me', sub: 'Notify when a reminder is due. This device' },
  ] },
  { title: 'Features', icon: ICONS.listChecks, sub: 'Switch optional parts on or off', group: 'More', visible: () => FEATURES.length > 0, rows: FEATURES },
];
