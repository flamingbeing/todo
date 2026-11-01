// The options this app allows (@core/settings): a name here is the only way a value reaches the device or the account.
// New options are off. A new app replaces these with its own.
import { cleanTabs } from '@core/ui';
import { ICONS } from './icons.js';

export const SETTINGS_COLL = 'settings';
const SWIPES = ['complete', 'schedule', 'delete', 'none'];
/** @type {[unknown, string][]} */
const SWIPE_CHOICES = [['complete', 'Complete'], ['schedule', 'Schedule'], ['delete', 'Delete'], ['none', 'None']];

/** @type {Record<string, import('app-ui/settings/types').OptionSpec>} */
export const OPTIONS = {
  // this device only: a phone and a computer can differ
  bigRows: { scope: 'device', default: false },
  // the person's account: every device they sign in on
  showCounts: { scope: 'account', default: false },
  // the tab bar's order and the tabs off it (this device; Settings, Tab bar)
  tabs: { scope: 'device', default: { order: [], hidden: [] }, clean: cleanTabs },
  // quick add and the scheduler read dates, times and repeats in the words typed (this device)
  smartDates: { scope: 'device', default: true },
  // what a row does when swiped right or left (this device): 'complete', 'schedule', 'delete' or 'none'
  swipeRight: { scope: 'device', default: 'complete', clean: v => (SWIPES.includes(String(v)) ? v : 'complete') },
  swipeLeft: { scope: 'device', default: 'schedule', clean: v => (SWIPES.includes(String(v)) ? v : 'schedule') },
  // the first day of the week in Upcoming's strip and the calendars (this device): 1 Monday, 0 Sunday
  weekStart: { scope: 'device', default: 1, clean: v => (v === 0 ? 0 : 1) },
  // each list's Display choices (this device): a view's id to its grouping, sorting, filter and completed switch
  display: { scope: 'device', default: {}, clean: v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) },
  // the last searches on the Search tab (this device), newest first
  recentSearches: { scope: 'device', default: [], clean: v => (Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 10) : []) },
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
  { title: 'General', icon: ICONS.settings, sub: 'Smart dates, swipes and the week', group: 'Tasks', rows: [
    { key: 'smartDates', label: 'Smart date recognition', sub: 'Read dates, times and repeats as you type a task' },
    { key: 'swipeRight', label: 'Swipe right', sub: 'This device', choices: SWIPE_CHOICES },
    { key: 'swipeLeft', label: 'Swipe left', sub: 'This device', choices: SWIPE_CHOICES },
    { key: 'weekStart', label: 'Start of the week', sub: 'This device', choices: /** @type {[unknown, string][]} */ ([[1, 'Monday'], [0, 'Sunday']]) },
  ] },
  { title: 'Tasks', icon: ICONS.listChecks, sub: 'Counts and row size', group: 'Tasks', rows: [
    { key: 'showCounts', label: 'Show task counts in Browse', sub: 'Every device; sign in to change it' },
    { key: 'bigRows', label: 'Larger rows', sub: 'This device' },
  ] },
  { title: 'Features', icon: ICONS.listChecks, sub: 'Switch optional parts on or off', group: 'Advanced', visible: () => FEATURES.length > 0, rows: FEATURES },
];
