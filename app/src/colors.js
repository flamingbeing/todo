// The colours a project, label or filter can have: the key is stored, the hex draws the hash, dot or tag. Twenty, in
// the order the colour list shows them; charcoal is the default.
/** @type {[key: string, name: string, hex: string][]} */
export const COLORS = [
  ['berry_red', 'Berry red', '#B8255F'], ['red', 'Red', '#DC4C3E'], ['orange', 'Orange', '#C77100'],
  ['yellow', 'Yellow', '#B29104'], ['olive_green', 'Olive green', '#949C31'], ['lime_green', 'Lime green', '#65A33A'],
  ['green', 'Green', '#369307'], ['mint_green', 'Mint green', '#42A393'], ['teal', 'Teal', '#148FAD'],
  ['sky_blue', 'Sky blue', '#319DC0'], ['light_blue', 'Light blue', '#6988A4'], ['blue', 'Blue', '#4180FF'],
  ['grape', 'Grape', '#692EC2'], ['violet', 'Violet', '#CA3FEE'], ['lavender', 'Lavender', '#A4698C'],
  ['magenta', 'Magenta', '#E05095'], ['salmon', 'Salmon', '#C9766F'], ['charcoal', 'Charcoal', '#808080'],
  ['grey', 'Grey', '#999999'], ['taupe', 'Taupe', '#8F7A69'],
];
export const DEFAULT_COLOR = 'charcoal';
const BY = new Map(COLORS.map(([k, name, hex]) => [k, { name, hex }]));

/** @param {unknown} key */
export const isColor = key => typeof key === 'string' && BY.has(key);
/** a colour key's hex (an unknown key draws as the default) @param {unknown} key */
export const colorHex = key => (BY.get(/** @type {string} */ (key)) ?? /** @type {{ hex: string }} */ (BY.get(DEFAULT_COLOR))).hex;
/** @param {unknown} key */
export const colorName = key => (BY.get(/** @type {string} */ (key)) ?? /** @type {{ name: string }} */ (BY.get(DEFAULT_COLOR))).name;
