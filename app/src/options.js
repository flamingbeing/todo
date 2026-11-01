// The options this app allows (@core/settings): a name here is the only way a value reaches the device or the account.
// New options are off. A new app replaces these with its own.
import { cleanTabs } from '@core/ui';
import { ICONS } from './icons.js';

export const SETTINGS_COLL = 'settings';

/** @type {Record<string, import('app-ui/settings/types').OptionSpec>} */
export const OPTIONS = {
  // this device only: a phone and a computer can differ
  bigRows: { scope: 'device', default: false },
  // the person's account: every device they sign in on
  showCounts: { scope: 'account', default: false },
  // the tab bar's order and the tabs off it (this device; Settings, Tab bar)
  tabs: { scope: 'device', default: { order: [], hidden: [] }, clean: cleanTabs },
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
  { title: 'Tasks', icon: ICONS.listChecks, sub: 'Counts and row size', group: 'Tasks', rows: [
    { key: 'showCounts', label: 'Show task counts in Browse', sub: 'Every device; sign in to change it' },
    { key: 'bigRows', label: 'Larger rows', sub: 'This device' },
  ] },
  { title: 'Features', icon: ICONS.listChecks, sub: 'Switch optional parts on or off', group: 'Advanced', visible: () => FEATURES.length > 0, rows: FEATURES },
];
