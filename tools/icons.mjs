// Dev tool: the app's icon. Writes app/public/icons/icon.svg (a gradient tile with soft light and a white disc with a bold red tick, drawn
// as filled shapes so it reads at home-screen size) and renders the PNGs the manifest and iOS ask for with Playwright's
// Chromium: icon-192.png, icon-512.png, icon-maskable-512.png (full bleed, the mark shrunk into the safe zone) and
// apple-touch-icon.png (180, square: iOS rounds it). Run it again after a change of colour or mark.
//
//   PW_CHROMIUM=/opt/pw-browsers/chromium node tools/icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'app/public/icons');

// Shared look of the core-app icons: diagonal gradient tile, soft top-left light, paper-white mark with a soft shadow.
const tile = ({ from, to, rx }) => `<defs><linearGradient id="bg" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`
  + `<radialGradient id="hi" cx=".25" cy="0" r="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>`
  + `<linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#eef1f6"/></linearGradient>`
  + `<filter id="sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity=".28"/></filter></defs>`
  + `<rect width="512" height="512" rx="${rx}" fill="url(#bg)"/><rect width="512" height="512" rx="${rx}" fill="url(#hi)"/>`;

// from/to: the tile's gradient; c: the mark's ink; glyph: the mark on the 512 square, centred on 256
const ART = { from: '#ef6a5b', to: '#b8302a', glyph: (/** @type {string} */ c) =>
    `<g filter="url(#sh)"><circle cx="256" cy="256" r="152" fill="url(#paper)"/></g>`
    + `<path d="M186 262 l48 48 l96 -100" fill="none" stroke="${c}" stroke-width="42" stroke-linecap="round" stroke-linejoin="round"/>` , c: '#d7463a' };

/** @param {{ rx: number, scale: number }} o  the corner radius, and the mark's size (1 = full) */
const svg = ({ rx, scale }) => {
  const at = 256 * (1 - scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${tile({ ...ART, rx })}`
    + `<g transform="translate(${at} ${at}) scale(${scale})">${ART.glyph(ART.c)}</g></svg>`;
};

const icon = svg({ rx: 112, scale: 1 }), square = svg({ rx: 0, scale: 1 }), maskable = svg({ rx: 0, scale: 0.8 });
fs.writeFileSync(path.join(OUT, 'icon.svg'), `${icon}\n`);

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  for (const [file, size, art] of /** @type {[string, number, string][]} */ ([
    ['icon-192.png', 192, icon], ['icon-512.png', 512, icon], ['icon-maskable-512.png', 512, maskable], ['apple-touch-icon.png', 180, square],
  ])) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${art}`);
    await page.screenshot({ path: path.join(OUT, file), omitBackground: true });
    console.log(`icons: ${file}`);
  }
} finally { await browser.close(); }
