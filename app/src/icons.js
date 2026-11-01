// The app's own icons (Lucide, https://lucide.dev, ISC licence): [tag, attributes] pairs, drawn by @core/ui's icon().
// Only the icons the first screen draws (startup budget); the later screens' are in icons-more.js. Add one by copying its
// nodes from lucide.dev; never an emoji or a text glyph.
/** @typedef {import('app-ui/icons/lucide.js').IconNodes} IconNodes */

/** @type {Record<string, IconNodes>} */
export const ICONS = {
  inbox: [['polyline', { points: '22 12 16 12 14 15 10 15 8 12 2 12' }], ['path', { d: 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z' }]],
  calendar: [['path', { d: 'M8 2v4' }], ['path', { d: 'M16 2v4' }], ['rect', { width: '18', height: '18', x: '3', y: '4', rx: '2' }], ['path', { d: 'M3 10h18' }]],
  plus: [['path', { d: 'M5 12h14' }], ['path', { d: 'M12 5v14' }]],
  // (Lucide's ellipsis as three rings, not dots: r 2, a thinner line)
  ellipsis: [['circle', { cx: '12', cy: '12', r: '2', 'stroke-width': '1.5' }], ['circle', { cx: '19', cy: '12', r: '2', 'stroke-width': '1.5' }], ['circle', { cx: '5', cy: '12', r: '2', 'stroke-width': '1.5' }]],
  hash: [['line', { 'x1': '4', 'x2': '20', 'y1': '9', 'y2': '9' }], ['line', { 'x1': '4', 'x2': '20', 'y1': '15', 'y2': '15' }], ['line', { 'x1': '10', 'x2': '8', 'y1': '3', 'y2': '21' }], ['line', { 'x1': '16', 'x2': '14', 'y1': '3', 'y2': '21' }]],
  tag: [['path', { d: 'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z' }], ['circle', { cx: '7.5', cy: '7.5', r: '.5', fill: 'currentColor' }]],
  repeat: [['path', { d: 'm17 2 4 4-4 4' }], ['path', { d: 'M3 11v-1a4 4 0 0 1 4-4h14' }], ['path', { d: 'm7 22-4-4 4-4' }], ['path', { d: 'M21 13v1a4 4 0 0 1-4 4H3' }]],
  listTree: [['path', { d: 'M21 12h-8' }], ['path', { d: 'M21 6H8' }], ['path', { d: 'M21 18h-8' }], ['path', { d: 'M3 6v4c0 1.1.9 2 2 2h3' }], ['path', { d: 'M3 10v6c0 1.1.9 2 2 2h3' }]],
  chevronDown: [['path', { d: 'm6 9 6 6 6-6' }]],
  chevronRight: [['path', { d: 'm9 18 6-6-6-6' }]],
  settings: [['path', { d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z' }], ['circle', { cx: '12', cy: '12', r: '3' }]],
  circleCheck: [['circle', { cx: '12', cy: '12', r: '10' }], ['path', { d: 'm9 12 2 2 4-4' }]],
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
  folderInput: [['path', { d: 'M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1' }], ['path', { d: 'M2 13h10' }], ['path', { d: 'm9 16 3-3-3-3' }]],
  listChecks: [['path', { d: 'm3 17 2 2 4-4' }], ['path', { d: 'm3 7 2 2 4-4' }], ['path', { d: 'M13 6h8' }], ['path', { d: 'M13 12h8' }], ['path', { d: 'M13 18h8' }]],
  menu: [['line', { 'x1': '4', 'x2': '20', 'y1': '12', 'y2': '12' }], ['line', { 'x1': '4', 'x2': '20', 'y1': '6', 'y2': '6' }], ['line', { 'x1': '4', 'x2': '20', 'y1': '18', 'y2': '18' }]],
  smartphone: [['rect', { width: '14', height: '20', x: '5', y: '2', rx: '2', ry: '2' }], ['path', { d: 'M12 18h.01' }]],
  target: [['circle', { cx: '12', cy: '12', r: '10' }], ['circle', { cx: '12', cy: '12', r: '6' }], ['circle', { cx: '12', cy: '12', r: '2' }]],
};
