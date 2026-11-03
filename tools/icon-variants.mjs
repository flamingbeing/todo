// Dev tool: the app icon's other colourways for Settings > App icon (option appIcon). Writes
// app/public/icons/variants/<id>.svg (the same mark as icons/icon.svg, own colours) and renders <id>.png at 180 px, square
// (iOS rounds it), the apple-touch-icon the page swaps in. Run it again after a change of colour or mark.
//
//   PW_CHROMIUM=/opt/pw-browsers/chromium node tools/icon-variants.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'app/public/icons/variants');
// Lucide circle-check (ISC licence), on a 24 grid, as tools/icons.mjs draws it
const MARK = '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>';
/** id: [ground, mark]; the ids are options.js APP_ICONS (default = icons/icon.svg) */
const VARIANTS = { night: ['#202020', '#dc4c3e'], paper: ['#f4efe6', '#3b352c'], mint: ['#1f8a70', '#fff'] };

/** @param {string} ground @param {string} mark @param {number} rx */
const svg = (ground, mark, rx) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${rx}" fill="${ground}"/>`
  + `<g transform="translate(100 100) scale(13)" fill="none" stroke="${mark}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${MARK}</g></svg>`;

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 180, height: 180 });
  for (const [id, [ground, mark]] of Object.entries(VARIANTS)) {
    fs.writeFileSync(path.join(OUT, `${id}.svg`), `${svg(ground, mark, 112)}\n`);
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:180px;height:180px}</style>${svg(ground, mark, 0)}`);
    await page.screenshot({ path: path.join(OUT, `${id}.png`), omitBackground: true });
    console.log(`icon variants: ${id}.svg, ${id}.png`);
  }
} finally { await browser.close(); }
