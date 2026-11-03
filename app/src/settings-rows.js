// The Settings pages' rows (screens/settings.js builds the screen with them, the first time Settings opens): a row is a switch
// for a yes/no option, a picker for one with choices; icon, sub and group are the page's row in the menu. The options
// themselves are in options.js (every one here is this device's).
import { ICONS } from './icons.js';
import { MORE } from './icons-more.js';
import { HOMES, LEAD_MINUTES } from './options.js';

/** @typedef {[unknown, string][]} Choices */
const SWIPE_CHOICES = /** @type {Choices} */ ([['complete', 'Complete'], ['schedule', 'Schedule'], ['delete', 'Delete'], ['select', 'Select'], ['none', 'None']]);
const WORDS = /** @type {Record<string, string>} */ ({ inbox: 'Inbox', today: 'Today', upcoming: 'Upcoming', browse: 'Browse' });
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** @param {...number} n @returns {Choices} */
const goals = (...n) => n.map(x => [x, x ? `${x} task${x === 1 ? '' : 's'}` : 'No goal']);
/** "At time of task", "5 minutes before" ... (reminders.js leadText's words, kept here to spare loading it) @param {number} n */
const lead = n => (n <= 0 ? 'At time of task' : n % 10080 === 0 ? plural(n / 10080, 'week') : n % 1440 === 0 ? plural(n / 1440, 'day')
  : n % 60 === 0 ? plural(n / 60, 'hour') : plural(n, 'minute'));
/** @param {number} n @param {string} w */
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'} before`;
/** the Features page's rows: a recipe adds one switch for its part (an option that is on until turned off); with none, the
 * page does not show @type {import('app-ui/ui/settings-screen.js').SettingRow[]} */
const FEATURES = [
  // add: feature rows
];

/** @type {import('app-ui/ui/settings-screen.js').SettingSection[]} */
export const SETTING_SECTIONS = [
  { title: 'General', icon: MORE.settings, group: '', find: 'swipe week weekend next sound tone sub-tasks', rows: [
    { key: 'home', label: 'Home view', sub: 'Where the app opens and Back returns to', choices: HOMES.map(id => [id, WORDS[id]]) },
    { key: 'smartDates', label: 'Smart date recognition', sub: 'Read dates, times and repeats as you type a task' },
    { key: 'resetSubs', label: 'Reset sub-tasks', sub: 'Open done sub-tasks again when a repeating task moves on',
      more: 'On: when a repeating task is completed and moves to its next date, its done sub-tasks open again for the next time. Off: they stay done.' },
    { heading: 'Sound' },
    { key: 'tone', label: 'Task complete tone' },
    { heading: 'Date & time' },
    { key: 'weekStart', label: 'Start the week on', choices: /** @type {Choices} */ ([[1, 'Monday'], [0, 'Sunday']]) },
    { key: 'nextWeekDay', label: 'Interpret "Next week" as', choices: [1, 2, 3, 4, 5, 6, 0].map(d => [d, WEEKDAYS[d]]) },
    { key: 'weekendDay', label: 'Interpret "Weekend" as', choices: /** @type {Choices} */ ([[6, 'Saturday'], [0, 'Sunday']]) },
    { heading: 'Swipe actions' },
    { key: 'swipeRight', label: 'Swipe to right', choices: SWIPE_CHOICES },
    { key: 'swipeLeft', label: 'Swipe to left', choices: SWIPE_CHOICES },
    { heading: 'Advanced' },
    { key: 'bigRows', label: 'Larger rows' },
  ] },
  { title: 'Navigation menu', icon: ICONS.menu, group: 'Personalization', find: 'browse counts menu items hide', rows: [
    { key: 'showCounts', label: 'Show task count', sub: 'Visible in Browse' },
    { heading: 'Menu items' },
  ] },
  { title: 'Quick Add', icon: MORE.circlePlus, group: 'Personalization', find: 'add top bottom actions', rows: [
    { key: 'addToTop', label: 'Add new tasks to the top', sub: 'Instead of the end of the list' },
    { heading: 'Quick Add actions' },
    { key: 'qaPriority', label: 'Priority', sub: 'Always show next to +' },
    { key: 'qaReminders', label: 'Reminders', sub: 'Always show next to +' },
    { key: 'qaLabels', label: 'Labels', sub: 'Always show next to +' },
    { key: 'qaDeadline', label: 'Deadline', sub: 'In the + menu' },
    { key: 'qaDuration', label: 'Duration', sub: 'In the + menu' },
  ] },
  { title: 'Productivity', icon: MORE.gauge, group: 'Productivity', find: 'goal daily weekly days off vacation streak celebration', rows: [
    { heading: 'Set goals' },
    { key: 'dailyGoal', label: 'Daily goal', choices: goals(0, 1, 3, 5, 10, 20) },
    { key: 'weeklyGoal', label: 'Weekly goal', choices: goals(0, 10, 20, 25, 30, 50, 100) },
    { key: 'goalParty', label: 'Goal celebrations', sub: 'A little cheer when you reach a goal' },
    { heading: 'Days off' },
    { key: 'vacation', label: 'Vacation mode', sub: 'Your streak waits while you are away' },
  ] },
  { title: 'Reminders', icon: MORE.alarmClock, group: 'Productivity', find: 'automatic reminder time', rows: [
    { key: 'autoReminder', label: 'Send automatic reminders', sub: 'For a task given a time and no reminder',
      choices: [[-1, 'Off'], ...LEAD_MINUTES.map(n => /** @type {[unknown, string]} */ ([n, lead(n)]))] },
    { heading: 'Reminders not working?' },
  ] },
  { title: 'Notifications', icon: MORE.bell, group: 'Productivity', find: 'notify notifications alert permission push', rows: [
    { key: 'reminders', label: 'Notify me', sub: 'When a reminder is due, even with the app closed' },
  ] },
  { title: 'Features', icon: MORE.listChecks, sub: 'Switch optional parts on or off', group: 'More', visible: () => FEATURES.length > 0, rows: FEATURES },
];
