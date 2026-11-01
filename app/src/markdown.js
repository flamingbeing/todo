// A task's words with a little markdown, shown (never stored differently): **bold** or __bold__, *italic* or _italic_,
// `code`, ~~struck~~, [words](https://…) and bare https:// links. Built as DOM nodes (text is only ever text, never
// HTML); links open in a new tab with rel=noopener. Within one line; anything else stays as typed. Pure parse, unit-tested.

/** @typedef {{ t: 'text', v: string } | { t: 'code', v: string } | { t: 'strong' | 'em' | 's', c: MdNode[] } | { t: 'a', href: string, c: MdNode[] }} MdNode */

/** the marks, earliest in the text first (a tie: the first here) @type {[MdNode['t'], RegExp][]} */
const RULES = [
  ['code', /`([^`\n]+)`/],
  ['a', /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/],
  ['a', /\bhttps?:\/\/[^\s<>()]*[^\s<>().,;:!?'"*_~]/],
  ['strong', /\*\*(?=\S)([^\n]*?\S)\*\*/],
  ['strong', /(?<![\p{L}\p{N}])__(?=\S)([^\n]*?\S)__(?![\p{L}\p{N}])/u],
  ['s', /~~(?=\S)([^\n]*?\S)~~/],
  ['em', /\*(?=[^\s*])([^*\n]*?[^\s*])\*/],
  ['em', /(?<![\p{L}\p{N}_])_(?=[^\s_])([^_\n]*?[^\s_])_(?![\p{L}\p{N}_])/u],
];

/** the text as marks @param {string} text @returns {MdNode[]} */
export function parseMarks(text) {
  /** @type {MdNode[]} */
  const out = [];
  let rest = String(text ?? '');
  while (rest) {
    /** @type {{ kind: MdNode['t'], m: RegExpExecArray } | null} */
    let best = null;
    for (const [kind, re] of RULES) {
      const m = re.exec(rest);
      if (m && (!best || m.index < best.m.index)) best = { kind, m };
    }
    if (!best) { out.push({ t: 'text', v: rest }); break; }
    const { kind, m } = best;
    if (m.index) out.push({ t: 'text', v: rest.slice(0, m.index) });
    if (kind === 'code') out.push({ t: 'code', v: m[1] });
    else if (kind === 'a') out.push(m[2] ? { t: 'a', href: m[2], c: parseMarks(m[1]) } : { t: 'a', href: m[0], c: [{ t: 'text', v: m[0] }] });
    else out.push({ t: /** @type {'strong' | 'em' | 's'} */ (kind), c: parseMarks(m[1]) });
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

/** whether the text has any mark (else it shows as typed) @param {string} text */
export const hasMarks = text => parseMarks(text).some(n => n.t !== 'text');

/** the marks as DOM nodes (links false: a link's words underlined, not a link, as in a row that is itself a button)
 * @param {MdNode[]} nodes @param {boolean} links @returns {Node[]} */
function build(nodes, links) {
  return nodes.map(n => {
    if (n.t === 'text') return document.createTextNode(n.v);
    if (n.t === 'code') { const e = document.createElement('code'); e.textContent = n.v; return e; }
    const e = document.createElement(n.t === 'a' && !links ? 'u' : n.t);
    if (n.t === 'a' && links) {
      const a = /** @type {HTMLAnchorElement} */ (e);
      a.href = n.href; a.target = '_blank'; a.rel = 'noopener noreferrer';
    }
    e.append(...build(n.c, links));
    return e;
  });
}

/** fills an element with the text's marks (only when it has some) @param {HTMLElement} into @param {string} text @param {{ links?: boolean }} [o] */
export function showMarks(into, text, { links = true } = {}) {
  const nodes = parseMarks(text);
  if (nodes.some(n => n.t !== 'text')) into.replaceChildren(...build(nodes, links));
}
